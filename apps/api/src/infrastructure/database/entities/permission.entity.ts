import { Column, Entity, PrimaryColumn } from 'typeorm';
import { boolColumn, dateColumn, textColumn, uuidColumn, varcharColumn } from '../column-types.js';

@Entity({ schema: 'users', name: 'permission' })
export class PermissionEntity {
  @PrimaryColumn({ name: 'id', ...uuidColumn() })
  id!: string;

  @Column({ name: 'company_id', ...uuidColumn() })
  companyId!: string;

  @Column({ name: 'name', ...varcharColumn(100) })
  name!: string;

  @Column({ name: 'description', ...textColumn({ nullable: true }) })
  description!: string | null;

  @Column({ name: 'active', ...boolColumn({ default: true }) })
  active!: boolean;

  @Column({ name: 'deleted_at', ...dateColumn({ nullable: true }) })
  deletedAt!: Date | null;

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;

  @Column({ name: 'updated_at', ...dateColumn() })
  updatedAt!: Date;
}
