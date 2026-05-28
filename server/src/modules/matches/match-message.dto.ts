import { IsNotEmpty, IsString } from 'class-validator';

export class MatchMessageDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;
}
