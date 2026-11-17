# Rust integration sample

One `src/main.rs` that talks to oum over gRPC with tonic and runs the same flow as the other samples: authenticate a user, check `oum.admin`, list their grants and the users, and make sure `oum.admin`, `data.create`, `data.update` and `data.delete` exist. It prints one line per step and exits non-zero on failure.

The client is generated at build time from `packages/proto/open-user-management.proto`. `build.rs` uses a vendored `protoc`, so you only need a Rust toolchain.

```bash
cargo run
```

Settings come from the environment: `OUM_TARGET` (default `http://127.0.0.1:5581`), `OUM_API_KEY`, `OUM_COMPANY_KEY`, `OUM_USER` and `OUM_PASSWORD` (defaults to the seed `admin` user). Each call sends the key and company key as gRPC metadata. For TLS, enable tonic's `tls` feature and use `ClientTlsConfig`.

`Authenticate` answers `UNAUTHENTICATED` for a bad password; it grants nothing, so call `Check` for permissions.
