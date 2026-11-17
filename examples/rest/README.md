# REST integration sample

`run.sh` runs the same flow as the other samples with plain `curl` and `jq`: get a bearer token, check `oum.admin`, list the user's grants, list users, and make sure `oum.admin`, `data.create`, `data.update` and `data.delete` exist. It prints one line per step and exits non-zero on failure.

```bash
./run.sh
```

Settings come from the environment: `OUM_URL` (default `http://127.0.0.1:3001/api`), `OUM_USER` and `OUM_PASSWORD` (defaults to the seed `admin` user).

The token comes from `POST /api/auth/token` with `{username, password}`. It needs a valid password and the company-wide `oum.admin` grant, and sets no cookie. Send it as `Authorization: Bearer <token>`. Tokens expire, so request a new one on a 401. Resources live under `/api/v1/...`; the full list is in the Swagger UI at `/api/docs`.
