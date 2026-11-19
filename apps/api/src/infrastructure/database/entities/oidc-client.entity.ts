import { Column, Entity, PrimaryColumn, type ColumnOptions } from 'typeorm';
import {
  boolColumn,
  databaseKindFromEnv,
  dateColumn,
  textColumn,
  uuidColumn,
  varcharColumn,
} from '../column-types.js';
import { jsonTransformer } from './audit-log.entity.js';

/** jsonb on Postgres, JSON text on SQL Server; always a string array in code. */
const listColumn = (name: string): ColumnOptions => ({
  name,
  type: databaseKindFromEnv() === 'mssql' ? 'nvarchar' : 'jsonb',
  ...(databaseKindFromEnv() === 'mssql' ? { length: 'max' } : {}),
  transformer: jsonTransformer,
});

/** An application that signs users in through oum (OpenID Connect client). */
@Entity({ schema: 'users', name: 'oidc_client' })
export class OidcClientEntity {
  @PrimaryColumn({ name: 'id', ...uuidColumn() })
  id!: string;

  @Column({ name: 'company_id', ...uuidColumn() })
  companyId!: string;

  @Column({ name: 'client_id', ...varcharColumn(100) })
  clientId!: string;

  /** SHA-256 hex digest of the client secret. */
  @Column({ name: 'secret_hash', ...varcharColumn(128) })
  secretHash!: string;

  @Column({ name: 'name', ...textColumn() })
  name!: string;

  @Column(listColumn('redirect_uris'))
  redirectUris!: string[];

  @Column(listColumn('post_logout_redirect_uris'))
  postLogoutRedirectUris!: string[];

  /** OAuth token scopes (openid, profile, email), not oum Scopes. */
  @Column(listColumn('token_scopes'))
  tokenScopes!: string[];

  @Column(listColumn('grant_types'))
  grantTypes!: string[];

  @Column({ name: 'active', ...boolColumn({ default: true }) })
  active!: boolean;

  @Column({ name: 'deleted_at', ...dateColumn({ nullable: true }) })
  deletedAt!: Date | null;

  @Column({ name: 'created_at', ...dateColumn() })
  createdAt!: Date;

  @Column({ name: 'updated_at', ...dateColumn() })
  updatedAt!: Date;
}
