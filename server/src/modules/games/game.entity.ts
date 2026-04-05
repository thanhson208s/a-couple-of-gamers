import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('games')
export class Game {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', name: 'is_preinstalled', default: false })
  isPreinstalled: boolean;

  @Column({ type: 'text', name: 'bundle_url', nullable: true })
  bundleUrl: string | null;
}
