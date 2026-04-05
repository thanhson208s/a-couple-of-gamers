import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('users')
@Unique(['provider', 'providerId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'text', name: 'provider_id' })
  providerId: string;

  @Column({ type: 'text', name: 'display_name' })
  displayName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
