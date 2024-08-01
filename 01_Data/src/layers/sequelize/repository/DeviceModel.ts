// Copyright (c) 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

import {
  AttributeEnumType,
  type ComponentType,
  CrudRepository,
  DataEnumType,
  type GetVariableResultType,
  MutabilityEnumType,
  type ReportDataType,
  type SetVariableDataType,
  type SetVariableResultType,
  SetVariableStatusEnumType,
  SystemConfig,
  type VariableType,
} from '@citrineos/base';
import { SequelizeRepository } from './Base';
import { type IDeviceModelRepository, type VariableAttributeQuerystring } from '../../../interfaces';
import { Op } from 'sequelize';
import { Component, Evse, Variable, VariableAttribute, VariableCharacteristics, VariableStatus } from '../model/DeviceModel';
import { ComponentVariable } from '../model/DeviceModel/ComponentVariable';
import { Sequelize } from 'sequelize-typescript';
import { ILogObj, Logger } from 'tslog'; // TODO: Document this

// TODO: Document this

export class SequelizeDeviceModelRepository extends SequelizeRepository<VariableAttribute> implements IDeviceModelRepository {
  variable: CrudRepository<Variable>;
  component: CrudRepository<Component>;
  evse: CrudRepository<Evse>;
  variableCharacteristics: CrudRepository<VariableCharacteristics>;
  componentVariable: CrudRepository<ComponentVariable>;
  variableStatus: CrudRepository<VariableStatus>;

  constructor(
    config: SystemConfig,
    logger?: Logger<ILogObj>,
    sequelizeInstance?: Sequelize,
    variable?: CrudRepository<Variable>,
    component?: CrudRepository<Component>,
    evse?: CrudRepository<Evse>,
    componentVariable?: CrudRepository<ComponentVariable>,
    variableCharacteristics?: CrudRepository<VariableCharacteristics>,
    variableStatus?: CrudRepository<VariableStatus>,
  ) {
    super(config, VariableAttribute.MODEL_NAME, logger, sequelizeInstance);
    this.variable = variable ? variable : new SequelizeRepository<Variable>(config, Variable.MODEL_NAME, logger, sequelizeInstance);
    this.component = component ? component : new SequelizeRepository<Component>(config, Component.MODEL_NAME, logger, sequelizeInstance);
    this.evse = evse ? evse : new SequelizeRepository<Evse>(config, Evse.MODEL_NAME, logger, sequelizeInstance);
    this.componentVariable = componentVariable ? componentVariable : new SequelizeRepository<ComponentVariable>(config, ComponentVariable.MODEL_NAME, logger, sequelizeInstance);
    this.variableCharacteristics = variableCharacteristics ? variableCharacteristics : new SequelizeRepository<VariableCharacteristics>(config, VariableCharacteristics.MODEL_NAME, logger, sequelizeInstance);
    this.variableStatus = variableStatus ? variableStatus : new SequelizeRepository<VariableStatus>(config, VariableStatus.MODEL_NAME, logger, sequelizeInstance);
  }

  async createOrUpdateDeviceModelByStationId(value: ReportDataType, stationId: string, isoTimestamp: string): Promise<VariableAttribute[]> {
    // Doing this here so that no records are created if the data is invalid
    const variableAttributeTypes = value.variableAttribute.map((attr) => attr.type ?? AttributeEnumType.Actual);
    if (variableAttributeTypes.length !== new Set(variableAttributeTypes).size) {
      throw new Error('All variable attributes in ReportData must have different types.');
    }
    const [component, variable] = await this.findOrCreateEvseAndComponentAndVariable(value.component, value.variable, stationId);

    let dataType: DataEnumType | null = null;

    if (value.variableCharacteristics) {
      dataType = value.variableCharacteristics.dataType;
      const vc = VariableCharacteristics.build({
        ...value.variableCharacteristics,
        variableId: variable.id,
      });
      await this.s.transaction(async (transaction) => {
        const savedVariableCharacteristics = await this.s.models[VariableCharacteristics.MODEL_NAME].findOne({
          where: {
            variableId: variable.id,
          },
          transaction,
        });

        if (!savedVariableCharacteristics) {
          const createdVariableCharacteristics = await vc.save({ transaction });
          this.variableCharacteristics.emit('created', [createdVariableCharacteristics]);
          return createdVariableCharacteristics;
        } else {
          return await this.variableCharacteristics.updateAllByQuery(
            { ...vc },
            {
              where: {
                variableId: variable.id,
              },
              transaction,
            },
          );
        }
      });
    }

    return await Promise.all(
      value.variableAttribute.map(async (variableAttribute) => {
        const [savedVariableAttribute, variableAttributeCreated] = await this.readOrCreateByQuery({
          where: {
            // the composite unique index of VariableAttribute
            stationId: stationId,
            variableId: variable.id,
            componentId: component.id,
            type: variableAttribute.type ?? AttributeEnumType.Actual,
          },
          defaults: {
            // used to define what must be created in case nothing was found. If the defaults do not
            // contain values for every column, Sequelize will take the values given to where (if present).
            evseDatabaseId: component.evseDatabaseId,
            dataType,
            value: variableAttribute.value,
            generatedAt: isoTimestamp,
            mutability: variableAttribute.mutability ?? MutabilityEnumType.ReadWrite,
            persistent: variableAttribute.persistent ? variableAttribute.persistent : false,
            constant: variableAttribute.constant ? variableAttribute.constant : false,
          },
        });
        if (!variableAttributeCreated) {
          return (await this.updateByKey(
            {
              evseDatabaseId: component.evseDatabaseId,
              dataType: dataType ?? savedVariableAttribute.dataType,
              ...variableAttribute,
              generatedAt: isoTimestamp,
            },
            savedVariableAttribute.id,
          )) as VariableAttribute;
        }
        return savedVariableAttribute;
      }),
    );
  }

