# Guided Tour of oum

This guide walks through how the pieces of Open User Man (`oum`) fit together and the order in which to set them up. Each section includes a Mermaid diagram (rendered directly on GitHub) and links to the detailed reference page.

1. [The big picture](#the-big-picture)
2. [Choosing an integration path](#choosing-an-integration-path)
3. [First run: set oum up for your company](#first-run-set-oum-up-for-your-company)
4. [How access is decided (Check)](#how-access-is-decided-check)
5. [Sign in through oum (SSO)](#sign-in-through-oum-sso)
6. [What happens at the sign-in page](#what-happens-at-the-sign-in-page)
7. [Two-step verification](#two-step-verification)
8. [Changing and removing records](#changing-and-removing-records)
9. [Where oum runs](#where-oum-runs)

## The big picture

One NestJS process handles all traffic. The admin console communicates over REST, your backend services communicate over gRPC, and end users sign in to your web apps through the built-in OpenID Connect provider. Everything reads from and writes to a single database that you host.

```mermaid
flowchart LR
  admin([Administrator]) --> web[Admin console<br/>Next.js :3000]
  web -- "REST + cookie" --> api
  backend([Your backend]) -- "gRPC :5581<br/>API key / TLS" --> api
  user([End user]) --> app[Your web app]
  app -- "OpenID Connect<br/>(browser redirects)" --> api
  user -. "password + code" .-> api
  subgraph oum [One Nest process, port 3001]
    api[REST / gRPC / OIDC<br/>one set of services]
  end
  api --> db[(PostgreSQL or<br/>SQL Server<br/>schema users)]
  api --> audit[(audit_log<br/>same transaction)]
  audit --- db
```

Reference docs: [grpc.md](grpc.md), [integrate.md](integrate.md), [sso.md](sso.md), [database.md](database.md).

## Choosing an integration path

Use this chart to pick between OpenID Connect (SSO) and direct gRPC calls:

```mermaid
flowchart TD
  start([I want my app to use oum]) --> q1{Does the app have its own<br/>login screen today?}
  q1 -- "No, I want a<br/>'Sign in with oum' button" --> sso["OpenID Connect<br/>docs/sso.md"]
  q1 -- "Yes, it collects the password<br/>and calls my backend" --> q2{Backend language}
  q2 --> grpc["gRPC: Authenticate + Check<br/>docs/integrate.md<br/>samples in examples/"]
  sso --> perms{Needs permissions<br/>in the app?}
  perms -- "Yes" --> scopes["Request token scopes<br/>groups + permissions<br/>or call Check over gRPC"]
  perms -- "No, identity only" --> done([Done])
  grpc --> done
  scopes --> done
```

You can combine both approaches: let users sign in with SSO, and have your backend call `Check` over gRPC whenever you need fine-grained, real-time permission checks.

## First run: set oum up for your company

Complete these steps in order the first time you configure an environment. Each step builds on the previous one.

```mermaid
flowchart TD
  a["1. Run oum<br/>pnpm install, write-local-env, pnpm dev"] --> b["2. Sign in to the console<br/>admin / changeme, then change the password"]
  b --> c["3. Companies<br/>(only if MULTI_COMPANY_MODE=true)"]
  c --> d["4. Permissions<br/>the names your apps check, e.g. invoice.approve"]
  d --> e["5. Scopes<br/>a tree: where a permission applies<br/>(skip for company-wide only)"]
  e --> f["6. Users and Groups<br/>create people, put them in groups"]
  f --> g["7. Grants<br/>give a permission to a user or a group,<br/>company-wide or at a scope"]
  g --> h["8. Applications<br/>only for SSO: register the app,<br/>copy client ID and secret"]
  h --> i["9. Two-step verification<br/>optional, per user or required per company"]
```

To see how these records connect to each other, read [domain.md](domain.md#how-users-and-groups-relate-to-companies-scopes-and-applications).

**Tip:** Assign grants to **groups** rather than individual users. When someone joins or leaves a team, you only update their group membership and their access updates automatically.

## How access is decided (Check)

When your backend calls `Check`, it asks whether a specific user holds a specific permission (optionally at a specific scope). `oum` replies with `allowed` (`true` or `false`) and, when allowed, returns the grant that matched so every decision is traceable.

```mermaid
sequenceDiagram
  participant App as Your backend
  participant Oum as oum (gRPC)
  participant DB as Database
  App->>Oum: Authenticate(username, password)
  Oum-->>App: user id (UNAUTHENTICATED if wrong or inactive)
  App->>Oum: Check(user id, "invoice.approve", scope = Berlin)
  Oum->>DB: grants of the user + of the user's active groups
  DB-->>Oum: grants
  Oum->>Oum: a grant at Berlin or any ancestor<br/>(Germany, Europe, ...) matches?
  Oum-->>App: allowed = true, grant = group "Approvers" at Germany
```

Here is the decision logic `oum` follows for every `Check`:

```mermaid
flowchart TD
  c([Check: user, permission, scope?]) --> a{User, company and<br/>permission active?}
  a -- No --> deny([allowed = false])
  a -- Yes --> s{Scope given?}
  s -- "No" --> cw{Company-wide grant<br/>for user or a group?}
  s -- "Yes" --> tree{Grant at that scope or<br/>any ancestor scope?}
  cw -- Yes --> allow([allowed = true + matching grant])
  cw -- No --> deny
  tree -- Yes --> allow
  tree -- No --> cw2{Company-wide grant?}
  cw2 -- Yes --> allow
  cw2 -- No --> deny
```

There are no deny rules; if no grant matches, access is denied. Grants inherit **down** the scope tree, never up. For the full set of domain rules, see [domain.md](domain.md).

```mermaid
erDiagram
  COMPANY ||--o{ USER : has
  COMPANY ||--o{ USER_GROUP : has
  COMPANY ||--o{ PERMISSION : has
  COMPANY ||--o{ SCOPE : has
  USER }o--o{ USER_GROUP : "member of"
  GRANT }o--|| PERMISSION : gives
  GRANT }o--o| SCOPE : "at (empty = company-wide)"
  GRANT }o--o| USER : "to a user"
  GRANT }o--o| USER_GROUP : "or to a group"
```

## Sign in through oum (SSO)

`oum` includes a standard OpenID Connect provider. Your application never handles the user's password: the browser redirects to `oum`'s sign-in page and returns with a one-time authorization code that your app exchanges for tokens.

```mermaid
sequenceDiagram
  actor U as User
  participant B as Browser
  participant A as Your app
  participant O as oum /oidc
  U->>B: click "Sign in with oum"
  B->>A: GET /login
  A-->>B: redirect to oum /auth (client_id, PKCE challenge, token scopes, state)
  B->>O: GET /auth
  O-->>B: sign-in page
  U->>O: username, password (+ code if two-step is on)
  O-->>B: redirect to your redirect URI with ?code=...
  B->>A: GET /callback?code=...&state=...
  A->>O: POST /token (code, PKCE verifier, client secret)
  O-->>A: ID token + access token (+ refresh token)
  A->>O: GET /me (access token)
  O-->>A: name, company, groups, permissions
  A-->>B: signed in
```

To connect an app:

1. Open **Applications** in the admin console, register your app with its redirect URI, and save the client ID and client secret (the secret is shown only once).
2. Configure your OpenID client library with the issuer URL, client ID, client secret, PKCE enabled, and the token scopes `openid profile email groups permissions`.
3. Read `groups` and `permissions` from the userinfo endpoint (`/me`), or call `Check` over gRPC from your backend.

For the full settings table, a Next.js (Auth.js) example, and troubleshooting tips, see [sso.md](sso.md).

## What happens at the sign-in page

```mermaid
flowchart TD
  start([User submits username + password]) --> rl{Too many tries from<br/>this address or name?}
  rl -- Yes --> r429([Try again later])
  rl -- No --> ok{User exists, active, not removed,<br/>company active, password right?}
  ok -- No --> bad(["'Wrong username or password'<br/>(same message for every cause)"])
  ok -- Yes --> comp{SSO: user belongs to the<br/>application's company?}
  comp -- No --> bad
  comp -- Yes --> en{Two-step verification<br/>enrolled?}
  en -- Yes --> code{Authenticator code or<br/>recovery code correct?<br/>each code works once}
  code -- No --> bad2([Ask again])
  code -- Yes --> go([Signed in])
  en -- No --> req{Company requires<br/>two-step?}
  req -- Yes --> refuse([Refused: set up two-step first])
  req -- No --> go
```

## Two-step verification

```mermaid
flowchart LR
  subgraph setup [Set up once]
    s1["Admin: user page, Set up<br/>or user: &lt;issuer&gt;/account/mfa"] --> s2["QR code + key shown once"]
    s2 --> s3["Scan with an authenticator app,<br/>type the first code"]
    s3 --> s4["Ten recovery codes shown once"]
  end
  subgraph use [Every sign-in]
    u1["Password"] --> u2["6-digit code<br/>or a recovery code"]
  end
  subgraph lost [Lost phone]
    l1["Admin: Reset on the user page"] --> l2["Enrolment removed,<br/>sessions ended, set up again"]
  end
  setup --> use
  use -. "phone lost" .-> lost
```

Two-step verification requires `TOTP_ENCRYPTION_KEY` (32 or more random characters) in the API environment. Do not change this key after users have enrolled, or their existing secrets can no longer be decrypted. See [sso.md](sso.md#two-step-verification-totp) for setup details and self-service security considerations.

## Changing and removing records

```mermaid
stateDiagram-v2
  [*] --> Active: create
  Active --> Deactivated: Deactivate
  Deactivated --> Active: Activate
  Deactivated --> Removed: Remove (nothing may point at it)
  Removed --> [*]
  note right of Deactivated
    Hidden from lists and ignored by Check.
    Deactivating a user or company also ends
    their oum sessions and tokens immediately.
  end note
  note right of Removed
    Permanently deleted. The audit log keeps
    a snapshot (without password hashes).
  end note
```

Every update, deactivation, activation, and removal is written to `users.audit_log` in the same transaction, recording who made the change, what changed, and whether it came from REST or gRPC.

## Where oum runs

```mermaid
flowchart LR
  subgraph local [Local development]
    l1[pnpm dev] --> l2["web :3000 + API :3001 + gRPC :5581"]
    l2 --> l3[(Postgres or SQL Server)]
  end
  subgraph prod [Production]
    p0[HTTPS proxy or load balancer<br/>TRUST_PROXY set] --> p1[API container]
    p0 --> p2[Web container or Vercel]
    p1 --> p3[(Managed Postgres / Azure SQL)]
    p4[Your backends] -- "gRPC + TLS + API key" --> p1
  end
```

For Docker Compose, cloud, and Vercel instructions, see [deploy.md](deploy.md). For all environment variables, see [environment.md](environment.md).

## Pre-launch checklist

- [ ] Change the seeded `admin` password and set a strong `JWT_SECRET`.
- [ ] Enable gRPC TLS and set `GRPC_API_KEY`.
- [ ] Set `OIDC_ISSUER` to your public `https://` URL **including `/oidc`**, and configure `TRUST_PROXY` when running behind a proxy or load balancer.
- [ ] Back up `TOTP_ENCRYPTION_KEY` and your OIDC signing key securely.
- [ ] Assign permissions to groups rather than individual users, and create a second administrator account in case one loses their authenticator device.
