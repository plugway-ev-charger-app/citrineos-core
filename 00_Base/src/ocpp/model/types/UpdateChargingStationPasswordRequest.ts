// Copyright (c) 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

export interface UpdateChargingStationPasswordRequest {
  stationId: string;
  password?: string;
  setOnCharger: boolean;
}
