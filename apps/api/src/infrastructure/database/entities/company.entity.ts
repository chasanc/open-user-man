import { Column, Entity, PrimaryColumn } from 'typeorm';
import {
  boolColumn,
  dateColumn,
  textColumn,
  uuidColumn,
  varcharColumn,
} from '../column-types.js';

@Entity({ schema: 'users', name: 'company' })
export class CompanyEntity {
  @PrimaryColumn({ name: 'id', ...uuidColumn() })
  id!: string;

  @Column({ name: 'company_key', ...varcharColumn(50) })
  companyKey!: string;

  @Column({ name: 'name', ...textColumn() })
  name!: string;

  @Column({ name: 'email', ...varcharColumn(256), nullable: true })
  email!: string | null;

  @Column({ name: 'contact_person', ...textColumn({ nullable: true }) })
  contactPerson!: string | null;

  @Column({ name: 'contact_phone', ...textColumn({ nullable: true }) })
  contactPhone!: string | null;

  @Column({ name: 'active', ...boolColumn({ default: true }) })
  active!: boolean;

  @Column({ name: 'deleted_at', ...dateColumn({ nullable: true }) })
  deletedAt!: Date | null;

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;

  @Column({ name: 'updated_at', ...dateColumn() })
  updatedAt!: Date;
}
