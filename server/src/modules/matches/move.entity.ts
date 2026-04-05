import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Match } from './match.entity';

@Entity('moves')
export class Move {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Match)
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ type: 'uuid', name: 'player_id', nullable: true })
  playerId: string | null;

  @Column({ type: 'text', name: 'guest_uuid', nullable: true })
  guestUuid: string | null;

  @Column({ type: 'jsonb', name: 'move_data' })
  moveData: object;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
