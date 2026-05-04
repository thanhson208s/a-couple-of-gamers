import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { User } from './user.entity';
import { Game } from '../games/game.entity';

@Entity('user_rivals')
export class UserRival {
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id1' })
  userId1: string;

  // No FK: when the opponent deletes their account, this row is kept so userId1's stats are preserved.
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id2' })
  userId2: string;

  @PrimaryColumn({ type: 'text', name: 'game_id' })
  gameId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id1' })
  user1: User;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;

  // Each pair (A, B) has two rows: (A,B) and (B,A).
  // winCount/lossCount/drawCount are always from userId1's perspective.
  @Column({
    type: 'int',
    name: 'match_count',
    generatedType: 'STORED',
    asExpression: `"win_count" + "loss_count" + "draw_count"`,
  })
  matchCount: number;

  @Column({ type: 'int', name: 'win_count', default: 0 })
  winCount: number;

  @Column({ type: 'int', name: 'loss_count', default: 0 })
  lossCount: number;

  @Column({ type: 'int', name: 'draw_count', default: 0 })
  drawCount: number;
}
