export class UpsertTariffRequest{
    currency!: string;

    pricePerKwh!: number;
    pricePerMin?: number;
    pricePerSession?: number;
    taxRate?: number;
    
    authorizationAmount?: number;
    paymentFee?: number;
  }
