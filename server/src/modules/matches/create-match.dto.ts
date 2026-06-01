import { IsString, IsNotEmpty, IsIn, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  gameSlug: string;

  @IsIn([0, 1, 2])
  playerSlot: 0 | 1 | 2;

  @IsOptional()
  @IsBoolean()
  private?: boolean;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
