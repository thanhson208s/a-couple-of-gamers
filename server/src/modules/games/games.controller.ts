import { Controller, Get, Param } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  listGames() {
    return this.gamesService.listGames();
  }

  @Get(':slug')
  getGame(@Param('slug') slug: string) {
    return this.gamesService.getGame(slug);
  }
}
