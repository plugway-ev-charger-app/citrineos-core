// Copyright (c) 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

import {
  Tariff,
  TariffQuerySchema,
  TariffQueryString,
  TariffSchema,
  TransactionEventQuerySchema,
  TransactionEventQuerystring,
} from '@citrineos/data';
import { ILogObj, Logger } from 'tslog';
import { ITransactionsModuleApi } from './interface';
import { TransactionsModule } from './module';
import {
  AbstractModuleApi,
  AsDataEndpoint,
  AsMessageEndpoint,
  CallAction,
  CostUpdatedRequest,
  CostUpdatedRequestSchema,
  GetTransactionStatusRequest,
  GetTransactionStatusRequestSchema,
  HttpMethod,
  IMessageConfirmation,
  Namespace,
  TransactionType,
} from '@citrineos/base';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { UpsertTariffRequest } from "./model/tariffs";
import { plainToInstance } from 'class-transformer';

/**
 * Server API for the transaction module.
 */
export class TransactionsModuleApi
  extends AbstractModuleApi<TransactionsModule>
  implements ITransactionsModuleApi
{
  /**
   * Constructor for the class.
   *
   * @param {TransactionModule} transactionModule - The transaction module.
   * @param {FastifyInstance} server - The server instance.
   * @param {Logger<ILogObj>} [logger] - Optional logger.
   */
  constructor(
    transactionModule: TransactionsModule,
    server: FastifyInstance,
    logger?: Logger<ILogObj>,
  ) {
    super(transactionModule, server, logger);
  }

  /**
   * Message Endpoint Methods
   */
  @AsMessageEndpoint(CallAction.CostUpdated, CostUpdatedRequestSchema)
  async costUpdated(
    identifier: string,
    tenantId: string,
    request: CostUpdatedRequest,
    callbackUrl?: string,
  ): Promise<IMessageConfirmation> {
    return this._module.sendCall(
      identifier,
      tenantId,
      CallAction.CostUpdated,
      request,
      callbackUrl,
    );
  }

  @AsMessageEndpoint(
    CallAction.GetTransactionStatus,
    GetTransactionStatusRequestSchema,
  )
  getTransactionStatus(
    identifier: string,
    tenantId: string,
    request: GetTransactionStatusRequest,
    callbackUrl?: string,
  ): Promise<IMessageConfirmation> {
    return this._module.sendCall(
      identifier,
      tenantId,
      CallAction.GetTransactionStatus,
      request,
      callbackUrl,
    );
  }

  @AsDataEndpoint(
    Namespace.TransactionType,
    HttpMethod.Get,
    TransactionEventQuerySchema,
  )
  getTransactionByStationIdAndTransactionId(
    request: FastifyRequest<{ Querystring: TransactionEventQuerystring }>,
  ): Promise<TransactionType | undefined> {
    return this._module.transactionEventRepository.readTransactionByStationIdAndTransactionId(
      request.query.stationId,
      request.query.transactionId,
    );
  }

  // TODO: Determine how to implement readAllTransactionsByStationIdAndChargingStates as a GET...
  // TODO: Determine how to implement existsActiveTransactionByIdToken as a GET...

  // @AsDataEndpoint(
  //   Namespace.Tariff,
  //   HttpMethod.Put,
  //   undefined,
  //   TariffSchema,
  // )
  // async upsertTariff(
  //   request: FastifyRequest<{
  //     Body: any;
  //   }>,
  // ): Promise<Tariff> {
  //   const tariff = this.buildTariff(plainToInstance(UpsertTariffRequest, request.body));
  //   return await this._module.tariffRepository.upsertTariff(tariff);
  // }

  @AsDataEndpoint(
    Namespace.Tariff,
    HttpMethod.Put,
    undefined,
    undefined
  )
  async upsertTariffs(
    request: FastifyRequest<{
      Body: {
        stationIds: string[];
        tariffData: UpsertTariffRequest;
      };
    }>,
  ): Promise<Tariff[]> {
    const { stationIds, tariffData } = request.body;
    const tariffs = stationIds.map((stationId: string) => this.buildTariff(stationId, tariffData));
    return await this._module.tariffRepository.upsertTariff(tariffs);
  }

  public buildTariff(stationId: string, request: UpsertTariffRequest): Tariff {
    return Tariff.newInstance({
      stationId,
      currency: request.currency,
      pricePerKwh: request.pricePerKwh,
      pricePerMin: request.pricePerMin,
      pricePerSession: request.pricePerSession,
      taxRate: request.taxRate,
      authorizationAmount: request.authorizationAmount,
      paymentFee: request.paymentFee,
    });
  }

  @AsDataEndpoint(Namespace.Tariff, HttpMethod.Get, TariffQuerySchema)
  getTariffs(
    request: FastifyRequest<{ Querystring: TariffQueryString }>,
  ): Promise<Tariff[]> {
    return this._module.tariffRepository.readAllByQuerystring(request.query);
  }

  @AsDataEndpoint(Namespace.Tariff, HttpMethod.Delete, TariffQuerySchema)
  deleteTariffs(
    request: FastifyRequest<{ Querystring: TariffQueryString }>,
  ): Promise<string> {
    return this._module.tariffRepository
      .deleteAllByQuerystring(request.query)
      .then(
        (deletedCount: { toString: () => string }) =>
          deletedCount.toString() +
          ' rows successfully deleted from ' +
          Namespace.Tariff,
      );
  }

  /**
   * Overrides superclass method to generate the URL path based on the input {@link CallAction} and the module's endpoint prefix configuration.
   *
   * @param {CallAction} input - The input {@link CallAction}.
   * @return {string} - The generated URL path.
   */
  protected _toMessagePath(input: CallAction): string {
    const endpointPrefix =
      this._module.config.modules.transactions.endpointPrefix;
    return super._toMessagePath(input, endpointPrefix);
  }

  /**
   * Overrides superclass method to generate the URL path based on the input {@link Namespace} and the module's endpoint prefix configuration.
   *
   * @param {CallAction} input - The input {@link Namespace}.
   * @return {string} - The generated URL path.
   */
  protected _toDataPath(input: Namespace): string {
    const endpointPrefix =
      this._module.config.modules.transactions.endpointPrefix;
    return super._toDataPath(input, endpointPrefix);
  }
}
