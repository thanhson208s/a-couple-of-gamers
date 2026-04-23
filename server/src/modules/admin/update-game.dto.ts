import { IsEnum, IsOptional, IsString } from 'class-validator';
import { GameStatus } from '../games/game.entity';

export class UpdateGameDto {
  @IsOptional()
  @IsEnum(GameStatus)
  status: GameStatus;

  @IsOptional()
  @IsString()
  name: string;
}
