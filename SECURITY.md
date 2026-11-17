# Security

Please report vulnerabilities privately through GitHub's "Report a vulnerability" button on the Security tab of this repository. Do not open a public issue for them.

Before running oum anywhere beyond your own machine:

- Change the seed `admin` / `changeme` password.
- Set a strong, unique `JWT_SECRET`. Never reuse it as `GRPC_API_KEY`.
- Enable gRPC TLS (`GRPC_TLS=true`) and set `GRPC_API_KEY`.
- Set `COOKIE_SECURE=true` behind HTTPS and `RATE_LIMIT_ENABLED=true`.
- Generate your own certificates with `deploy/certs/generate.sh`; never reuse sample keys.
