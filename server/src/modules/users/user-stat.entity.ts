import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { User } from './user.entity';
import { Game } from '../games/game.entity';

@Entity('user_stats')
export class UserStat {
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'text', name: 'game_id' })
  gameId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @Column({
    type: 'int',
    name: 'match_count',
    generatedType: 'STORED',
    asExpression: `"win_count" + "lost_count" + "draw_count"`
  })
  matchCount: number;

  @Column({ type: 'int', name: 'win_count', default: 0})
  winCount: number;

  @Column({ type: 'int', name: 'loss_count', default: 0})
  lossCount: number;

  @Column({ type: 'int', name: 'draw_count', default: 0})
  drawCount: number;
}