  async findOrCreateEvseAndComponentAndVariable(componentType: ComponentType, variableType: VariableType, stationId?: string): Promise<[Component, Variable]> {
    const component = await this.findOrCreateEvseAndComponent(componentType, stationId);

    const [variable] = await this.variable.readOrCreateByQuery({
      where: { name: variableType.name, instance: variableType.instance ? variableType.instance : null },
      defaults: {
        ...variableType,
      },
    });

    // TODO discuss & verify appropriate way to remove associations between components and variables (not currently possible)

    // This can happen asynchronously
    this.componentVariable.readOrCreateByQuery({
      where: { componentId: component.id, variableId: variable.id },
    });

    return [component, variable];
  }

  async findOrCreateEvseAndComponent(componentType: ComponentType, stationId?: string): Promise<Component> {
    const evse = componentType.evse
      ? (
          await this.evse.readOrCreateByQuery({
            where: {
              id: componentType.evse.id,
              connectorId: componentType.evse.connectorId ? componentType.evse.connectorId : null,
            },
          })
        )[0]
      : undefined;
    const [component, componentCreated] = await this.component.readOrCreateByQuery({
      where: { name: componentType.name, instance: componentType.instance ? componentType.instance : null,
        evseDatabaseId:evse ? evse.databaseId:null },
      defaults: {
        // Explicit assignment because evse field is a relation and is not able to accept a default value
        name: componentType.name,
        instance: componentType.instance,
      },
    });
    // Note: this permits changing the evse related to the component
    if (component.evseDatabaseId !== evse?.databaseId && evse) {
      await this.component.updateByKey({ evseDatabaseId: evse.databaseId }, component.get('id'));
    }
    if (componentCreated && stationId) {
      // Only execute if this method is called in the context of a specific station
      // Excerpt from OCPP 2.0.1 Part 1 Architecture & Topology - 4.2 :
      // "When a Charging Station does not report: Present, Available and/or Enabled
      // the Central System SHALL assume them to be readonly and set to true."
      // These default variables and their attributes are created here if the component is new,
      // and they will be overwritten if they are included in the update
      const defaultComponentVariableNames = ['Present', 'Available', 'Enabled'];
      for (const defaultComponentVariableName of defaultComponentVariableNames) {
        const [defaultComponentVariable, _defaultComponentVariableCreated] = await this.variable.readOrCreateByQuery({
          where: {
            name: defaultComponentVariableName,
            instance: null,
          },
        });
        // This can happen asynchronously
        this.componentVariable.readOrCreateByQuery({
          where: { componentId: component.id, variableId: defaultComponentVariable.id },
        });

        await this.create(
          VariableAttribute.build({
            stationId,
            variableId: defaultComponentVariable.id,
            componentId: component.id,
            evseDatabaseId: evse?.databaseId,
            dataType: DataEnumType.boolean,
            value: 'true',
            mutability: MutabilityEnumType.ReadOnly,
          }),
        );
      }
    }

    return component;
  }

