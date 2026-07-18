# Per-user authentication with password reset

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Replace the shared-password auth model with per-user accounts, add email-based password reset, and scope all recipes and tags to their owner.

## 1. Goals

- Users register with an email + password and immediately get a logged-in session.
- Users log in with email + password.
- Users who forget their password can request a reset link by email.
- Each user's recipe library (and tag set) is strictly isolated from other users.
- The new auth pages match the existing visual style of the app.

## 2. Non-goals

- Email verification at registration time.
- Admin roles, invite tokens, or controlled registration. Registration is open.
- Sharing recipes between users.
- revoking existing sessions after a password reset (stateless sessions; accepted limitation).
- Migration of existing recipes. Per user decision, the database is wiped on upgrade.

## 3. Architecture overview

The `APP_PASSWORD` shared-password model is **removed**. A new `users` table backs all auth. The `src/auth/` module grows to handle registration, login, password reset, SMTP email, and rate limiting. Recipe and tag isolation is enforced structurally via a per-request repository bound to the current `user_id`.

### New modules under `src/auth/`

| Module | Responsibility |
|---|---|
| `users.ts` | `users` table CRUD: `create`, `findByEmail`, `getById`. Email uniqueness enforced case-insensitively. |
| `password.ts` | `hashPassword(plain)` → `{ hash, salt }`; `verifyPassword(plain, hash, salt)`. Uses `node:crypto` scrypt, 16-byte salt, constant-time compare. No new dependencies. |
| `reset.ts` | Issue/verify/consume password-reset tokens. 32 random bytes, base64url, stored as SHA-256 hash. 1-hour expiry. Single-use. |
| `email.ts` | Minimal SMTP client over `node:net`/`node:tls`. Supports implicit TLS (port 465) and STARTTLS (port 587). AUTH PLAIN/LOGIN. No new dependencies. |
| `rate-limit.ts` | In-memory per-IP token bucket. Used by `login`/`register`/`forgot`/`reset` routes. |

### Modified modules

- `src/auth/session.ts` — HMAC payload changes from `exp` to `${exp}.${userId}`. Verification returns `{ userId } | null` instead of `boolean`.
- `src/auth/middleware.ts` — Public path set expands to include `/register`, `/forgot`, `/forgot/sent`, `/reset`. On valid session, sets `c.set("userId", userId)`.
- `src/auth/routes.ts` — Rewritten. New register/forgot/reset routes; login takes email + password.
- `src/config.ts` — Drops `appPassword`. Adds `appBaseUrl`, `smtp.*`, makes `sessionSecret` required.
- `src/db/schema.sql` — Adds `users`, `password_reset_tokens` tables; adds `owner_id` to `recipes`.
- `src/db/migrate.ts` — Gains a destructive migration that runs once when `users` table is absent.
- `src/recipes/repository.ts` — Constructor takes `(db, userId)`. Every query filters by `owner_id`.
- `src/recipes/search.ts` — `searchRecipes` takes `userId`; FTS queries scoped to owner.
- `src/recipes/routes.ts` — Builds `recipes` repo per request using `c.get("userId")`.
- `src/tags/repository.ts` — Tags gain `owner_id`. Constructor takes `(db, userId)`.
- `src/tags/routes.ts` — Builds `tags` repo per request.
- `src/settings/routes.ts`, `src/import/routes.ts`, `src/export/routes.ts` — Repos constructed per request with `c.get("userId")`.
- `src/server.ts` — Removes `APP_PASSWORD` plumbing; injects config to auth routes; rate limiter instantiated.
- `src/ui/templates/login.html`, new `register.html`, `forgot.html`, `forgot-sent.html`, `reset.html` — Auth screens.
- `src/ui/css/app.tailwind.css` — Generalize `.login-form` styles to `.auth-form` reusable across all auth screens; add a `.auth-error` style and small affordances.

