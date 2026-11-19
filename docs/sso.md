# Signing Users In with oum (OpenID Connect)

Open User Man (`oum`) includes a built-in OpenID Connect (OIDC) provider so your web applications can offer a "Sign in with oum" experience. Users sign in with a single account and password, and your application receives their identity, company, groups, and permissions.

The OIDC provider stays disabled until you set `OIDC_ISSUER` (see [environment.md](environment.md)). It implements standard OpenID Connect (Authorization Code Flow with PKCE), so any compliant OIDC library works out of the box. If you only need backend permission checks over gRPC, see [integrate.md](integrate.md) instead.

**Jump to what you need:**

- **Operating oum:** [Quick start](#quick-start), [Production checklist](#production-checklist), [Two-step verification](#two-step-verification-totp)
- **Connecting an app:** [Settings for any OpenID client](#settings-for-any-openid-client), [Token scopes and claims](#token-scopes-and-claims), [Next.js (Auth.js)](#nextjs-authjs), [Troubleshooting](#troubleshooting)
- **Protocol details:** [Endpoints](#endpoints), [Signing out](#signing-out), [Conformance testing](#conformance-testing)

## Quick start

1. **Enable the OIDC provider.** Generate a signing key once per environment, add these three variables to `apps/api/.env`, and restart the API:

   ```bash
   node scripts/generate-oidc-key.mjs ./oidc-signing-key.json
   ```

   ```env
   OIDC_ISSUER=http://localhost:3001/oidc
   OIDC_COOKIE_KEYS=<random string>
   OIDC_SIGNING_KEY_PATH=./oidc-signing-key.json
   ```

   Verify that discovery works: `curl <issuer>/.well-known/openid-configuration` should return a JSON document.

2. **Register your application.** In the admin console, open **Applications** and add your app (see [Registering an application](#registering-an-application) below). Copy the generated client ID and client secret.

3. **Configure your app's OIDC client.** Pass the issuer URL, client ID, and client secret to your OpenID library, and request the token scopes `openid profile email groups permissions`. See [Settings for any OpenID client](#settings-for-any-openid-client).

4. **Test the sign-in flow.** Your app redirects users to `oum`'s login page. After entering their password (and a 6-digit code if two-step verification is active), `oum` redirects back to your callback URL with an authorization code that your app exchanges for tokens.

5. **Optional: enable two-step verification.** Set `TOTP_ENCRYPTION_KEY` in `apps/api/.env` and see [Two-step verification (TOTP)](#two-step-verification-totp).

## Registering an application

1. Open **Applications** in the admin console and click **Add**. Enter a name and one or more redirect URIs (for example, `https://app.example.com/api/auth/callback/oum`; plain `http://` is allowed only for `localhost`).
2. Copy the **client ID** and **client secret** immediately. The secret is shown only once and stored as a hash. If you lose it, click **Replace secret** to generate a new one; the previous secret stops working immediately.
3. Each application belongs to a single company, and only users in that company can sign in to it.

Deactivating an application blocks new sign-ins and token refreshes. Deactivating a user or company, or changing a user's password, immediately revokes all of that user's active `oum` sessions and tokens. Because access and refresh tokens are opaque and stored server-side, revocation takes effect right away with no waiting period.

## Endpoints

All OIDC endpoints live under your configured issuer URL (for example, `https://oum.example.com/oidc`). You can inspect the full metadata document at `<issuer>/.well-known/openid-configuration`.

| Purpose | Path |
| --- | --- |
| Authorization | `/auth` |
| Token exchange & refresh | `/token` (`client_secret_basic` or `client_secret_post`) |
| Userinfo | `/me` |
| Token revocation | `/token/revocation` |
| Public signing keys (JWKS) | `/jwks` |
| Sign out (RP-initiated logout) | `/session/end` |

PKCE (`S256`) is mandatory for every client, and ID tokens are signed with `ES256`. `oum` does not show an interactive consent screen: if a client sends `prompt=consent` (as OpenID Connect requires when requesting `offline_access`), `oum` automatically approves the registered token scopes.

## Signing out

To sign a user out of `oum`, redirect their browser to:

```
<issuer>/session/end?id_token_hint=<ID token>&post_logout_redirect_uri=<URI>&state=<state>
```

`oum` asks the user to confirm, ends their `oum` session, and redirects back to `post_logout_redirect_uri` with your `state` value. Make sure the redirect URI is listed under **Logout redirect URIs** in the application's settings.

Ending the session invalidates associated refresh tokens, and subsequent silent authorization requests (`prompt=none`) return `login_required`. Note that `oum` does not call back-channel or front-channel logout URLs on other applications; each app is responsible for clearing its own local session.

## Token scopes and claims

| Token scope | Returned claims |
| --- | --- |
| `openid` | `sub` (the user's `oum` ID) |
| `profile` | `name`, `given_name`, `family_name`, `preferred_username`, `user_key`, `company` (`{id, key, name}`) |
| `email` | `email` (when set on the user) |
| `groups` | `groups`: array of names of the user's active groups |
| `permissions` | `permissions`: array of `{permission, scope_id}` (`scope_id: null` means company-wide) |
| `offline_access` | Issues refresh tokens (also issued to clients allowed the `refresh_token` grant) |

`groups` and `permissions` are fetched live from the **userinfo** endpoint (`/me`) rather than embedded in the ID token. This keeps ID tokens small and ensures claims reflect current grants. Make sure these token scopes are both enabled on the application and requested by your client.

## Settings for any OpenID client

| Setting | Value |
| --- | --- |
| **Issuer / discovery URL** | `<issuer>` (most libraries append `/.well-known/openid-configuration` automatically) |
| **Client ID & client secret** | Copied from the application's page in the admin console |
| **Flow** | Authorization Code with PKCE `S256` (required) |
| **Token endpoint auth** | `client_secret_basic` or `client_secret_post` |
| **Redirect URI** | Must match a registered URI on the application exactly (no wildcards) |
| **Token scopes** | `openid profile email groups permissions` (add `offline_access` for refresh tokens) |
| **ID token algorithm** | `ES256` (public keys at `<issuer>/jwks`) |
| **Stable user identifier** | `sub` (the `oum` user ID; do not key accounts on email or username) |

## Manual curl example

```bash
# 1. Open in a browser (where code_challenge = base64url(sha256(verifier))):
<issuer>/auth?client_id=ID&redirect_uri=URI&response_type=code&scope=openid%20profile%20permissions\
&state=xyz&code_challenge=CHALLENGE&code_challenge_method=S256

# 2. After login, the browser redirects to URI?code=CODE&state=xyz. Exchange the code for tokens:
curl -u ID:SECRET <issuer>/token \
  -d grant_type=authorization_code \
  -d code=CODE \
  -d redirect_uri=URI \
  -d code_verifier=VERIFIER

# 3. Fetch the user's profile, groups, and permissions:
curl -H "Authorization: Bearer ACCESS_TOKEN" <issuer>/me

# 4. Refresh the access token:
curl -u ID:SECRET <issuer>/token \
  -d grant_type=refresh_token \
  -d refresh_token=REFRESH
```

## Next.js (Auth.js)

```ts
// auth.ts
import NextAuth from 'next-auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'oum',
      name: 'oum',
      type: 'oidc',
      issuer: process.env.OUM_ISSUER, // https://oum.example.com/oidc
      clientId: process.env.OUM_CLIENT_ID,
      clientSecret: process.env.OUM_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email groups permissions' } },
      checks: ['pkce', 'state'],
    },
  ],
  callbacks: {
    // Auth.js merges userinfo into the profile; copy the fields your app checks onto the JWT.
    jwt({ token, profile }) {
      if (profile) {
        token.groups = profile.groups;
        token.permissions = profile.permissions;
        token.company = profile.company;
      }
      return token;
    },
  },
});
```

Register `https://<your-app>/api/auth/callback/oum` as the redirect URI in `oum`. Because the JWT callback only runs at sign-in, the cached `groups` and `permissions` stay as fresh as the last login. Use a refresh token (or call `Check` over gRPC) when your app needs to react to permission changes immediately.

## Production checklist

- Serve `oum` over HTTPS and set `OIDC_ISSUER` to the public URL **including `/oidc`**. Outside local development, cookies are automatically marked `Secure`.
- When running behind a reverse proxy, load balancer, or Vercel rewrites, set `TRUST_PROXY` so the provider detects the public `https` scheme and rate limits see real client IPs.
- Protect `OIDC_COOKIE_KEYS` and the signing key (`OIDC_SIGNING_KEY_PATH`). To rotate cookie keys without signing users out, prepend the new key to the comma-separated list and keep the old key behind it until existing sessions expire.
- Keep in mind that `oum` does not implement cross-app single sign-out (back-channel/front-channel logout). Signing out through `/session/end` clears the `oum` session cookie, while each application clears its own session.

## Two-step verification (TOTP)

To enable TOTP two-step verification, set `TOTP_ENCRYPTION_KEY` to a random string of 32 or more characters in `apps/api/.env`. This key encrypts stored authenticator secrets, so keep it backed up. Changing or losing it locks out enrolled users until an administrator resets them.

**Admin-assisted setup:** Open a user's page in the admin console and click **Set up**. `oum` displays a QR code and secret key once. The user scans it with an authenticator app and enters the first 6-digit code, after which `oum` shows ten single-use recovery codes once. Going forward, both SSO sign-ins and admin console logins (via the `code` field) require either a current authenticator code or a recovery code. Each code can be used only once, and the resulting ID token includes `amr: ["pwd", "otp"]`.

**Self-service setup:** Users can also enroll themselves at `<issuer>/account/mfa` (for example, `https://oum.example.com/oidc/account/mfa`). The page is stateless and prompts for the username (plus the company key if the same username exists in multiple companies) and password at each step, displays the QR code, and verifies the first code. Users who are already enrolled cannot change their authenticator here; an administrator must reset it first.

> **Security note:** Because self-service enrollment only requires a username and password, an attacker who already has a user's password could enroll their own authenticator and lock the legitimate user out until an administrator resets it. Only share the self-service URL if that matches your threat model.

**Enforcement and recovery:**
- Enable **Require two-step verification** on a company to block sign-ins from users who have not enrolled yet.
- If a user loses their phone, click **Reset** on their user page to clear their enrollment and end all active sessions.
- If the sole administrator loses their phone, clear their enrollment directly in the database and re-enroll:

```sql
DELETE FROM users.user_totp WHERE user_id = '<user id>';
DELETE FROM users.oidc_payload WHERE user_id = '<user id>';
```

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `invalid_redirect_uri` or an `oum` error page at `/auth` | The redirect URI does not match the registered URI character-for-character (check trailing slashes and `http` vs `https`). |
| `invalid_request` mentioning `code_challenge` | The client did not send PKCE parameters. Enable PKCE (`S256`) in your OIDC library. |
| `invalid_client` at `/token` | Wrong client secret, deactivated application, or unsupported client auth method. If the secret was lost, click **Replace secret**. Repeated failures from one IP return HTTP `429` for one rate-limit window. |
| Sign-in fails with "Wrong username or password" | Either the password is incorrect or the user belongs to a different company than the application. The login page intentionally returns the same message for both. |
| `groups` or `permissions` are missing | Ensure those token scopes are both allowed on the application and requested by the client. They are returned from `/me` (userinfo), not inside the ID token. |
| No refresh token is returned | Request `offline_access`, pass `prompt=consent`, and make sure the `refresh_token` grant is enabled on the application. |
| `request_not_supported` error | Request objects and the `claims` parameter are intentionally disabled. Use token scopes instead. |
| Browser rejects the session cookie behind a proxy | Ensure `OIDC_ISSUER` uses the public `https://` URL and `TRUST_PROXY` is configured; otherwise `oum` treats the connection as plain HTTP. |
| API refuses to start | `OIDC_ISSUER` is set without `OIDC_COOKIE_KEYS` or `OIDC_SIGNING_KEY_PATH`. |
| Error: `"TOTP_ENCRYPTION_KEY must be set"` | Add `TOTP_ENCRYPTION_KEY` (32+ characters) to the API environment and restart. |

## Conformance testing

`oum` was tested locally against the OpenID Foundation conformance suite (Basic OP plan, static clients, discovery), though it has not been submitted for formal certification. During testing, the suite's scripted browser drove the sign-in form, and PKCE was temporarily relaxed via `OIDC_PKCE_OPTIONAL` because the Basic profile does not send PKCE.

- **Passing:** Authorization code flow with `client_secret_basic` and `client_secret_post`, userinfo, authorization code reuse rejection, `prompt=none`, `max_age`, `id_token_hint`, `GET` and `POST` authorization requests, and refresh tokens with `offline_access`.
- **Intentionally unsupported:** The `address` and `phone` token scopes, unsigned request objects (rejected with `request_not_supported`), and the `acr` claim (`oum` does not define levels of assurance; `amr` indicates how the user authenticated). The `claims` request parameter is also disabled so clients cannot request `groups` or `permissions` without having those token scopes allowed. The suite flags warnings for these, as well as for unpopulated `profile` claims (`picture`, `birthdate`, etc.) and `email_verified` (since `oum` does not verify email addresses).
- **Manually verified checks:** The suite delegates `prompt=login`, `max_age=1`, unregistered `redirect_uri`, and request objects with a redirect URI to manual screenshot verification. All four were verified by hand against the same server: each displays the expected sign-in or error page, and an unregistered `redirect_uri` is never redirected to.
