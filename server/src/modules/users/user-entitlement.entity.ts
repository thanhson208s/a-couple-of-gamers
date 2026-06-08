import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { UserGift } from './user-gift.entity';

export enum EntitlementStore {
  PlayStore = 'play_store',
  AppStore  = 'app_store',
}

@Entity('user_entitlements')
export class UserEntitlement {
  @PrimaryColumn({ type: 'char', length: 10, name: 'user_id' })
  userId: string;
  
  @PrimaryColumn({ type: 'text', name: 'game_id' })
  entitlementId: string;
  
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  
  @Column({ type: 'text', name: 'store' })
  store: EntitlementStore;

  @Column({ type: 'text', name: 'original_transaction_id' })
  originalTransactionId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'char', name: 'gift_id', nullable: true })
  giftId: string | null;

  @ManyToOne(() => UserGift, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gift_id' })
  gift: UserGift | null;
}
