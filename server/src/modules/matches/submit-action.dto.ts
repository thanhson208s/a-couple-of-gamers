import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class SubmitActionDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsObject()
  action!: Record<string, unknown>;
}
