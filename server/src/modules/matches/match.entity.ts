import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Game } from '../games/game.entity';
import { User } from '../users/user.entity';

export enum MatchStatus {
  Active = 'active',
  Completed = 'completed',
  Abandoned = 'abandoned',
}

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @Column({ type: 'text' })
  status: MatchStatus;

  @Column({ type: 'jsonb' })
  state: object;

  @Column({ type: 'jsonb', nullable: true })
  options: object | null;

  @Column({ type: 'char', length: 10, name: 'player1_id' })
  player1Id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player1_id' })
  player1: User;

  @Column({ type: 'char', length: 10, name: 'player2_id' })
  player2Id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player2_id' })
  player2: User;

  @Column({ type: 'int', name: 'winner', nullable: true })
  winner: 0 | 1 | 2 | null; // 1v1: 1=p1 wins, 2=p2 wins, 0=draw; coop: 1=both win, 0=both lose; null if not finished

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
