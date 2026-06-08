import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from "typeorm";

export enum GiftStatus {
  Pending  = 'Pending',
  Accepted = 'Accepted',
}

@Entity('user_gifts')
@Unique(['receiverId'])
export class UserGift {
  @PrimaryColumn({ type: 'char', length: 10, name: 'giver_id' })
  giverId: string;

  @Column({ type: 'char', length: 10, name: 'receiver_id' })
  receiverId: string;

  @Column({ type: 'text', name: 'entitlement_id' })
  entitlementId: string;

  @Column({ type: 'text', default: GiftStatus.Pending })
  status: GiftStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}