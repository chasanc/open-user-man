# gRPC API (`oum.v1`)

The NestJS process exposes eight gRPC services on `GRPC_PORT` (default `5581`) alongside the REST API:

- `AuthService`
- `AccessService`
- `UserService`
- `UserGroupService`
- `PermissionService`
- `ScopeService`
- `CompanyService`
- `GrantService`

The protobuf contract lives in [`packages/proto/open-user-management.proto`](../packages/proto/open-user-management.proto). After editing the `.proto` file, regenerate the TypeScript definitions with `pnpm proto:generate`.

### Conventions

- All IDs are UUID v7 strings.
- List endpoints are paginated using `page_size` and `page_token`.
- Update requests use field masks so you only overwrite the fields you specify.
- Errors map to standard gRPC status codes: `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, and `FAILED_PRECONDITION`.

## Security layers

Keep each security layer and its secret separate:

| Layer | Configuration | Purpose |
| --- | --- | --- |
| **TLS** | `GRPC_TLS=true` + PEM file paths | Encrypts gRPC traffic on the wire. Disabled by default for local dev. |
| **App key** | `GRPC_API_KEY` (sent as `x-api-key` metadata) | Authenticates calling applications. Leaving it empty disables the check (local dev only). |
| **User auth** | `AuthService.Authenticate` | Verifies an end user's username and password. Call `AccessService.Check` separately for permissions. |
| **REST JWT** | `JWT_SECRET` | Signs admin console session cookies and REST bearer tokens only. Never reuse it for gRPC. |

In production, enable both **TLS** and **`GRPC_API_KEY`**. To generate local TLS certificates, run `pnpm certs:generate`.

## Testing and examples

See [`examples/grpc-client`](../examples/grpc-client) for a Node.js client that sends `x-api-key` and `company-key` metadata, authenticates a user, runs `Check`, and calls `ListGrantsForUser`.

You can also inspect and call services interactively with `grpcurl` or `grpcui`. Every gRPC operation has an equivalent REST endpoint under `/api/v1` (documented with OpenAPI at `/api/docs`), which is how the Next.js admin console talks to the API without speaking gRPC directly.
