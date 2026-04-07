import { Entity, PrimaryColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('users')
@Unique(['provider', 'providerId'])
export class User {
  // 10-char server-generated ID. Used as PK, JWT sub, and client-facing identifier.
  // Charset: A-Z + 2-9 (base32, no ambiguous chars). Generated in UsersService.generateId().
  @PrimaryColumn({ type: 'char', length: 10 })
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