  async createOrUpdateByGetVariablesResultAndStationId(getVariablesResult: GetVariableResultType[], stationId: string, isoTimestamp: string): Promise<VariableAttribute[]> {
    const savedVariableAttributes: VariableAttribute[] = [];
    for (const result of getVariablesResult) {
      const savedVariableAttribute = (
        await this.createOrUpdateDeviceModelByStationId(
          {
            component: {
              ...result.component,
            },
            variable: {
              ...result.variable,
            },
            variableAttribute: [
              {
                type: result.attributeType,
                value: result.attributeValue,
              },
            ],
          },
          stationId,
          isoTimestamp,
        )
      )[0];
      this.variableStatus.create(
        VariableStatus.build(
          {
            value: result.attributeValue,
            status: result.attributeStatus,
            statusInfo: result.attributeStatusInfo,
            variableAttributeId: savedVariableAttribute.get('id'),
          },
          { include: [VariableAttribute] },
        ),
      );
      savedVariableAttributes.push(savedVariableAttribute);
    }
    return savedVariableAttributes;
  }
  async findChargingStationById(stationId:string, connectorStatus:any, chargingStationAttributes:any,evseId?:number, connectorId?:number){
    console.log("Indisde findChargingStationById");
    const charingStationComponentPromise = this.component.readOnlyOneByQuery({where:{name:'ChargingStation'}});
    const evsePromise = this.evse.readOnlyOneByQuery({where:{id:evseId, connectorId:null}});
    const [chargingStationComponent, evse] = await Promise.all([charingStationComponentPromise,evsePromise]);
    console.log(chargingStationComponent);
    console.log("-----");
    console.log(evse);
    console.log("-----")
    const evseComponentPromise = this.component.readOnlyOneByQuery({where:{name:"EVSE", evseDatabaseId:evse?.databaseId}});
    const availabilityStatePromise = this.variable.readOnlyOneByQuery({where:{name:"AvailabilityState"}});
    const [evseComponent, availabilityState] = await Promise.all([evseComponentPromise,availabilityStatePromise]);
    console.log("evse component");
    console.log(evseComponent);
    console.log("Availability state")
    console.log(availabilityState);
    console.log("connector status");
    console.log(connectorStatus);
    const allEvse = await this.evse.readAllByQuery({where:{connectorId:null}});
    const evseDatabaseIds = allEvse.map((evse:any) => evse.databaseId);
    console.log("evseDatabaseIds")
    console.log(evseDatabaseIds);
    const allEvseComponent = await this.component.readAllByQuery({where:{evseDatabaseId:evseDatabaseIds}});
    const componentIds = allEvseComponent.map((component:any) => component.id);
    const allEvseComponentAvailabilityState = await this.readAllByQuery({where:{stationId, variableId: availabilityState?.id,componentId:componentIds}});
    
    if(connectorStatus && connectorStatus.length){
      const statusCount = connectorStatus.length;
      let availableCount = 0;
      let unavailableCount = 0;
      let reservedCount = 0;
      let faultedCount = 0;
      let occupiedCount = 0;
      for(let i= 0; i< connectorStatus.length; i++){
        let status = connectorStatus[i] as string;
        switch(status.toLowerCase()){
          case "available":
            availableCount++;
            break;
          case "unavailable":
            unavailableCount++;
            break;
          case "reserved":
            reservedCount++;
            break;
          case "faulted":
            faultedCount++;
            break;
          case "occupied":
            occupiedCount++;
            break;
        }
      }
      console.log("availableCount:" + availableCount);
      console.log("unavailableCount:" + unavailableCount);
      console.log("reservedCount:" + reservedCount);
      console.log("faultedCount:" + faultedCount);
      console.log("occupiedCount:" + occupiedCount);
      let evseStatus:string;
      if(reservedCount > 0){
        evseStatus = "Reserved";
      }
      else if(occupiedCount > 0){
        evseStatus  ="Occupied";
      }else if(unavailableCount === statusCount){
        evseStatus = "Unavailable";
      }else if(faultedCount === statusCount){
        evseStatus = "Faulted";
      }else{
        evseStatus = "Available";
      }
      console.log("last evse status")
      console.log(evseStatus);
      if(allEvseComponentAvailabilityState){
        console.log("All evse componenent availability state");
        console.log(allEvseComponentAvailabilityState);
        const allEvseStateCount = allEvseComponentAvailabilityState.length;
        let evseAvailableCount = 0;
        let evseUnavailableCount = 0;
        let evseReservedCount = 0;
        let evseFaultedCount = 0;
        let evseOccupiedCount = 0;
        for(let i = 0; i< allEvseComponentAvailabilityState.length;i++){
          if(allEvseComponentAvailabilityState[i].componentId === evseComponent?.id){
            continue;
          }
          let status = allEvseComponentAvailabilityState[i].value;
          switch(status?.toLowerCase()){
            case "available":
              evseAvailableCount++;
              break;
            case "unavailable":
              evseUnavailableCount++;
              break;
            case "reserved":
              evseReservedCount++;
              break;
            case "faulted":
              evseFaultedCount++;
              break;
            case "occupied":
              evseOccupiedCount++;
              break;
          }
        }
        switch(evseStatus?.toLowerCase()){
          case "available":
            evseAvailableCount++;
            break;
          case "unavailable":
            evseUnavailableCount++;
            break;
          case "reserved":
            evseReservedCount++;
            break;
          case "faulted":
            evseFaultedCount++;
            break;
          case "occupied":
            evseOccupiedCount++;
            break;
        }
        console.log("evseavailableCount:" + evseAvailableCount);
        console.log("evseunavailableCount:" + evseUnavailableCount);
        console.log("evsereservedCount:" + evseReservedCount);
        console.log("evsefaultedCount:" + evseFaultedCount);
        console.log("evseoccupiedCount:" + evseOccupiedCount);
      let chargerStatus:string;
      if(evseReservedCount == allEvseStateCount){
        chargerStatus = "Reserved";
      }
      else if(evseOccupiedCount ==  allEvseStateCount){
        chargerStatus  ="Occupied";
      }else if(evseUnavailableCount === allEvseStateCount){
        chargerStatus = "Unavailable";
      }else if(evseFaultedCount === allEvseStateCount){
        chargerStatus = "Faulted";
      }else{
        chargerStatus = "Available";
      }
      await this._updateAllByQuery(
            {value: chargerStatus}
          ,{where:{stationId, componentId:chargingStationComponent?.id, variableId:availabilityState?.id}});
        
      }
      await this._updateAllByQuery({value: evseStatus}, {where:{stationId, componentId:evseComponent?.id, variableId:availabilityState?.id}})
      console.log("Charger and evse status update successfull");
    }
  }
  async createOrUpdateBySetVariablesDataAndStationId(setVariablesData: SetVariableDataType[], stationId: string, isoTimestamp: string): Promise<VariableAttribute[]> {
    const savedVariableAttributes: VariableAttribute[] = [];
    for (const data of setVariablesData) {
      const savedVariableAttribute = (
        await this.createOrUpdateDeviceModelByStationId(
          {
            component: {
              ...data.component,
            },
            variable: {
              ...data.variable,
            },
            variableAttribute: [
              {
                type: data.attributeType,
                value: data.attributeValue,
              },
            ],
          },
          stationId,
          isoTimestamp,
        )
      )[0];
      savedVariableAttributes.push(savedVariableAttribute);
    }
    return savedVariableAttributes;
  }

