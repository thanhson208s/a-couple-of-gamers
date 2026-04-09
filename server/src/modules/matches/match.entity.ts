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
  status: string; // 'pending' | 'active' | 'completed' | 'abandoned'

  @Column({ type: 'jsonb' })
  state: object;

  @Column({ type: 'jsonb', nullable: true })
  options: object | null;

  // Player 1 (creator) — exactly one of player1Id or player1GuestUuid is set
  @Column({ type: 'char', length: 10, name: 'player1_id', nullable: true })
  player1Id: string | null;

  @Column({ type: 'text', name: 'player1_guest_uuid', nullable: true })
  player1GuestUuid: string | null;

  // Player 2 (joiner) — all null until someone joins
  @Column({ type: 'char', length: 10, name: 'player2_id', nullable: true })
  player2Id: string | null;

  @Column({ type: 'text', name: 'player2_guest_uuid', nullable: true })
  player2GuestUuid: string | null;

  @Column({ type: 'int', name: 'current_turn', nullable: true })
  currentTurn: number | null; // 1 or 2; null when pending or game over

  @Column({ type: 'int', name: 'winner', nullable: true })
  winner: number | null; // 1, 2, or 0 for draw; null if not finished

  @Column({ type: 'text', name: 'invite_code', nullable: true, unique: true })
  inviteCode: string | null;

  @Column({ type: 'timestamptz', name: 'invite_code_expires_at', nullable: true })
  inviteCodeExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
