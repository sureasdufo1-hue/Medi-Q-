# MEDIQ-CON-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-003` |
| 제목 | Destination-Hospital Consent request API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` — CON-003 scoped API and database Acceptance completed; broader Consent workflow remains open |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell; Docker Compose test profile |
| Runtime·Toolchain | Repository-pinned Node/npm, Vitest, PostgreSQL scratch/DB-008 migration runner |
| 대상 환경 | Unit/contract tests, disposable DB-008 scratch, actual local Fastify API with synthetic OIDC/JWKS and PostgreSQL/RLS |
| 데이터 | Synthetic Actor/Tenant/Hospital/PatientReference/Session/Consent/Package only; no PHI, operational DICOM or PACS call |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-003-API-001` | Valid destination creator request; Consent/Session/Audit atomic success | API + PostgreSQL | 201; PENDING; Session CONSENT_PENDING; one Audit | Signed synthetic OIDC request returned 201; server-derived context, one PENDING Consent/action set, Session transition and one Audit committed atomically; no Grant/image side effect | `PASS` |
| `TC-CON-003-API-002` | AuthN, Tenant, Hospital, Actor and hidden Session denials | HTTP + PostgreSQL/RLS | Generic deny; zero writes/data leak | Missing/invalid auth, inactive/SERVICE actor, wrong Tenant/Hospital, non-requester and invisible/cross-Tenant Session denied without protected writes or existence leak | `PASS` |
| `TC-CON-003-API-003/004` | Malformed body, invalid action/date/package/state/expiry | Contract + integration | Fixed 400/409; zero writes | Unknown/invalid/duplicate action and malformed UUID/date rejected; invalid Session/package/state/expiry conflicts; no writes or PACS call | `PASS` |
| `TC-CON-003-API-005/006` | Identical pending retry and different-body conflict | PostgreSQL concurrency/API | Reuse one Consent/Audit; mismatch 409 | Concurrent identical requests reused one pending Consent without duplicate action/Audit; changed semantic payload and inconsistent pending state returned conflict without mutation | `PASS` |
| `TC-CON-003-API-007` | Consent/action/session/audit/commit fault injection | PostgreSQL transaction | Full rollback, no partial state | Faults at Consent insert, action insert, Session update, Audit insert and transaction commit each rolled back all transactional state | `PASS` |
| `TC-CON-003-API-008` | Signed synthetic OIDC over real HTTP handler and DB | HTTP + PostgreSQL/RLS | Valid pass, invalid denied; no PHI/SQL/PACS | Actual Fastify/Nest HTTP path with signed synthetic RSA OIDC/JWKS and `mediq_runtime`; valid/denied flows, forced RLS, no-context/cross-Tenant isolation, safe response and no PACS invocation verified | `PASS` |
| `TC-CON-003-API-009` | Runtime privilege catalog after migration | PostgreSQL catalog | Exact 122 rows; no broad/mutation grants | Effective runtime inventory exactly 122 allowed column grants; no table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE/other UPDATE; forced RLS retained | `PASS` |

## 3. 실행 명령과 결과

Executed on 2026-10-01 (exit code 0 unless noted):

| Command | Actual result |
|---|---|
| `npm run test:api` | PASS — 20 test files, 355 tests |
| `npm run typecheck:api` | PASS — TypeScript API project typecheck |
| `node --check tests/database/consent-request-api-runtime.integration.test.mjs` | PASS — integration harness syntax |
| `npm run test:db-migrations` | PASS — 6/6 migration-runner tests |
| `npm run db:migrations:check` | PASS — migration journal consistency |
| `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` | PASS — disposable clean/repeat/reset/reapply; ledger 14, product tables 17, catalog 17/44/15/29, runtime privileges 122; CON-003 live synthetic HTTP/PostgreSQL/RLS Acceptance twice; DB-002~007 persistent-development regressions PASS |

The DB-008 command also applied pending migrations to the existing local development DB during its documented DB-002~007 phase (ledger now 14); it did not reset that persistent volume. Scratch fixtures were synthetic and transaction-scoped/cleaned. The separate migration-role test inspector was used only for fixture setup and assertions that `mediq_runtime` is intentionally not permitted to read directly; the HTTP application itself used `mediq_runtime`.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-003-API-002` | Wrong Tenant/Hospital/Actor, invisible Session, unauthenticated request | Denied; protected writes absent and no resource-existence disclosure | `PASS` |
| `TC-CON-003-API-003/004` | Invalid/duplicate/P1 action; stale Session; mismatched/unavailable package; bad expiry | Rejected with fixed client errors; transaction state unchanged; no PACS invocation | `PASS` |
| `TC-CON-003-API-007` | Insert/update/audit/commit failure | Each injected failure rolled back Consent/actions/Session/Audit state | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Legal consent and patient identity | Out of scope for CON-003 | Request is synthetic and PENDING only | CON-004+ and legal review remain required |
| Grant/image access | Out of scope for CON-003 | This Ticket must create no authorization or PACS side effect | AUT/GRT/VIEW/DWN/PACS Acceptance remains required |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Recommendation + Acceptance | `POLICY-DECISION-LOG.md`, `ACCEPTANCE-TESTS.md` | Synthetic-only; no PHI/Secret |
| API integration and migration evidence | `tests/database/consent-request-api-runtime.integration.test.mjs`; command outputs summarized above | Synthetic signed key/identities only; secrets and token contents not recorded |

## 7. 결론

- 결과: `PASS` — only the protected technical Consent-request API, retry/transaction behavior and its exact database privilege boundary.
- PASS 범위 밖: patient identity/legal consent, approval/withdrawal, Consent enforcement, Grant, Viewer/Download/PACS and full P0 A→MediQ→B E2E.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
