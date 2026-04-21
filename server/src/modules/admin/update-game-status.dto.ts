import { IsEnum } from 'class-validator';
import { GameStatus } from '../games/game.entity';

export class UpdateGameStatusDto {
  @IsEnum(GameStatus)
  status: GameStatus;
}