  async updateResultByStationId(result: SetVariableResultType, stationId: string, isoTimestamp: string): Promise<VariableAttribute | undefined> {
    const savedVariableAttribute = await super.readOnlyOneByQuery({
      where: { stationId, type: result.attributeType ?? AttributeEnumType.Actual },
      include: [
        {
          model: Component,
          where: {
            name: result.component.name,
            instance: result.component.instance ? result.component.instance : null,
            evseDatabaseId: result.evseDatabaseId ? result.evseDatabaseId : null
          },
        },
        {
          model: Variable,
          where: {
            name: result.variable.name,
            instance: result.variable.instance ? result.variable.instance : null,
          },
        },
      ],
    });;
    if (savedVariableAttribute) {
      await this.variableStatus.create(
        VariableStatus.build({
          value: savedVariableAttribute.value,
          status: result.attributeStatus,
          statusInfo: result.attributeStatusInfo,
          variableAttributeId: savedVariableAttribute.get('id'),
        }),
      );
      if (result.attributeStatus !== SetVariableStatusEnumType.Accepted) {
        const mostRecentAcceptedStatus = (await this.variableStatus.readAllByQuery({
          where: { variableAttributeId: savedVariableAttribute.get('id'), status: SetVariableStatusEnumType.Accepted },
          limit: 1,
          order: [['createdAt', 'DESC']],
        }))[0];
        savedVariableAttribute.set('value', mostRecentAcceptedStatus?.value);
      }
      savedVariableAttribute.set('generatedAt', isoTimestamp);
      await savedVariableAttribute.save();
      // Reload in order to include the statuses
      return await savedVariableAttribute.reload({
        include: [VariableStatus],
      });
    } else {
      throw new Error('Unable to update variable attribute status...');
    }
  }

