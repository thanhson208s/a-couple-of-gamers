import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('config')
export class Config {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb' })
  config: object;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'text', name: 'updated_by', nullable: true })
  updatedBy: string | null;
}
