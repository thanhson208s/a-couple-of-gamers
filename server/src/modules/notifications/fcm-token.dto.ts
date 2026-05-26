import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  platform: string;
}

export class DeleteFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
