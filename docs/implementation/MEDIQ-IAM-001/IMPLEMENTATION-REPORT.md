# MEDIQ-IAM-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-IAM-001` |
| 제목 | OIDC JWT bearer authentication middleware |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PASS` — authentication middleware/config Acceptance only; external exposure and product identity/authorization remain gated |

## 1. 목표

보호된 NestJS HTTP route에 OIDC JWT Bearer 검증을 기본 적용하고, 인증 결과는 신뢰된 `issuer + subject`만 전달한다. 미설정 verifier와 검증 실패는 fail closed하며, 공개 route는 명시적으로 표시된 operational Health에 한정한다.

## 2. 범위

### 포함

- `IAM-001-DEC-001` 권고안에 따른 `jose` 6.x remote-JWKS verifier와 global Nest guard
- 설정된 issuer/audience/JWKS URI, RS256, `typ=at+jwt`, signature, `iss`, `aud`, `exp`, 선택적 `nbf`, 필수 `sub` 검증
- 8 KiB Bearer token limit, 64 KiB JWKS limit, 최대 16개 공개 RSA key, key metadata/private-key rejection
- JWKS timeout, cache/cooldown, redirect 금지 및 generic `401`/`503` 오류
- immutable `{ issuer, subject }` request principal만 전달; token과 기타 claims는 보존하지 않음
- `/health/live`, `/health/ready`만 `PublicRoute` 예외로 명시
- optional OIDC 환경변수의 Compose 전달 및 `.env.example` 문서화; 미설정 시 보호 route는 `503`
- Acceptance, Threat Model, 일정 및 구현/시험 기록 동기화

### 제외

- OIDC Authorization Code/PKCE login provider/UI 또는 실제 identity provider 배포
- Actor, Tenant, Hospital membership resolution; business/object/action Authorization
- DB Tenant transaction wrapper, RLS/table grants, Consent/Grant, 제품 업무 API와 Audit writer
- per-client/per-IP request rate limiter 또는 외부 ingress 구성
- Hospital A→MediQ→B, Viewer/Download, PACS 또는 실환자 흐름

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 정책 | `IAM-001-DEC-001` | 고정 issuer/audience/JWKS, RS256 Bearer 검증, default-deny guard | Policy Decision Log |
| 외부 노출 Gate | `IAM-001-DEC-002` | provider와 trusted ingress/rate-limit Acceptance 전에 API를 외부 공개하지 않음 | Compose 미게시 port, Threat Model |
| 보안 | `SEC-IAM-004~006`, `SEC-API-001` | 인증 요구, invalid/expired token 거부 | `TC-IAM-001-AUTH-001~007` |
| Threat | `THR-001` | unauthenticated access 위협 및 residual risk | Threat-to-Control matrix |
| Acceptance | `TC-IAM-001-AUTH-001~007` | 정상, 거부, provider failure, public exception, config validation | `tests/api/authentication.test.mjs`, `health.test.mjs`, `tests/config/app-config.test.mjs` |
| 기준 기술 | `TS-ADR-007` | OIDC/JWT authentication과 domain Authorization 분리 | `jose` verifier; no business authorization claim |

## 4. 구현 결과

Global guard는 Nest HTTP route 기본값을 보호로 처리한다. `jose` verifier는 사전 설정한 remote JWKS만 조회하며 RSA 서명과 필수 issuer/audience/type/time/subject 조건을 검사한다. JWKS 조회는 크기·key 수·timeout·cache·cooldown으로 제한하고 redirect 및 private key material을 거부한다.

누락·잘못된 Bearer credential은 일반화된 `401`을 반환하고, 미설정 verifier 또는 JWKS provider 오류는 일반화된 `503`으로 fail closed한다. 성공 시 request에는 immutable issuer/subject만 둔다. `HealthController`의 live/ready만 명시적으로 공개되며 Compose API에 host `ports`는 설정하지 않았다. Compose를 통해 OIDC issuer/audience/JWKS를 전달할 수 있고, 세 값이 모두 비어 있으면 verifier가 생성되지 않는다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/authentication/authentication.tokens.ts` | verifier/public-route metadata token |
| `services/api/src/authentication/public-route.decorator.ts` | 명시적 public route decorator |
| `services/api/src/authentication/authentication.types.ts` | verified principal/verifier/request type |
| `services/api/src/authentication/oidc-jwt.verifier.ts` | bounded remote-JWKS JWT verifier |
| `services/api/src/authentication/bearer-authentication.guard.ts` | global default-deny Bearer guard |
| `services/api/src/authentication/authentication.module.ts` | verifier provider/global guard registration |
| `services/api/src/app.module.ts` | authentication module registration |
| `services/api/src/health/health.controller.ts` | explicit public Health exceptions |
| `services/api/src/config/app-config.ts` | optional OIDC configuration and validation |
| `services/api/package.json`, `package.json`, `package-lock.json` | `jose` 6.x dependency |
| `infra/docker-compose.yml`, `.env.example` | optional OIDC env pass-through and template |
| `tests/api/authentication.test.mjs` | guard/JWT/JWKS integration-negative matrix |
| `tests/api/health.test.mjs`, `tests/config/app-config.test.mjs` | public Health and OIDC config tests |
| `docs/POLICY-DECISION-LOG.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/SECURITY-REQUIREMENTS.md`, `docs/THREAT-MODEL.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | recommendation, evidence, status and traceability sync |

## 6. 영향 분석

### Architecture

- Authentication is a global API middleware prerequisite; business modules remain absent/unexposed.
- No issuer or signing private key is embedded. Test keys are ephemeral in-process only.

### API·Data

- No product endpoint, OpenAPI business operation, database schema, migration, seed or persistent data change.
- `request.authPrincipal` is transient and contains only issuer/subject.

### Security·Privacy

- Default deny, bounded token/JWKS processing, generic errors, explicit public-route marker, no raw token logging/storage.
- This is authentication, not Actor identity validation or Tenant/object/action authorization.
- No PHI, production credential, signing secret or DICOM was used.

## 7. 실행 및 검증 요약

- 상세 명령·결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- API build and authentication/API suite: 6 files, 90 tests passed.
- App config build and tests: 10 tests passed.
- Middleware/config Acceptance `AUTH-001~007`: PASS in the tested local scope.

## 8. 변경하지 않은 사항

- No identity provider, interactive login/PKCE UI, production issuer or key provisioning.
- No Actor/Tenant/Hospital membership, Authorization, Consent, TransferGrant, audit or business route.
- No DB grant/RLS/runtime transaction context or PACS/Viewer/Download flow.
- No rate limiter or external ingress; API remains unpublished and this must not be treated as production-ready.

## 9. 결정 및 예외

- `IAM-001-DEC-001` was recorded before implementation under the standing recommendation-first process.
- `IAM-001-DEC-002` keeps external API exposure closed until a configured issuer and a trusted ingress/rate-limit policy with Acceptance exist.
- Authentication never grants patient, Tenant, resource, action, Consent, Grant or PACS access.

## 10. 잔여 위험과 후속 작업

- `MEDIQ-IAM-002/003` and the DB-009 verified Actor→Tenant transaction/pool boundary remain prerequisites.
- Exact object/action Authorization (`MEDIQ-AUT-*`) must pass before any business persistence or side effect.
- Configure a real approved issuer only in a controlled deployment profile; validate issuer/JWKS reachability and rotation.
- Before any external ingress, select a trusted proxy/gateway and rate-limit policy, then add abuse/bypass Acceptance. Do not trust arbitrary forwarded headers.
- Existing Compose has no API host port. Test issuer/JWKS are loopback fixtures and do not represent an identity service deployment.

## 11. 최종 판정

```text
Ticket: MEDIQ-IAM-001
Scope: OIDC/JWT bearer authentication middleware and fail-closed configuration
Changed: Global guard, bounded remote JWKS verifier, explicit Health exceptions, optional OIDC config wiring, tests, docs
Not changed: Identity provider/login UI, Actor/Tenant resolution, Authorization, runtime grants/RLS, business APIs, rate limiter, PACS flow
Security impact: Default-deny authentication; generic 401/503; issuer/subject-only principal; no authorization claim
Tests executed: npm run test:api (6 files / 90 passed); npm run test:app-config (10 passed); docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet; git diff --check
Tests not executed: live identity provider, external ingress/rate-limit, Actor/Tenant/AuthZ, protected business route/PACS E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md and TEST-EVIDENCE.md
Remaining risks: Provider deployment, rate limiting before external exposure, verified Tenant context and business Authorization remain open
Status: PASS (middleware Acceptance only; overall P0 remains in progress)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PASS` scoped | OIDC/JWT middleware and config Acceptance completed; deployment/business identity gates retained |
