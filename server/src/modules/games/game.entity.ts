import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('games')
export class Game {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'boolean', name: 'enabled', default: false })
  enabled: boolean;

  @Column({ type: 'text', name: 'bundle_url', nullable: true })
  bundleUrl: string | null;

  @Column({ type: 'text', name: 'bundle_version', nullable: true })
  bundleVersion: string | null;


}