## 4. Data model

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE password_reset_tokens (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  used_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
```

`recipes` gains:

```sql
ALTER TABLE recipes ADD COLUMN owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_recipes_owner ON recipes(owner_id);
```

`tags` gains `owner_id` symmetrically:

```sql
ALTER TABLE tags ADD COLUMN owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_tags_owner ON tags(owner_id);
```

## 5. Migration / first run

`migrate.ts` checks for `users` table on boot:

- **Absent** (fresh install or upgrade from old schema): drop and recreate `recipes`, `recipe_tags`, `tags`, `recipes_fts` (and triggers) with the new schema. Then create `users` and `password_reset_tokens`. Existing recipe data is **destroyed** per user decision.
- **Present**: ensure `owner_id` columns exist (idempotent ALTER for forward-compat). No-op otherwise.

A version marker is written to a `schema_meta` table (`key TEXT PRIMARY KEY, value TEXT`) recording the migration version, to make future migrations tractable.

## 6. Routes

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/register` | public | Registration form. |
| POST | `/register` | public, rate-limited | Validate email + password (≥ 8 chars). Reject duplicates with form-level error. On success: create user, set session cookie, redirect to `/recipes`. |
| GET | `/login` | public | Login form (email + password). |
| POST | `/login` | public, rate-limited | Verify credentials. On failure: 401 with form re-render. On success: set session cookie, redirect to `return` or `/recipes`. |
| GET | `/forgot` | public | Forgot-password form. |
| POST | `/forgot` | public, rate-limited | Always redirect to `/forgot/sent` (generic success page). If the email exists and SMTP is configured, send a reset email; otherwise no-op. |
| GET | `/forgot/sent` | public | Generic "if that email exists, we sent a link" page. |
| GET | `/reset` | public | Reset form. Requires `?token=…`. If token is missing, invalid, expired, or already used: render the form with an error and no input. |
| POST | `/reset` | public, rate-limited | Validate token + new password (≥ 8 chars). On success: mark token used, update user's password hash, redirect to `/login`. On failure: re-render with error. |
| POST | `/logout` | authenticated | Clear session cookie, redirect to `/login`. |

Public paths (no auth): `/login`, `/register`, `/forgot`, `/forgot/sent`, `/reset`, `/static/*`, `/manifest.webmanifest`, `/sw.js`, `/favicon.ico`.

## 7. Recipe & tag scoping

`RecipeRepository` and `TagRepository` constructors accept `(db, userId)`. Every query includes `WHERE owner_id = ?` (or joins on it). The auth middleware sets `c.set("userId", id)`; route handlers construct `new RecipeRepository(db, c.get("userId"))` per request.

`searchRecipes(db, params, userId)` gains a `userId` parameter and appends `AND r.owner_id = ?` to all FTS query branches.

**Why structural over convention:** impossible to accidentally forget the filter on a new query — the invariant is the constructor signature.

## 8. Email transport

SMTP client built on `node:net` and `node:tls`. No external dependencies.

- Connect via `net` (port 587 → STARTTLS upgrade, port 25 → plaintext) or `tls` (port 465 → implicit TLS).
- After CONNECT and EHLO, if server advertises STARTTLS and config requests it, upgrade.
- If server advertises AUTH and `SMTP_USER`/`SMTP_PASS` are set, authenticate with PLAIN (preferred) or LOGIN (fallback).
- Send `MAIL FROM`, `RCPT TO`, `DATA` with a RFC 5322 message (`From`, `To`, `Subject`, `Date`, `Message-ID`, plain-text body).
- QUIT, close socket.
- Wrap errors as `EmailError` with a useful message.

**Testing seam:** `email.ts` exports `sendMail(config, { to, subject, body })` and `sendResetEmail(config, { to, resetUrl })`. The auth routes receive an injected `Mailer` interface (`{ sendResetEmail(to, resetUrl): Promise<void> }`) so tests substitute an in-memory mailer that captures sent messages without network. Production wires `Mailer` to the SMTP implementation bound to `config.smtp`.

### Reset email body

Plain text. Example:

```
A password reset was requested for your Recipe Manager account.

Reset your password (link valid for 1 hour):
{APP_BASE_URL}/reset?token=...

If you didn't request this, ignore this email.
```

Subject: `Recipe Manager — reset your password`

## 9. Security

- **Password hashing**: scrypt via `crypto.scrypt`. Parameters: N=2^15, r=8, p=1, keylen=32. 16-byte random salt per user, base64. Constant-time compare via `crypto.timingSafeEqual`.
- **Reset tokens**: 32 random bytes from `crypto.randomBytes`, base64url. Stored only as SHA-256 hash. 1-hour expiry. Single-use (`used_at`). After successful reset, all of that user's tokens are deleted as defense in depth.
- **Rate limiting**: in-memory token bucket keyed by IP, refilled at 10 requests/minute, capacity 10. Applied across `/login` + `/register` + `/forgot` + `/reset` (one bucket per IP, shared). Returns HTTP 429 with `Retry-After`.
- **Anti-enumeration**:
  - `/register` with an existing email returns a form error "email already registered" (this is acceptable — registration is open and the attacker would create an account anyway to test).
  - `/forgot` always returns the same generic success page regardless of whether the email exists.
  - `/login` returns the same 401 for "user not found" and "wrong password".
- **Cookie**: `HttpOnly`, `SameSite=Lax`, `Secure` when behind HTTPS (`X-Forwarded-Proto`), `Path=/`, `Max-Age=30d`. Payload `${exp}.${userId}`, HMAC-SHA256 signed, `.`-separated.
- **Input validation**: zod schemas on server side. Email regex (lenient) and password length ≥ 8. Client-side `minlength` and `type="email"` match.
- **CSRF**: this app uses same-origin POST forms behind a same-site cookie; no tokens currently. Will not add tokens in this change. Acceptable per existing threat model.

## 10. Config changes

Removed:
- `APP_PASSWORD` (no longer required, no longer used).

Added (all read in `loadConfig`):
- `APP_BASE_URL` (required) — base URL for constructing absolute links in emails. App refuses to boot if unset or invalid.
- `SMTP_HOST` (required) — SMTP server hostname. App refuses to boot if unset.
- `SMTP_PORT` (default `587`).
- `SMTP_USER`, `SMTP_PASS` (optional) — when both set, enables SMTP AUTH.
- `SMTP_FROM` (required) — RFC 5322 `From` header value, e.g. `Recipe Manager <noreply@example.com>`.
- `SMTP_SECURE` (default `false`) — when `true`, use implicit TLS (port 465 typical).

Changed:
- `SESSION_SECRET` is now **required**. App refuses to boot if unset. Previously defaulted to `APP_PASSWORD`.

`Config` interface:

```ts
export interface Config {
  sessionSecret: string;
  port: number;
  dataDir: string;
  fetchProxy: string;
  appBaseUrl: string;
  smtp: {
    host: string;
    port: number;
    user: string | null;
    pass: string | null;
    from: string;
    secure: boolean;
  };
}
```

## 11. UI

Five templates, all extending `base.html`:

- `login.html` — email + password fields. Link to `/register` and `/forgot`.
- `register.html` — email + password + password (confirm) fields. Link to `/login`.
- `forgot.html` — email field. Submit.
- `forgot-sent.html` — generic message + link back to `/login`.
- `reset.html` — hidden `token`, new password + confirm password fields. Errors rendered inline. If token is invalid, the form is replaced with an error message and a link to `/forgot`.

A reusable `.auth-form` CSS class replaces the current `.login-form`. Same visual treatment: centered card on a surface background, accent button, neutral inputs, themed for light/dark.

A small `.auth-error` style (red border/text) handles inline validation errors.

## 12. Testing strategy

### Unit tests (`tests/unit/auth/`)

- `password.test.ts` — hash determinism with same salt, randomness of salt, verify rejects wrong password, rejects empty, accepts long passwords.
- `users.test.ts` — `create` returns id; `findByEmail` is case-insensitive; duplicate email throws / returns null on conflict.
- `reset.test.ts` — `issue` returns a token; `verify` accepts valid unused unexpired; rejects expired; rejects used; rejects unknown; `consume` marks used and prevents reuse; consuming also deletes sibling tokens for that user.
- `session.test.ts` — cookie encodes `userId`; verify returns `{ userId }`; rejects tampered `userId`; rejects tampered `exp`; rejects expired.
- `rate-limit.test.ts` — bucket starts full; depletes under burst; refills over time; isolated per-IP.
- `email.test.ts` — message construction (headers, body); AUTH PLAIN encoding; STARTTLS decision logic. Uses stubbed socket; no real network.

### Unit tests for repos (`tests/unit/recipes/`, `tests/unit/tags/`)

Update existing tests to construct `RecipeRepository(db, userId)` and `TagRepository(db, userId)` with a fixture user. Add isolation test: user A's recipes are invisible to user B's repo.

### HTTP tests (`tests/http/auth.test.ts`)

Rewrite for new flow:

- Unauthenticated → redirect to `/login`.
- `POST /register` creates account, sets cookie, redirects to `/recipes`.
- `POST /register` with duplicate email → form error.
- `POST /register` with short password → form error.
- `POST /login` with correct credentials → cookie + redirect.
- `POST /login` with wrong password → 401.
- `POST /login` with unknown email → 401 (same response shape).
- `POST /forgot` always redirects to `/forgot/sent`.
- `GET /reset?token=invalid` → form error.
- Full flow: register → logout → forgot (token captured from stubbed mailer) → reset → login with new password.
- Rate limit: 11 rapid requests to `/login` → 429.

### Existing tests

- `tests/unit/config.test.ts` — rewrite for new env vars.
- Any test that sets `APP_PASSWORD` — remove.
- HTTP tests that need auth — register a user via helper, capture cookie, use it.

## 13. Out-of-scope / future work

- Session revocation (would require DB-backed sessions).
- Email verification.
- Password change while logged in (separate from reset).
- "Remember me" checkbox (already 30-day TTL).
- Account deletion / data export per-user.
- Migration of old recipe data (explicitly dropped per user decision).
