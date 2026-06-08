import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';

export type GraveExternalCleanup = {
  activeMatches: {
    matchId: string;
    player1Id: string;
    player2Id: string;
  }[];
};

@Entity('graves')
@Unique(['providerId'])
export class Grave {
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id' })
  userId: string;

  @Column({ type: 'text', name: 'provider_id' })
  providerId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'boolean', name: 'is_processed', default: false })
  isProcessed: boolean;

  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true, default: null })
  processedAt: Date | null;

  @Column({ type: 'jsonb', name: 'external_cleanup', nullable: true, default: null })
  externalCleanup: GraveExternalCleanup | null;
}
