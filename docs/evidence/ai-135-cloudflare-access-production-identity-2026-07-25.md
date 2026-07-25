# AI-135 Cloudflare Access production identity evidence

## Local source snapshot

- Repository: `vlatam-ai-lab`
- Baseline branch: `main`
- Baseline and cached `origin/main` commit:
  `99906d6185520d2ef538b1a346fd7cf4ba6dfd1e`
- Implementation branch:
  `feat/ai-135-cloudflare-access-production-identity`
- Initial worktree and index: clean
- Git remote state was not fetched or refreshed.

The only authorized external package activity was Corepack retrieval of
`pnpm@10.28.0` and npm-registry retrieval of `jose@6.2.4`. No Cloudflare,
Vercel, provider, ARCA, database, scheduler, credential, or `vlatam-global`
service was contacted.

## Derived delta

AI-135 adds:

- strict Preview/Production Cloudflare Access environment validation;
- exact role bindings for `viewer`, `operator`, `reviewer`, and `admin`;
- normalized and duplicate-rejected email allowlists;
- a module-cached, issuer-derived remote JWK set;
- asynchronous RS256 JWT verification and fail-closed identity resolution;
- entrypoint integration that preserves local-development and test-only
  identity behavior;
- the existing Spanish 401/403 route behavior with no verification detail;
- deterministic offline RSA/JWKS, integration, and architecture tests;
- architecture and deployment guidance for manual Cloudflare/Vercel setup and
  rollback; and
- the exact direct production dependency `jose@6.2.4`.

No route `allowed_roles`, provider adapter, scheduler, ARCA execution path,
credential resolver, database path, Approved Artifact authority, deployment
configuration, DNS configuration, or `vlatam-global` bridge was changed.

## Identity and environment contract

The production flow is:

`Cloudflare Access` → signed `Cf-Access-Jwt-Assertion` → AI LAB cryptographic
verification → explicit email-to-role mapping → existing route authorization →
observation/review shell only.

Preview and Production require:

```text
AI_LAB_IDENTITY_PROVIDER=cloudflare_access
AI_LAB_CLOUDFLARE_ACCESS_ISSUER=https://<team>.cloudflareaccess.com
AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE=<application-aud-tag>
AI_LAB_IDENTITY_ROLE_BINDINGS={"admin":["user@example.com"],"reviewer":[],"operator":[],"viewer":[]}
```

The issuer must be an absolute HTTPS origin with no credentials, non-root path,
query, or fragment. The audience must be non-empty. Role bindings must be a
strict JSON object containing exactly the four existing roles, each mapped to
an array of valid emails. Emails are trimmed and lowercased; duplicates within
or across roles invalidate the whole environment. An empty allowlist is valid
configuration but authenticates nobody.

The only JWKS endpoint is derived as
`<issuer>/cdn-cgi/access/certs`. No arbitrary JWKS URL setting exists.

## JWT verification

The resolver:

1. reads only `cf-access-jwt-assertion`;
2. rejects missing, duplicated, array-valued, empty, and malformed assertions;
3. permits only `RS256`;
4. verifies the signature against the cached issuer-derived JWK set;
5. verifies the exact issuer and configured audience;
6. requires expiration and email claims;
7. enforces expiration and `not-before`;
8. validates and normalizes the verified email;
9. selects a role only through the configured allowlist; and
10. returns `ANONYMOUS_IDENTITY` for every verification, JWKS, timeout,
    mapping, or unexpected resolver failure.

Plain Cloudflare email headers, forwarded email/user headers, local role
headers, JWT role claims, and decoded-but-unverified payloads grant no
identity. JWTs, role bindings, environment dumps, and verification errors are
not logged or returned to the browser.

## Assumptions and limitations

- Cloudflare Team domain, AUD tag, allowlist values, Access application,
  policy, proxy state, and Vercel variables require separate human platform
  administration.
- The repository does not contain or record those real values.
- The remote JWK set uses `jose` timeout and caching behavior; offline tests
  inject a static local JWK set and never contact Cloudflare.
- A verified role is UI/read presentation context only and cannot grant
  operational authority.
- The current route policy remains the source of UI authorization.
- The implementation does not configure, deploy, activate, publish, acquire,
  mutate, or execute any external or operational resource.

## Local validation

| Check                                                                        | Result                               |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| Focused identity, environment, route, server, Vercel, and architecture tests | 124/124 passed across 12 suites      |
| Full repository suite                                                        | 1,386/1,386 passed across 163 suites |
| `pnpm run build:production`                                                  | passed                               |
| `pnpm run typecheck`                                                         | passed                               |
| Scoped ESLint                                                                | passed                               |
| Scoped Prettier                                                              | passed                               |
| `git diff --check`                                                           | passed                               |

## Focused security review

1. No unsigned identity header is trusted.
2. JWT signatures are verified before any claim is consumed.
3. Issuer verification is exact.
4. Audience verification uses the configured AUD tag.
5. Expiration is required and enforced; `not-before` is enforced when present.
6. The allowed algorithm list contains only `RS256`; an HS256 test fails
   closed.
7. Unknown and unallowlisted users remain anonymous.
8. Duplicate normalized role mappings reject the environment.
9. JWTs are neither logged nor rendered.
10. No arbitrary JWKS URL configuration exists.
11. Local authentication remains restricted to explicit loopback
    `development_local` mode.
12. Admin remains an existing read-only UI role and gains no operational
    authority.
13. Resolver and JWK failures return anonymous, and handler-level exceptions
    also fail closed.
14. The identity module has no provider, scheduler, ARCA execution, credential,
    database, Approved Artifact activation, or `vlatam-global` coupling.
15. No Cloudflare, Vercel, DNS, deployment, provider, credential, scheduler,
    ARCA, database, or `vlatam-global` mutation occurred.

SECURITY_REVIEW_PASS
