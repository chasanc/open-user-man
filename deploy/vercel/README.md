# Vercel (web only)

Host `apps/web` on Vercel. Do **not** host `apps/api` here — Nest always binds gRPC.

## Project

- Root directory: `apps/web` **or** the monorepo root with `pnpm --filter @oum/web build`.
- Framework: Next.js. Node 24.
- Install: `pnpm install --frozen-lockfile`.

## Environment

```
NEXT_PUBLIC_API_URL=https://api.example.com/api
```

Optional same-origin rewrite instead of a public API URL: set the Vercel rewrite in `vercel.json` to the Nest HTTP origin, and leave `NEXT_PUBLIC_API_URL` empty so the browser uses `/api`.

Server-side fetches from Vercel to Nest need a reachable URL (`NEXT_PUBLIC_API_URL` or `API_INTERNAL_URL`).

Match `NEXT_PUBLIC_MULTI_COMPANY_MODE` with API `MULTI_COMPANY_MODE`.

## Rewrite example

`vercel.json` (this folder):

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.example.com/api/:path*"
    }
  ]
}
```

Replace the destination with your Nest HTTP origin. Cookies for `oum_token` only work if the rewrite stays on the Vercel site origin (same-site). Direct browser calls to a different API host need CORS + cookie domain work you should avoid in v1.
