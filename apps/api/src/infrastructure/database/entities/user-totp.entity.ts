import { Column, Entity, PrimaryColumn } from 'typeorm';
import { databaseKindFromEnv, dateColumn, textColumn, uuidColumn } from '../column-types.js';
import { jsonTransformer } from './audit-log.entity.js';

/** Two-step verification (TOTP) of one user. See the table comment in the 03_create_schema_users.sql files. */
@Entity({ schema: 'users', name: 'user_totp' })
export class UserTotpEntity {
  @PrimaryColumn({ name: 'user_id', ...uuidColumn() })
  userId!: string;

  /** AES-256-GCM, `iv.tag.ciphertext` in base64url. */
  @Column({ name: 'secret_enc', ...textColumn() })
  secretEnc!: string;

  @Column({ name: 'confirmed_at', ...dateColumn({ nullable: true }) })
  confirmedAt!: Date | null;

  /** bigint comes back as text from the drivers; a step fits a JS number for centuries. */
  @Column({
    name: 'last_step',
    type: 'bigint',
    transformer: { to: (value: number) => value, from: (value: string | number) => Number(value) },
  })
  lastStep!: number;

  @Column({
    name: 'recovery_hashes',
    type: databaseKindFromEnv() === 'mssql' ? 'nvarchar' : 'jsonb',
    ...(databaseKindFromEnv() === 'mssql' ? { length: 'max' } : {}),
    transformer: jsonTransformer,
  })
  recoveryHashes!: string[];

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;
}
