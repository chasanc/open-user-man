// Shapes of the REST v1 answers. Ids are UUID strings; lists are { items, nextPageToken }.
export type Row = { id: string; active?: boolean } & Record<string, unknown>;

export type UserRow = Row & {
  companyId: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
};

export type GroupRow = Row & { companyId: string; name: string; description?: string };

export type ApplicationRow = Row & {
  companyId: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tokenScopes: string[];
  grantTypes: string[];
};

export type PermissionRow = Row & { companyId: string; name: string; description?: string };

export type ScopeRow = Row & {
  companyId: string;
  parentId?: string;
  name: string;
  reference?: string;
  description?: string;
};

export type CompanyRow = Row & {
  companyKey: string;
  name: string;
  email?: string;
  contactPerson?: string;
  contactPhone?: string;
  requireMfa?: boolean;
};

export type GrantRow = {
  id: string;
  userId?: string;
  groupId?: string;
  permissionId: string;
  permissionName: string;
  scopeId?: string;
};

export type Page<T> = { items: T[]; nextPageToken: string };
