import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum GameStatus {
  UnderMaintenance = 0,
  ComingSoon = 1,
  Enabled = 2,
  Disabled = 3,
}

@Entity('games')
export class Game {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'int', default: GameStatus.ComingSoon })
  status: GameStatus; // 0=under_maintenance, 1=coming_soon, 2=enabled, 3=disabled
}
