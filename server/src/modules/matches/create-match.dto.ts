import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  gameSlug: string;

  @IsIn([1, 2])
  playerSlot: 1 | 2;
}
