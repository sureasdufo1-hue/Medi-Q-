# MEDIQ-AUD-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUD-002` |
| 제목 | Verified-Tenant Grant denial Audit event pair |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` (Asia/Seoul) |
| 결과 | `PASS (scoped)` — 8 Acceptance cases; global Audit requirements remain open |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest, Docker Compose, PostgreSQL |
| 대상 환경 | Local API tests; DB-008 disposable scratch PostgreSQL/RLS runtime |
| 데이터 | Synthetic Tenant/Actor/Session/Consent/Grant fixtures only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-AUD-002-EVENT-001` | Fixed GRANT_DENIED catalog | Unit/domain | Accept exact action/resource/result/reason pairs only | API writer allowlist tests passed; invalid combinations rejected | `PASS` |
| `TC-AUD-002-EVENT-002` | Grant issue denial | Unit + PostgreSQL/RLS | Exactly one authorization-denial and one grant-denial; no grant/scope/success event | Signed-OIDC PostgreSQL integration verified exact counts, shared context and no Grant/Scope mutation | `PASS` |
| `TC-AUD-002-EVENT-003` | Grant revocation denial | Unit + PostgreSQL/RLS | Exactly one event pair; active Grant unchanged | GRT-004 runtime assertions verified both event counts/pair context and unchanged ACTIVE Grant | `PASS` |
| `TC-AUD-002-EVENT-004` | Denial/replay and safe response | API/integration | No duplicate success events; each verified denial has one pair | GRT-003 replay/conflict and minimized HTTP response integration passed | `PASS` |
| `TC-AUD-002-EVENT-005` | Second event write fails | Fault injection | Whole event pair and paired mutation roll back | Injected `GRANT_DENIED` INSERT failure; fixed 503; no partial pair/Grant/Scope persisted | `PASS` |
| `TC-AUD-002-EVENT-006` | Tenant isolation | PostgreSQL/RLS | No cross-/no-Tenant write and no tenant substitution | DB-008 forced RLS and cross-/third-Tenant probes passed; exact Audit INSERT grant retained | `PASS` |
| `TC-AUD-002-EVENT-007` | Metadata minimization | Unit/SQL contract | Only exact metadata columns/fixed values; no sensitive/free-form content | Closed Audit event/writer checks passed; 12-column INSERT and 183 total runtime privileges verified | `PASS` |
| `TC-AUD-002-EVENT-008` | Deferred event boundary | Review/regression | No fabricated global/future event coverage; no overall Audit PASS | Plan/code review confirms future producers/global sink remain absent and overall Audit open | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build and regression

- 명령: `npm run test:api`
- 종료 코드: `0`
- 결과: API TypeScript build PASS; 31 files / 560 tests PASS.
- 타입 검사: `npm run typecheck:api` — 종료 코드 `0`.
- Migration format/invariants: `npm run db:migrations:check` — 종료 코드 `0`, “Everything's fine”; `npm run test:db-migrations` — 종료 코드 `0`, 6/6 PASS; no migration was created.
- Whitespace check: `git diff --check` — 종료 코드 `0`; only pre-existing Git LF→CRLF working-copy notices were printed.

### TEST-002 — Full database security/atomicity/regression gate

- 명령: `./scripts/test-db-008-full-schema.ps1`
- 종료 코드: `0`
- 실제 결과: DB-008 clean/reset/reapply and exact catalog PASS; `mediq_runtime` has exactly 183 column privileges and Audit has only the existing 12-column INSERT. GRT-003 signed-OIDC issue/replay/denial/pair-context/second-event rollback and GRT-004 revoke/denial-pair assertions PASS. DB-002~007 regressions and scratch cleanup PASS.
- 테스트는 disposable scratch PostgreSQL과 synthetic identities only 사용; production DB/PACS/PHI 없음.

## 4. 실패·거부 경로

Consent/scope/binding denial emitted the fixed pair; Grant revocation mismatch preserved the active Grant and emitted the pair; cross-Tenant RLS checks denied writes; forced failure of the second `GRANT_DENIED` insert returned fixed failure and left no partial state. No Tenant was fabricated for pre-authentication paths.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Tenant-less authentication failure capture | Current Audit table requires Tenant RLS context; outside this Ticket | Failure may not appear in `audit_events` | Separate sink/design decision; never fabricate Tenant |
| Viewer/Download/PACS/Integrity/Session-completion Audit | Product operation producers do not exist | Required global action coverage remains incomplete | Integrate with authorized product flows in later Tickets |
| Global `STC-AUD-001` | Scoped Ticket only | Overall Audit requirement remains open | Separate full-source coverage gate |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Scoped decision and Acceptance | `POLICY-DECISION-LOG.md` / `ACCEPTANCE-TESTS.md` | Synthetic metadata only |
| Runtime/API test output | To be summarized here | No PHI/Secret allowed |

## 7. 결론

- 결과: `PASS (scoped)`
- PASS를 주장할 수 있는 범위: verified-Tenant Grant issue/revocation denial event pair, fixed metadata, transaction atomicity and tested PostgreSQL/RLS regressions only.
- Global Audit coverage remains open after this scoped test work.
