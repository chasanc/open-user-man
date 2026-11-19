# Integrating Your Application

Backend applications integrate with Open User Man (`oum`) over **gRPC** (`oum.v1`) on `GRPC_PORT` (default `5581`). The Next.js admin console uses **REST** on `HTTP_PORT` (default `3001`). Both APIs run inside the same NestJS process and share the same underlying services.

Choose the integration path that fits your app:

- **Web apps that want a "Sign in with oum" button:** use OpenID Connect. See [sso.md](sso.md).
- **Backend services that handle passwords and permission checks directly:** use the gRPC flow below.

## gRPC integration flow

1. **Connect to gRPC.** Use TLS when `GRPC_TLS=true` is enabled on the server (using the configured PEM certificates). Local development defaults to an unencrypted connection.
2. **Send your API key.** When `GRPC_API_KEY` is configured on the server, attach it in the `x-api-key` metadata header on every request. Leaving `GRPC_API_KEY` empty disables this check (for local development only).
3. **Identify the company (multi-company mode only).** If `MULTI_COMPANY_MODE=true`, send the `company-key` metadata header. Every call is then confined to that company.
4. **Authenticate the user.** Call `AuthService.Authenticate` with the user's username and password. `oum` returns `UNAUTHENTICATED` if the password is wrong or the user or company is inactive. This step verifies identity only; it does not check permissions.
5. **Check permissions.** Call `AccessService.Check` with the user ID, a permission name, and an optional scope ID. If access is allowed, the response includes the exact grant that matched.
6. **Keep secrets separate.** `JWT_SECRET` is used only for REST admin sessions. Do not use it as your gRPC API key, and do not forward the admin console cookie to backend apps.

## Permission checks

- Permission names are lowercase dotted strings you define, such as `invoice.approve`, and are unique per company.
- A grant assigned to a scope applies to that scope and all of its descendants. Calling `Check` without a scope matches company-wide grants only.
- Use `BatchCheck` to evaluate multiple permission checks in a single round trip (results return in the same order).
- Use `ListGrantsForUser` to fetch every grant a user holds (directly and through active groups) when your app prefers to cache claims.

## Working examples

Each example runs the same end-to-end flow and exits with a non-zero status on failure: it authenticates a user, checks `oum.admin`, lists the user's grants, lists all users, and ensures four sample permissions exist.

| Language | Path | Transport |
| --- | --- | --- |
| C# (.NET 10, layered) | [`examples/csharp`](../examples/csharp) | gRPC |
| C++ (CMake) | [`examples/cpp`](../examples/cpp) | gRPC |
| Rust (tonic) | [`examples/rust`](../examples/rust) | gRPC |
| Node.js | [`examples/grpc-client`](../examples/grpc-client) | gRPC |
| curl + jq | [`examples/rest`](../examples/rest) | REST bearer token |

To integrate from another language, generate a client from `packages/proto/open-user-management.proto`. Because permission names are plain strings on the wire, each client defines its own constants.

## Bootstrapping permissions

On first run, an application typically registers its permissions (such as `oum.admin`, `data.create`, `data.update`, and `data.delete` in the examples) and then grants them to users or groups, either company-wide or at a specific scope. Newly created users hold no permissions until you grant them.

## REST with a bearer token

HTTP clients that do not use cookies can call `POST /api/auth/token` with `{ "username", "password" }`. The account must have a valid password and a company-wide `oum.admin` grant. The endpoint returns `{ "accessToken", "tokenType": "Bearer" }` without setting a cookie and shares the standard login rate limit.

Send `Authorization: Bearer <accessToken>` on subsequent requests under `/api/v1`. The session cookie from `/api/auth/login` continues to work, and if a request includes both a cookie and a bearer token, the cookie takes precedence.

## REST admin session

The admin console signs in via `POST /api/auth/login`, which sets an `httpOnly` cookie named `oum_token`. The frontend never stores the JWT in `localStorage`.
