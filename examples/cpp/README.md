# C++ integration sample

One `main.cpp` that talks to oum over gRPC and runs the same flow as the C# and REST samples: authenticate a user, check `oum.admin`, list their grants and the users, and make sure `oum.admin`, `data.create`, `data.update` and `data.delete` exist. It prints one line per step and exits non-zero on failure.

The stubs are generated at build time from `packages/proto/open-user-management.proto`, so nothing generated is checked in.

Needs CMake, a C++17 compiler, gRPC and protobuf. On Debian or Ubuntu:

```bash
sudo apt install cmake libgrpc++-dev protobuf-compiler-grpc libprotobuf-dev
```

Build and run against an oum API with gRPC on 5581:

```bash
cmake -S . -B build
cmake --build build
./build/oum_check
```

Settings come from the environment: `OUM_TARGET` (default `127.0.0.1:5581`), `OUM_API_KEY`, `OUM_COMPANY_KEY`, `OUM_USER` and `OUM_PASSWORD` (defaults to the seed `admin` user). The sample uses an insecure channel, so for TLS swap in `grpc::SslCredentials`.

`Authenticate` answers `UNAUTHENTICATED` for a bad password; it grants nothing, so call `Check` for permissions.
