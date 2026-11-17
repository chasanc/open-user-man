# Integrating with Open User Man

Integrating applications talk **gRPC** (`oum.v1`) on `GRPC_PORT` (default 5581). The Next.js admin talks **REST** on `HTTP_PORT` (default 3001). Same Nest process, same services.

## Handshake

1. Connect with TLS when `GRPC_TLS=true` (PEM paths on the server). Local default is insecure.
2. Send metadata `x-api-key` when `GRPC_API_KEY` is set. Empty key means the interceptor is off (local only).
3. In multi-company mode send `company-key` metadata; the call is then confined to that company.
4. `AuthService.Authenticate` with the end-user password. It answers `UNAUTHENTICATED` for a bad password or an inactive user. It proves who the user is and nothing more.
5. `AccessService.Check` with the user id, a permission name and, optionally, a scope id. The answer carries the grant that matched.
6. `JWT_SECRET` is **not** used on gRPC. Do not send the admin cookie to integrating apps.

## Check

- Permission names are free-form dotted strings such as `invoice.approve`, unique per company.
- A grant at a scope applies to that scope and everything below it. A Check with no scope counts company-wide grants only.
- `BatchCheck` answers several checks in one round trip, in order. `ListGrantsForUser` returns every grant a user holds, directly and through groups, for apps that cache claims.

## Samples

Each sample runs the same flow and exits non-zero on failure: authenticate, check `oum.admin`, list the user's grants, list users, and ensure the four permissions below exist.

| Language | Path | Transport |
| --- | --- | --- |
| C# (.NET 10, layered) | [`examples/csharp`](../examples/csharp) | gRPC |
| C++ (CMake) | [`examples/cpp`](../examples/cpp) | gRPC |
| Rust (tonic) | [`examples/rust`](../examples/rust) | gRPC |
| Node | [`examples/grpc-client`](../examples/grpc-client) | gRPC |
| curl + jq | [`examples/rest`](../examples/rest) | REST with a bearer token |

Any other language can generate a client from `packages/proto/open-user-management.proto`. Permission names are plain strings on the wire, so each client defines its own constants.

## Bootstrap

Typical first run for an app: create its permissions (`oum.admin`, `data.create`, `data.update`, `data.delete` in the samples), then grant them to users or groups, at a scope if they apply to one part. New users hold nothing until granted.

## REST with a bearer token

Apps without a cookie jar call `POST /api/auth/token` with `{ "username", "password" }`. The user needs a valid password and the company-wide `oum.admin` grant. It returns `{ "accessToken", "tokenType": "Bearer" }` without setting a cookie and shares the login rate limit. Send `Authorization: Bearer <accessToken>` on every other call under `/api/v1`. The cookie from `/api/auth/login` still works, and the cookie wins if both are sent.

## REST admin session

`POST /api/auth/login` sets httpOnly cookie `oum_token`. The UI never stores the JWT in `localStorage`.
