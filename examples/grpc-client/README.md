# gRPC client example (Node)

Runs the shared integration flow: authenticate a user, check a permission, list the user's grants, list users, and make sure four permissions exist. Exits non-zero on failure.

```bash
pnpm --filter @oum/grpc-client-example start
```

| Variable | Meaning |
| --- | --- |
| `GRPC_TARGET` | host:port (default `127.0.0.1:5581`) |
| `GRPC_API_KEY` | sent as `x-api-key` when the API requires it |
| `OUM_COMPANY_KEY` | sent as `company-key` in multi-company mode |
| `OUM_USER` / `OUM_PASSWORD` | credentials (seed: `admin` / `changeme`) |

The channel is insecure by default. Use TLS channel credentials once the server has `GRPC_TLS=true`.
