import { IsString, IsNotEmpty, IsIn, IsObject, IsOptional } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  gameSlug: string;

  @IsIn([1, 2])
  playerSlot: 1 | 2;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
