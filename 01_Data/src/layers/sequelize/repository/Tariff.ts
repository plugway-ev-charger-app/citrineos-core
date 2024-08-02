// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

import { SequelizeRepository } from './Base';
import { ITariffRepository, TariffQueryString } from '../../../interfaces';
import { Tariff } from '../model/Tariff';
import { Sequelize } from 'sequelize-typescript';
import { SystemConfig } from '@citrineos/base';
import { ILogObj, Logger } from 'tslog';
import { Op } from 'sequelize';

export class SequelizeTariffRepository extends SequelizeRepository<Tariff> implements ITariffRepository {
  constructor(config: SystemConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, Tariff.MODEL_NAME, logger, sequelizeInstance);
  }

  async findByStationIds(stationIds: string[]): Promise<Tariff[] | undefined> {
    return super.readAllByQuery({
      where: {
        stationId: {
          [Op.in]: stationIds,
        },
      },
    });
  }

  async findByStationId(stationId: string): Promise<Tariff | undefined> {
    return super.readOnlyOneByQuery({
      where: {
        stationId: stationId,
      },
    });
  }

  async upsertTariff(tariffs: Tariff[]): Promise<Tariff[]> {
    return await this.s.transaction(async (transaction) => {
      const tariffDataToUpsert = tariffs.map(tariff => ({
        ...tariff.data,
        stationId: tariff.stationId,
      }));

      const upsertedTariffs = await Tariff.bulkCreate(tariffDataToUpsert, {
        updateOnDuplicate: [
          'currency', 'pricePerKwh', 'pricePerMin', 'pricePerSession',
          'taxRate', 'authorizationAmount', 'paymentFee', 'updatedAt'
        ],
        transaction
      });

      for (const tariff of upsertedTariffs) {
        if (tariff.isNewRecord) {
          this.emit('created', [tariff]);
        } else {
          this.emit('updated', [tariff]);
        }
      }

      return upsertedTariffs;
    });
  }

  async readAllByQuerystring(query: TariffQueryString): Promise<Tariff[]> {
    return super.readAllByQuery({
      where: {
        ...(query.id && { id: query.id }),
      },
    });
  }

  async deleteAllByQuerystring(query: TariffQueryString): Promise<Tariff[]> {
    if (!query.id) {
      throw new Error('Must specify at least one query parameter');
    }
    return super.deleteAllByQuery({
      where: {
        ...(query.id && { id: query.id }),
      },
    });
  }
}
