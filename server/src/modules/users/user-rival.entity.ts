import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { User } from './user.entity';
import { Game } from '../games/game.entity';

@Entity('user_rivals')
export class UserRival {
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id1' })
  userId1: string;

  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id2' })
  userId2: string;

  @PrimaryColumn({ type: 'text', name: 'game_id' })
  gameId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id1' })
  user1: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id2' })
  user2: User;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;

  // winCount/lossCount/drawCount are from userId1's perspective.
  // For coop: winCount = both won, lossCount = both lost, no draws.
  // For versus: winCount = userId1 beat userId2, lossCount = userId1 lost to userId2.
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
