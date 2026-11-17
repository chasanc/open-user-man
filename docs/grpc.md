# gRPC (`oum.v1`)

Eight services on `GRPC_PORT` (default **5581**), same Nest process as REST: `AuthService`, `AccessService`, `UserService`, `UserGroupService`, `PermissionService`, `ScopeService`, `CompanyService`, `GrantService`. Proto SSOT: [`packages/proto/open-user-management.proto`](../packages/proto/open-user-management.proto). Generate with `pnpm proto:generate`.

Ids are string UUIDs, lists are paginated (`page_size`, `page_token`), updates carry a field mask. Errors are gRPC codes: `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `FAILED_PRECONDITION`.

## Security (do not mix secrets)

| Layer | Env | Role |
| --- | --- | --- |
| TLS | `GRPC_TLS` + PEM paths | Encrypt the wire. Default off. |
| App key | `GRPC_API_KEY` as metadata `x-api-key` | Known integrating apps. Empty = no check (local). |
| User | `AuthService.Authenticate` | End-user password only. Ask `AccessService.Check` what they may do. |
| REST JWT | `JWT_SECRET` | Admin cookie only. **Not** for gRPC. |

Production: TLS **and** API key. Generate PEMs with `pnpm certs:generate`.

## Sample

[`examples/grpc-client`](../examples/grpc-client): send `x-api-key` and `company-key`, `Authenticate`, `Check`, `ListGrantsForUser`.

Inspect with `grpcurl` / grpcui. REST at `/api/v1` covers the same operations so the Next UI never speaks gRPC; its OpenAPI is at `/api/docs`.
