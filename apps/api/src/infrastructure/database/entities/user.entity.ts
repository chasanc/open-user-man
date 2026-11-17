import { Column, Entity, PrimaryColumn } from 'typeorm';
import {
  binaryColumn,
  boolColumn,
  dateColumn,
  textColumn,
  uuidColumn,
  varcharColumn,
} from '../column-types.js';

@Entity({ schema: 'users', name: 'user' })
export class UserEntity {
  @PrimaryColumn({ name: 'id', ...uuidColumn() })
  id!: string;

  @Column({ name: 'company_id', ...uuidColumn() })
  companyId!: string;

  @Column({ name: 'user_key', ...varcharColumn(50) })
  userKey!: string;

  @Column({ name: 'username', ...varcharColumn(200) })
  username!: string;

  @Column({ name: 'first_name', ...textColumn() })
  firstName!: string;

  @Column({ name: 'last_name', ...textColumn() })
  lastName!: string;

  @Column({ name: 'email', ...varcharColumn(256), nullable: true })
  email!: string | null;

  @Column({ name: 'mobile', ...varcharColumn(25), nullable: true })
  mobile!: string | null;

  @Column({ name: 'avatar', ...binaryColumn({ nullable: true }) })
  avatar!: Buffer | null;

  @Column({ name: 'password_hash', ...textColumn() })
  passwordHash!: string;

  @Column({ name: 'active', ...boolColumn({ default: true }) })
  active!: boolean;

  @Column({ name: 'deleted_at', ...dateColumn({ nullable: true }) })
  deletedAt!: Date | null;

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;

  @Column({ name: 'updated_at', ...dateColumn() })
  updatedAt!: Date;
}
