import { Column, Entity, PrimaryColumn } from 'typeorm';
import {
  binaryColumn,
  boolColumn,
  dateColumn,
  textColumn,
  uuidColumn,
  varcharColumn,
} from '../column-types.js';

@Entity({ schema: 'users', name: 'user_group' })
export class UserGroupEntity {
  @PrimaryColumn({ name: 'id', ...uuidColumn() })
  id!: string;

  @Column({ name: 'company_id', ...uuidColumn() })
  companyId!: string;

  @Column({ name: 'name', ...varcharColumn(200) })
  name!: string;

  @Column({ name: 'description', ...textColumn({ nullable: true }) })
  description!: string | null;

  @Column({ name: 'avatar', ...binaryColumn({ nullable: true }) })
  avatar!: Buffer | null;

  @Column({ name: 'active', ...boolColumn({ default: true }) })
  active!: boolean;

  @Column({ name: 'deleted_at', ...dateColumn({ nullable: true }) })
  deletedAt!: Date | null;

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;

  @Column({ name: 'updated_at', ...dateColumn() })
  updatedAt!: Date;
}
