import { Type } from "class-transformer";
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export enum RcEventType {
  TEST = 'TEST',

  // Core events
  INITIAL_PURCHASE = 'INITIAL_PURCHASE',           // An user purchased a new subscription (1)
  CANCELLATION = 'CANCELLATION',                   // An user refunded a subscription
  NON_RENEWING_PURCHASE = 'NON_RENEWING_PURCHASE', // An user purchased a new subscription (2)
  PRODUCT_CHANGE = 'PRODUCT_CHANGE',               // An user switched to another subscription
  TRANSFER = 'TRANSFER',                           // Change of a subscription's owner ship
  EXPIRATION = 'EXPIRATION',
  
  // Situational events
  TEMPORARY_ENTITLEMENT_GRANT = 'TEMPORARY_ENTITLEMENT_GRANT',
  REFUND_REVERSED = 'REFUND_REVERSED',

  // Other events (likely never happen)
  RENEWAL = 'RENEWAL',
  UNCANCELLATION = 'UNCANCELLATION',
  SUBSCRIPTION_PAUSE = 'SUBSCRIPTION_PAUSED',
  BILLING_ISSUE = 'BILLING_ISSUE',
  SUBSCRIPTION_EXTENDED = 'SUBSCRIPTION_EXTENDED',
  INVOICE_ISSUANCE = 'INVOICE_ISSUANCE',
  VIRTUAL_CURRENCY_TRANSACTION = 'VIRTUAL_CURRENCY_TRANSACTION',
  EXPERIMENT_ENROLLMENT = 'EXPERIMENT_ENROLLMENT',
}

export enum CancelOrExpirationReason {
  // Main reasons
  UNSUBSCRIBE = 'UNSUBSCRIBE',
  CUSTOMER_SUPPORT = 'CUSTOMER_SUPPORT',
  
  // Other reasons (likely never happen)
  BILLING_ERROR = 'BILLING_ERROR',
  DEVELOPER_INITIATED = 'DEVELOPER_INITIATED',
  PRICE_INCREASE = 'PRICE_INCREASE',
  SUBSCRIPTION_PAUSED = 'SUBSCRIPTION_PAUSED',
  UNKNOWN = 'UNKNOWN',
}

export enum RcProductId {
  LITE_PASS_LIFETIME = 'lite_pass_lifetime',
  PRO_PASS_LIFETIME = 'pro_pass_lifetime',
  COUPLE_PASS_LIFETIME = 'couple_pass_lifetime',
}

export enum RcEntitlementId {
  REMOVE_ADS = 'remove_ads',
  EXTENDED_PREMIUM_ACCESS = 'extended_premium_access',
  UNLIMITED_PREMIUM_ACCESS = 'unlimited_premium_access',
}

export enum RcStore {
  TEST_STORE = 'TEST_STORE',
  PLAY_STORE = 'PLAY_STORE',
  APP_STORE = 'APP_STORE',
}

export class RcEventData {
  @IsNotEmpty()
  @IsEnum(RcEventType)
  type: RcEventType;

  @IsNotEmpty()
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  app_user_id: string;

  @IsEnum(RcProductId)
  product_id: RcProductId;

  @IsArray()
  @IsEnum(RcEntitlementId, { each: true })
  entitlement_ids: RcEntitlementId[];

  @IsString()
  transaction_id: string;

  @IsString()
  original_transaction_id: string;

  @IsNumber()
  purchase_at_ms: number;

  @IsEnum(RcStore)
  store: RcStore;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  transferred_from: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  transferred_to: string[]

  @IsOptional()
  @IsString()
  new_product_id: string;

  @IsOptional()
  @IsEnum(CancelOrExpirationReason)
  cancel_reason: CancelOrExpirationReason;

  @IsOptional()
  @IsEnum(CancelOrExpirationReason)
  expiration_reason: CancelOrExpirationReason;
}

export class RcWebhookDto {
  @IsString()
  api_version: string;

  @ValidateNested()
  @Type(() => RcEventData)
  @IsNotEmpty()
  event: RcEventData;
}