import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { databaseKindFromEnv, dateColumn, uuidColumn, varcharColumn } from '../column-types.js';

/** jsonb on Postgres, JSON text (nvarchar max) on SQL Server; always an object in code. */
export const jsonTransformer = {
  to: (value: unknown) => JSON.stringify(value ?? {}),
  from: (value: unknown) =>
    typeof value === 'string' ? (JSON.parse(value) as Record<string, unknown>) : value,
};

@Entity({ schema: 'users', name: 'audit_log' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'audit_log_id' })
  auditLogId!: string;

  @Column({ name: 'company_id', ...uuidColumn({ nullable: true }) })
  companyId!: string | null;

  @Column({ name: 'entity_type', ...varcharColumn(30) })
  entityType!: string;

  @Column({ name: 'entity_id', ...uuidColumn() })
  entityId!: string;

  @Column({ name: 'event_type', ...varcharColumn(40) })
  eventType!: string;

  @Column({ name: 'actor_user_id', ...uuidColumn({ nullable: true }) })
  actorUserId!: string | null;

  @Column({ name: 'source', ...varcharColumn(10) })
  source!: 'rest' | 'grpc';

  @Column({
    name: 'payload',
    type: databaseKindFromEnv() === 'mssql' ? 'nvarchar' : 'jsonb',
    ...(databaseKindFromEnv() === 'mssql' ? { length: 'max' } : {}),
    transformer: jsonTransformer,
  })
  payload!: Record<string, unknown>;

  @Column({ name: 'created_date', ...dateColumn() })
  createdDate!: Date;
}
