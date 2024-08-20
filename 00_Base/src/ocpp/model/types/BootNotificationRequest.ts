// Copyright 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

import { BootReasonEnumType } from '../enums';
import { OcppRequest } from '../../..';

export interface BootNotificationRequest extends OcppRequest {
  customData?: CustomDataType | null;
  chargingStation: ChargingStationType;
  reason: BootReasonEnumType;
}
/**
 * This class does not get 'AdditionalProperties = false' in the schema generation, so it can be extended with arbitrary JSON properties to allow adding custom data.
 */
export interface CustomDataType {
  vendorId: string;
  [k: string]: unknown;
}
/**
 * Charge_ Point
 * urn:x-oca:ocpp:uid:2:233122
 * The physical system where an Electrical Vehicle (EV) can be charged.
 *
 */
export interface ChargingStationType {
  customData?: CustomDataType | null;
  /**
   * Device. Serial_ Number. Serial_ Number
   * urn:x-oca:ocpp:uid:1:569324
   * Vendor-specific device identifier.
   *
   */
  serialNumber?: string | null;
  /**
   * Device. Model. CI20_ Text
   * urn:x-oca:ocpp:uid:1:569325
   * Defines the model of the device.
   *
   */
  model: string;
  modem?: ModemType | null;
  /**
   * Identifies the vendor (not necessarily in a unique manner).
   *
   */
  vendorName: string;
  /**
   * This contains the firmware version of the Charging Station.
   *
   *
   */
  firmwareVersion?: string | null;
}
/**
 * Wireless_ Communication_ Module
 * urn:x-oca:ocpp:uid:2:233306
 * Defines parameters required for initiating and maintaining wireless communication with other devices.
 *
 */
export interface ModemType {
  customData?: CustomDataType | null;
  /**
   * Wireless_ Communication_ Module. ICCID. CI20_ Text
   * urn:x-oca:ocpp:uid:1:569327
   * This contains the ICCID of the modem’s SIM card.
   *
   */
  iccid?: string | null;
  /**
   * Wireless_ Communication_ Module. IMSI. CI20_ Text
   * urn:x-oca:ocpp:uid:1:569328
   * This contains the IMSI of the modem’s SIM card.
   *
   */
  imsi?: string | null;
}
