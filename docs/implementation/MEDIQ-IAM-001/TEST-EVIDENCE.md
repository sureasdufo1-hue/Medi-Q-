# MEDIQ-IAM-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-IAM-001` |
| 제목 | OIDC JWT bearer authentication middleware |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — middleware/config Acceptance only; deployment and business authorization are not included |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest, Node test runner |
| 대상 환경 | Local API build and in-process Fastify/Nest tests; no external identity provider |
| 데이터 | Synthetic test subject, ephemeral RSA keypair, loopback-only JWKS fixture |
| 민감자료 | No PHI, production credential, persisted key, or DICOM payload |

## 2. Acceptance 매트릭스

| 검증 ID | 확인 내용 | 실제 결과 | 판정 |
|---|---|---|---|
| `TC-IAM-001-AUTH-001` | Missing/malformed Bearer and generic denial | `401 AUTHENTICATION_REQUIRED`; no token/claim detail | `PASS` |
| `TC-IAM-001-AUTH-002` | Valid RS256 signature, configured issuer/audience/type/time/subject | `200`; immutable issuer/subject only; token absent from body | `PASS` |
| `TC-IAM-001-AUTH-003` | Forged signature, wrong issuer/audience/type, expired/future token, missing subject/expiry, HS256 | Generic `401`; diagnostics not returned | `PASS` |
| `TC-IAM-001-AUTH-004` | Oversized, unsupported, malformed and duplicate-looking Authorization input | Generic `401` before JWKS lookup | `PASS` |
| `TC-IAM-001-AUTH-005` | Unknown `kid`, unreachable/timeout/oversized endpoint, invalid JWK set, redirect | Unknown key → generic `401`; unavailable/untrusted JWKS → generic `503`; redirect target not contacted | `PASS` |
| `TC-IAM-001-AUTH-006` | Explicit public Health and default-protected handler | `/health/live` and `/health/ready` accessible; undecorated probe route requires verified Bearer | `PASS` |
| `TC-IAM-001-AUTH-007` | Absent/partial/invalid config, protected route with no verifier | Absent verifier → generic `503`; partial, non-test HTTP and placeholder audience rejected; Health remains available | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build and API/authentication suites

- 실행일: `2026-09-30` (local time)
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 결과: API TypeScript build PASS; Vitest 6 files / 90 tests passed.
- 판정: `PASS`

### TEST-002 — App configuration validation

- 실행일: `2026-09-30` (local time)
- 명령:

```powershell
npm run test:app-config
```

- 종료 코드: `0`
- 결과: config TypeScript build PASS; Node test runner 10/10 passed.
- 판정: `PASS`

### TEST-003 — Whitespace/conflict-marker check

- 명령:

```powershell
git diff --check
```

- 결과: tracked diff whitespace validation clean; Git emitted only LF→CRLF working-copy notices.
- 판정: `PASS`

### TEST-004 — Compose interpolation and syntax validation

- 명령:

```powershell
docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet
```

- 종료 코드: `0`
- 결과: Compose parsed successfully using the non-secret template. No container was created or started.
- 판정: `PASS`

## 4. 실패·거부 경로

| 경로 | 관찰된 결과 | 판정 |
|---|---|---|
| Missing/malformed/unsupported/oversized token | Generic `401`; no JWKS request for malformed/oversized credentials | `PASS` |
| Wrong signature/issuer/audience/type, expiry/nbf, missing required claim, forbidden algorithm | Generic `401` without crypto diagnostics | `PASS` |
| Unknown key ID | Generic `401`; token not accepted | `PASS` |
| JWKS unreachable, request timeout, oversized response, malformed public-key set or redirect | Generic `503`; size/time bounds enforced, no redirect follow or provider detail disclosure | `PASS` |
| No verifier configured | Protected probe route returns generic `503` | `PASS` |
| Initial test-fixture attempt for HS256 | First run failed because the test tried to sign HS256 using an RSA CryptoKey; fixture was corrected to use an ephemeral test-only secret and the entire suite was rerun successfully | Corrected; final run `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Actual OIDC provider/JWKS deployment and key rotation | No issuer/provider was selected or deployed; tests use ephemeral in-process keys | Real metadata, network trust, key rotation and operations not verified | Configure only an approved issuer in a controlled environment and add integration evidence |
| Interactive Authorization Code/PKCE login | Excluded from middleware ticket; no UI/provider | No user sign-in flow exists | Separate approved implementation scope |
| Trusted ingress and request rate limiting | Compose API has no host-published port; trusted proxy and operational limit policy are not selected | DoS/credential-stuffing controls are not proven for external exposure | Keep API unpublished; define rate-limit and bypass Acceptance before ingress |
| Actor/Tenant membership, business Authorization and Tenant transaction/pool context | Separate IAM-002/AUT/DB-009 Acceptance prerequisites | Authentication alone must not be used to expose data or write business state | Complete verified identity→Tenant context, object/action AuthZ and DB wrapper first |
| Real business route/PACS E2E | No protected product route is implemented in this Ticket | No claim of patient or imaging access protection end-to-end | Run later P0 business API and A→MediQ→B Acceptance |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| API/authentication test | `npm run test:api`, exit 0, 6 files / 90 tests | Synthetic only; no PHI/secret persisted |
| App config test | `npm run test:app-config`, exit 0, 10 tests | No config values logged |
| Runtime implementation | `services/api/src/authentication/` and `services/api/src/config/app-config.ts` | No private signing key or Bearer token stored/logged |
| Compose config | `infra/docker-compose.yml`, optional OIDC variables; no API host port | No secret values added |
| Compose validation | `docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet`, exit 0 | Template placeholders only; no runtime side effect |

## 7. 결론

- Middleware/config Acceptance `AUTH-001~007`: `PASS`.
- Ticket conclusion: `PASS` for the documented authentication middleware scope only.
- Not established: identity-provider deployment, login, Actor/Tenant resolution, business Authorization, rate limiting, or product/API/PACS E2E.
- External API exposure remains prohibited by `IAM-001-DEC-002` until issuer, trusted ingress/rate limit and the remaining authorization gates are accepted.
