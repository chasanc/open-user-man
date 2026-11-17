import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateColumn, uuidColumn } from '../column-types.js';

/** Exactly one of userId / groupId is set. scopeId null means company-wide. */
@Entity({ schema: 'users', name: 'grant' })
export class GrantEntity {
  @PrimaryColumn({ name: 'id', ...uuidColumn() })
  id!: string;

  @Column({ name: 'user_id', ...uuidColumn({ nullable: true }) })
  userId!: string | null;

  @Column({ name: 'group_id', ...uuidColumn({ nullable: true }) })
  groupId!: string | null;

  @Column({ name: 'permission_id', ...uuidColumn() })
  permissionId!: string;

  @Column({ name: 'scope_id', ...uuidColumn({ nullable: true }) })
  scopeId!: string | null;

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;

  @Column({ name: 'created_by', ...uuidColumn({ nullable: true }) })
  createdBy!: string | null;
}
