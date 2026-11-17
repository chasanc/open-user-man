import { Entity, PrimaryColumn } from 'typeorm';
import { uuidColumn } from '../column-types.js';

@Entity({ schema: 'users', name: 'user_group_member' })
export class UserGroupMemberEntity {
  @PrimaryColumn({ name: 'user_id', ...uuidColumn() })
  userId!: string;

  @PrimaryColumn({ name: 'group_id', ...uuidColumn() })
  groupId!: string;
}