  async readAllSetVariableByStationId(stationId: string): Promise<SetVariableDataType[]> {
    const variableAttributeArray = await super.readAllByQuery({
      where: {
        stationId,
        bootConfigSetId: { [Op.ne]: null },
      },
      include: [{ model: Component, include: [Evse] }, Variable],
    });

    return variableAttributeArray.map((variableAttribute) => this.createSetVariableDataType(variableAttribute));
  }

  async readAllByQuerystring(query: VariableAttributeQuerystring): Promise<VariableAttribute[]> {
    const readQuery = this.constructQuery(query);
    readQuery.include.push(VariableStatus);
    return await super.readAllByQuery(readQuery);
  }

  async existByQuerystring(query: VariableAttributeQuerystring): Promise<number> {
    return await super.existByQuery(this.constructQuery(query));
  }

  async deleteAllByQuerystring(query: VariableAttributeQuerystring): Promise<VariableAttribute[]> {
    return await super.deleteAllByQuery(this.constructQuery(query));
  }

  async findComponentAndVariable(componentType: ComponentType, variableType: VariableType): Promise<[Component | undefined, Variable | undefined]> {
    const component = await this.component.readOnlyOneByQuery({
      where: { name: componentType.name, instance: componentType.instance ? componentType.instance : null },
    });
    const variable = await this.variable.readOnlyOneByQuery({
      where: { name: variableType.name, instance: variableType.instance ? variableType.instance : null },
    });
    if (variable) {
      const variableCharacteristics = await this.variableCharacteristics.readOnlyOneByQuery({
        where: { variableId: variable.get('id') },
      });
      variable.variableCharacteristics = variableCharacteristics;
    }

    return [component, variable];
  }

  async findEvseByIdAndConnectorId(id: number, connectorId: number | null): Promise<Evse | undefined> {
    const storedEvses = await this.evse.readAllByQuery({
      where: {
        // unique constraints
        id: id,
        connectorId: connectorId,
      },
    });
    return storedEvses.length > 0 ? storedEvses[0] : undefined;
  }

  async findVariableCharacteristicsByVariableNameAndVariableInstance(variableName: string, variableInstance: string | null): Promise<VariableCharacteristics | undefined> {
    const variableCharacteristics = await this.variableCharacteristics.readAllByQuery({
      include: [
        {
          model: Variable,
          where: {
            name: variableName,
            instance: variableInstance,
          },
        },
      ],
    });
    return variableCharacteristics.length > 0 ? variableCharacteristics[0] : undefined;
  }

  /**
   * Private Methods
   */

  private createSetVariableDataType(input: VariableAttribute): SetVariableDataType {
    if (!input.value) {
      throw new Error('Value must be present to generate SetVariableDataType from VariableAttribute');
    } else {
      return {
        attributeType: input.type,
        attributeValue: input.value,
        component: {
          ...input.component,
        },
        variable: {
          ...input.variable,
        },
      };
    }
  }

  private constructQuery(queryParams: VariableAttributeQuerystring): any {
    const evseInclude =
      queryParams.component_evse_id ?? queryParams.component_evse_connectorId
        ? {
            model: Evse,
            where: {
              ...(queryParams.component_evse_id ? { id: queryParams.component_evse_id } : {}),
              ...(queryParams.component_evse_connectorId ? { connectorId: queryParams.component_evse_connectorId } : {}),
            },
          }
        : Evse;
    const attributeType = queryParams.type && queryParams.type.toUpperCase() === 'NULL' ? null : queryParams.type;
    return {
      where: {
        ...(queryParams.stationId ? { stationId: queryParams.stationId } : {}),
        ...(queryParams.type === undefined ? {} : { type: attributeType }),
        ...(queryParams.value ? { value: queryParams.value } : {}),
        // TODO: Currently, the status param doesn't work since status of VariableAttribute are stored in
        //  VariableStatuses table separately. The table stores status history. We need find a proper way to filter it.
        ...(queryParams.status === undefined ? {} : { status: queryParams.status }),
      },
      include: [
        {
          model: Component,
          where: {
            ...(queryParams.component_name ? { name: queryParams.component_name } : {}),
            ...(queryParams.component_instance ? { instance: queryParams.component_instance } : {}),
          },
          include: [evseInclude],
        },
        {
          model: Variable,
          where: {
            ...(queryParams.variable_name ? { name: queryParams.variable_name } : {}),
            ...(queryParams.variable_instance ? { instance: queryParams.variable_instance } : {}),
          },
          include: [VariableCharacteristics],
        },
      ],
    };
  }
}
