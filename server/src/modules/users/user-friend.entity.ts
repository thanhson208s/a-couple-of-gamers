import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { User } from './user.entity';

export enum FriendStatus {
  Pending  = 'pending',
  Accepted = 'accepted',
}

@Entity('user_friends')
export class UserFriend {
  @PrimaryColumn({ type: 'char', length: 10, name: 'requester_id' })
  requesterId: string;

  @PrimaryColumn({ type: 'char', length: 10, name: 'addressee_id' })
  addresseeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addressee_id' })
  addressee: User;

  @Column({ type: 'text', default: FriendStatus.Pending })
  status: FriendStatus;

  @Column({ type: 'timestamptz', name: 'accepted_at' })
  acceptedAt: Date;
}
