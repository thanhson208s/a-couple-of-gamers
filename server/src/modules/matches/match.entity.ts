import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Game } from '../games/game.entity';

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @Column({ type: 'text' })
  status: string; // 'active' | 'completed' | 'abandoned'

  @Column({ type: 'jsonb' })
  state: object;

  @Column({ type: 'jsonb', nullable: true })
  options: object | null;

  // Player 1 (creator if slot=1, joiner if creator chose slot=2)
  @Column({ type: 'char', length: 10, name: 'player1_id', nullable: true })
  player1Id: string | null;

  // Player 2
  @Column({ type: 'char', length: 10, name: 'player2_id', nullable: true })
  player2Id: string | null;

  @Column({ type: 'int', name: 'current_turn', nullable: true })
  currentTurn: number | null; // 1 or 2; null when game over

  @Column({ type: 'int', name: 'winner', nullable: true })
  winner: number | null; // 1, 2, or 0 for draw; null if not finished

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
