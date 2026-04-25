import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Game } from '../games/game.entity';

@Entity('user_favorites')
export class UserFavorite {
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'uuid', name: 'game_id' })
  gameId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;
}
