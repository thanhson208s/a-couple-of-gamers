import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

class PlatformVersionDto {
  @IsString()
  @IsNotEmpty()
  minSupportedVersion: string;

  @IsString()
  @IsNotEmpty()
  latestVersion: string;
}

class AppVersionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PlatformVersionDto)
  ios?: PlatformVersionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlatformVersionDto)
  android?: PlatformVersionDto;
}

class AccountLimitsDto {
  @IsNotEmpty()
  @IsInt()
  maxFavorites: number;

  @IsNotEmpty()
  @IsInt()
  maxFriends: number;

  @IsNotEmpty()
  @IsInt()
  maxConcurrentMatches: number;
}

class FeatureLimitsDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AccountLimitsDto)
  anonymous: AccountLimitsDto;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AccountLimitsDto)
  social: AccountLimitsDto;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AccountLimitsDto)
  dev: AccountLimitsDto;
}

export class UpdateConfigDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AppVersionDto)
  appVersion: AppVersionDto;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => FeatureLimitsDto)
  featureLimits: FeatureLimitsDto;
}
