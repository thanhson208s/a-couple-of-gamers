import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CompleteMatchDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsIn([0, 1, 2])
  winner: 0 | 1 | 2;
}
