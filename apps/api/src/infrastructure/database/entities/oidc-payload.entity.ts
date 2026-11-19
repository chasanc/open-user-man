import { Column, Entity, PrimaryColumn } from 'typeorm';
import { databaseKindFromEnv, dateColumn, uuidColumn, varcharColumn } from '../column-types.js';
import { jsonTransformer } from './audit-log.entity.js';

/** One row per object the OpenID provider stores (session, grant, code, token, interaction). */
@Entity({ schema: 'users', name: 'oidc_payload' })
export class OidcPayloadEntity {
  @PrimaryColumn({ name: 'model', ...varcharColumn(50), nullable: false })
  model!: string;

  @PrimaryColumn({ name: 'id', ...varcharColumn(128), nullable: false })
  id!: string;

  @Column({
    name: 'payload',
    type: databaseKindFromEnv() === 'mssql' ? 'nvarchar' : 'jsonb',
    ...(databaseKindFromEnv() === 'mssql' ? { length: 'max' } : {}),
    transformer: jsonTransformer,
  })
  payload!: Record<string, unknown>;

  @Column({ name: 'grant_id', ...varcharColumn(128), nullable: true })
  grantId!: string | null;

  @Column({ name: 'uid', ...varcharColumn(128), nullable: true })
  uid!: string | null;

  @Column({ name: 'user_code', ...varcharColumn(128), nullable: true })
  userCode!: string | null;

  /** The oum user the object belongs to, so one statement can revoke everything of a user. */
  @Column({ name: 'user_id', ...uuidColumn({ nullable: true }) })
  userId!: string | null;

  @Column({ name: 'expires_at', ...dateColumn({ nullable: true }) })
  expiresAt!: Date | null;

  @Column({ name: 'consumed_at', ...dateColumn({ nullable: true }) })
  consumedAt!: Date | null;
}
