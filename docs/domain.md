# Domain

Open User Man (`oum`) administers **users**, **user groups**, **permissions** (access rights), **scopes** (where a permission applies), **grants** (who holds which permission where) and **companies** (tenants). Integrating apps ask one question: may this user have this permission here? That is the **Check**.

## Model

```
company ─┬─ user ──┬─ grant ── permission
         ├─ user_group ─┘        │
         │   └─ user_group_member (user ↔ group)
         ├─ permission           └── scope (optional; tree)
         └─ scope (tree)
```

| Thing | What it is |
| --- | --- |
| Permission | A named capability, for example `invoice.approve`. Names are dotted, lower case, unique per company. |
| Scope | A node in a tree that says where a grant applies. |
| Grant | Gives one permission to one user **or** one group, at one scope (or company-wide). |
| User group | A flat set of users. A group's grants reach all its members. |

## Rules

1. **Sign-in** succeeds for a user that exists, is active, is not deleted, belongs to an active company, and whose password matches (argon2id). There is no special login permission. The admin UI additionally requires the `oum.admin` permission, which is checked like any other. *Why: authentication and authorization are different questions; keeping them apart lets any app reuse sign-in.*
2. **Groups are flat.** A group grants exactly the grants attached to it. A user holds their own grants plus those of every active group they belong to. *Why: nested groups make "why does this user have this" hard to answer.*
3. **Scope inheritance runs down the tree.** A grant at scope S applies to S and every descendant of S. A grant with no scope applies company-wide. *Why: "Germany" should cover "Berlin" without listing every child.*
4. **A Check without a scope** counts company-wide grants only. A grant limited to Berlin does not answer a question that names no place.
5. **Grants are allow-only.** There are no deny rules, so an answer is always explainable by the grant that matched.
6. **Inactive or deleted** users, groups, scopes and companies contribute nothing. A deactivated row is kept (`deleted_at`) and can be activated again.
7. **Company confinement.** A Check never crosses companies. In multi-company mode a gRPC caller is confined to the company named by its `company-key` metadata.

A Check returns `allowed` and, when allowed, the grant that matched (its id, subject, scope), so approvals are explainable.

## Scopes

A **scope** is a named place in a tree that says *where* a grant applies. A permission answers "may this user do X"; a scope answers "where".

The tree is yours to shape. The seed has one root scope, `Application`, which cannot be removed. Typical shapes:

- **Application parts:** `Application` > `Billing`, `Reports`, `Admin`.
- **Customer or tenant areas:** `Application` > `Customer A` > `Plant 1`.
- **Geography:** `World` > `Europe` > `Germany` > `Berlin`.

### Using scopes as geolocations

A scope has no coordinates or map logic built in, so it works as a geolocation only because you model it that way:

1. Build a tree from broad to narrow: region, country, city, building.
2. Put the external identifier in `reference` (an ISO code, a site code, or `lat,lon`) and notes in `description`.
3. Grant a permission to a user or group at the scope they work in, for example `ticket.close` to `Berlin technicians` at `Berlin`.
4. When the app checks a user, pass the scope id of the place in question. Because grants flow down the tree, a grant at `Germany` also answers a Check at `Berlin`. You never list the children yourself.

In OAuth and OIDC a *scope* means something else (a token scope such as `openid`). Write "token scope" for that meaning.

## Deactivate and remove

Companies, users, user groups, permissions and scopes have two ways out:

- **Deactivate** sets `active = false` and `deleted_at`. The row leaves the lists (lists take `includeDeactivated` to show it) and **Activate** brings it back. Uniqueness (username, keys, permission name) applies to live rows only, so activating can fail if the name was taken meanwhile. A deactivated permission does not count in Check. A scope with live children cannot be deactivated.
- **Remove** deletes the row for good. It needs the row to be deactivated first and nothing to point at it (users and groups with grants or members, a scope with children or grants, a company with anything in it, a permission with grants). Otherwise the call fails with a precondition error. The audit log keeps a `remove` event with a full snapshot (never the password hash), the actor and the source.

REST: `POST /v1/<resource>/:id/deactivate`, `POST /v1/<resource>/:id/activate`, `DELETE /v1/<resource>/:id` (remove). gRPC: `Deactivate<X>`, `Activate<X>`, `Remove<X>`. Grants and group members are removed outright; the audit log keeps the record.

Existing databases need the permission columns (SQL Server uses the same idea with `[users].[permission]` and a filtered index):

```sql
ALTER TABLE users.permission ADD COLUMN active boolean NOT NULL DEFAULT true, ADD COLUMN deleted_at timestamptz;
ALTER TABLE users.permission DROP CONSTRAINT ux_permission_name;
CREATE UNIQUE INDEX ux_permission_name ON users.permission (company_id, name) WHERE deleted_at IS NULL;
```

## Multi-company

When `MULTI_COMPANY_MODE=true`, gRPC callers send `company-key` metadata and REST sessions carry the company of the signed-in user. Default off: the seeded company is used.

## Audit

Every change except an insert is written to `users.audit_log` in the same transaction as the change. Password data is never stored there.

See [integrate.md](integrate.md) for how an app signs users in and calls Check.
