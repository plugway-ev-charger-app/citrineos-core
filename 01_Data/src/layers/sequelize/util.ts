// Copyright (c) 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

import { SystemConfig } from "@citrineos/base";
import { Dialect } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { ILogObj, Logger } from "tslog";
import { AdditionalInfo, Authorization, IdToken, IdTokenInfo } from "./model/Authorization";
import { Boot } from "./model/Boot";
import { Component, Evse, Variable, VariableAttribute, VariableCharacteristics, VariableStatus } from "./model/DeviceModel";
import { MeterValue, Transaction, TransactionEvent } from "./model/TransactionEvent";
import { SecurityEvent } from "./model/SecurityEvent";
import { ComponentVariable } from "./model/DeviceModel/ComponentVariable";

export class DefaultSequelizeInstance {

    /**
     * Fields
     */
    private static instance: Sequelize | null = null;

    private constructor() { }

    public static getInstance(config: SystemConfig, logger?: Logger<ILogObj>, sync: boolean = false): Sequelize {
        if (!DefaultSequelizeInstance.instance) {
            DefaultSequelizeInstance.instance = this.defaultSequelize(config, sync, logger);
        }
        return DefaultSequelizeInstance.instance;
    }

    private static defaultSequelize(config: SystemConfig, sync?: boolean, logger?: Logger<ILogObj>) {

        const sequelizeLogger = logger ? logger.getSubLogger({ name: this.name }) : new Logger<ILogObj>({ name: this.name });

        sequelizeLogger.info("Creating default Sequelize instance");

        const sequelize: Sequelize = new Sequelize({
            host: config.data.sequelize.host,
            port: config.data.sequelize.port,
            database: config.data.sequelize.database,
            dialect: config.data.sequelize.dialect as Dialect,
            username: config.data.sequelize.username,
            password: config.data.sequelize.password,
            storage: config.data.sequelize.storage,
            models: [AdditionalInfo, Authorization, Boot,
                Component, ComponentVariable, Evse, IdToken, IdTokenInfo, MeterValue,
                SecurityEvent, Transaction, TransactionEvent, VariableAttribute,
                VariableCharacteristics, VariableStatus, Variable],
            logging: (sql: string, timing?: number) => {
                // TODO: Look into fixing that
                // sequelizeLogger.debug(timing, sql);
            }
        });

        if (config.data.sequelize.sync && sync) {
            sequelize.sync({ force: true }).then(() => {
                sequelizeLogger.info("Database synchronized");
            });
        }

        return sequelize;
    }
}

