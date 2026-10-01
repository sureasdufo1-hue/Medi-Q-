# MEDIQ-AUD-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUD-001` |
| 제목 | Metadata-only common Audit event writer |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` (Asia/Seoul) |
| 결과 | `PASS (scoped)` — 9 writer Acceptance cases; global Audit requirements remain open |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js/npm workspace, TypeScript, Vitest, Docker Compose, PostgreSQL 18.6 |
| 대상 환경 | Local API unit/contract tests; DB-008 disposable scratch Compose; pre-existing local MediQ development DB for DB-002~007 schema regressions |
| 데이터 | Synthetic Tenant/Actor/Session/Consent/Grant fixtures only; no PHI, production DB, real PACS or operating credentials |
| Scratch cleanup | DB-008 temporary Compose project removed and its containers/volumes/networks verified absent |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-AUD-001-WRITER-001` | fixed event catalog/result mapping | Unit/domain | Only approved current event combinations accepted | 10 supported event/reason combinations accepted; unknown action/resource/result and reason mismatches rejected before query | `PASS` |
| `TC-AUD-001-WRITER-002` | malformed reference/time/nullability | Unit/domain | Invalid UUID/date and missing required reference rejected | Invalid Actor UUID/date and missing required Session cases rejected; existing optional-denial shape accepted | `PASS` |
| `TC-AUD-001-WRITER-003` | arbitrary payload / sensitive data | Unit/privacy | Extra fields (including hidden/symbol properties) rejected; only allowlisted references/metadata serialized | Enumerable, non-enumerable and symbol extras rejected; SQL parameter list excludes any payload/free-text field; fixed errors omit driver detail | `PASS` |
| `TC-AUD-001-WRITER-004` | unsafe SQL / overbroad privileges | Unit + live catalog | Parameterized INSERT names exact 12 existing columns; no schema/grant expansion | 12 `$n` parameters verified; DB-008 runtime catalog reported exactly 12 `audit_events` INSERT columns and overall 183 privileges | `PASS` |
| `TC-AUD-001-WRITER-005` | cross-Tenant Audit insert | PostgreSQL/RLS integration | Exact matching Tenant can record; wrong row Tenant is rejected and paired business mutation rolls back | EXC-003 runtime Audit write using another Tenant was rejected; Session and Audit did not persist; forced RLS and exact grant confirmed | `PASS` |
| `TC-AUD-001-WRITER-006` | existing caller transaction atomicity | API + PostgreSQL integration | Existing Session/Consent/Grant event counts remain stable; injected Audit failure rolls back paired mutation | EXC-003 Session atomic Audit; CON request/approval/withdrawal; GRT issue/revoke atomicity/replay regressions all PASS. PatientMapping-denial remains API mock/SQL-contract only | `PASS` within stated boundary |
| `TC-AUD-001-WRITER-007` | Grant issue paired events/replay | PostgreSQL/OIDC integration | One `AUTHORIZATION_GRANTED/ALLOW` plus one `GRANT_CREATED/SUCCESS`; no duplicate pair on semantic replay | DB-008 GRT-003 integration reported signed OIDC, semantic idempotency, concurrency and Audit atomicity PASS | `PASS` |
| `TC-AUD-001-WRITER-008` | DB error/row-count disclosure | Unit + integration | Fixed non-disclosing persistence failure; no SQL/driver detail exposed | Query rejection and invalid row-count unit cases returned fixed error; injected runtime Audit failure rolled back | `PASS` |
| `TC-AUD-001-WRITER-009` | accidental scope expansion | Review + regression | No route/API/read privilege, schema/grant change, global coverage or WORM claim | No Audit route/API/schema/grant added; plan and report keep global event coverage, query/read, retention/tamper controls open | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API regression

- 목적: API build and all API unit/contract suites, including Audit writer and adapted event assertions
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 결과: API TypeScript build PASS; Vitest **31 files / 556 tests PASS**.
- 판정: `PASS`

### TEST-002 — Type, migration and whitespace regressions

| 명령 | 종료 코드 | 핵심 결과 | 판정 |
|---|---:|---|---|
| `npm run typecheck:api` | 0 | TypeScript no-emit typecheck PASS | `PASS` |
| `npm run db:migrations:check` | 0 | Drizzle journal: “Everything's fine”; no migration was created | `PASS` |
| `npm run test:db-migrations` | 0 | 6 tests passed, 0 failed | `PASS` |
| `git diff --check` | 0 | No whitespace errors; Git printed existing LF→CRLF working-copy notices | `PASS` |

### TEST-003 — Full DB-008 scratch/RLS/atomicity regression

- 목적: Clean/reset/reapply product schema; exact runtime role/grants/RLS; existing Session/Consent/Grant Audit writes and rollback; DB-002~007 regressions; scratch cleanup.
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1
```

- 종료 코드: `0`
- 실제 핵심 결과:
  - `db008_schema_validation=PASS`; 18 product tables, migration ledger 20, catalog `18|48|17|38`.
  - `db009_access_boundary=PASS`; runtime privilege inventory exactly 183; `audit_events` exact 12-column INSERT only; forced RLS and cross-/third-Tenant probes passed.
  - `exc003_creation_api=PASS ... atomic_audit=PASS`; mismatched Tenant Audit insertion did not commit with Session.
  - `con003_request_api`, `con004_approval_api`, `con005_withdrawal_api` PASS with signed OIDC, Tenant RLS, replay/concurrency and atomic Audit rollback.
  - `grt003_issue_api`, `grt004_revoke_api` PASS with recipient/Consent binding, idempotency, paired/atomic Audit and rollback.
  - `pacs001_session_fence=PASS`; this is a no-DICOM/no-STOW authorization-fence test, not transfer acceptance.
  - Clean/reset/reapply and DB-002~007 schema constraint/rollback regressions PASS; `db008_ephemeral_cleanup=PASS`.
- 추가 영향/경계: 사전 정의 스크립트가 local development DB에서 DB-002~007 migration/schema 회귀를 실행했고 현재 migration ledger 20 및 exact catalog를 확인했다. Production DB는 사용하지 않았다. No STOW was executed.
- 판정: `PASS` for this scoped Ticket.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-AUD-001-WRITER-001~003` | invalid action/result, malformed IDs/date, unknown/free-form payload | rejected before SQL; no insert issued | `PASS` |
| `TC-AUD-001-WRITER-005` | mismatched row Tenant under verified caller transaction | RLS rejects write; paired Session state rolls back | `PASS` |
| `TC-AUD-001-WRITER-006/008` | writer/DB failure during successful business transaction | fixed error propagates and Session/Consent/Grant writes roll back | `PASS` |
| `TC-AUD-001-WRITER-007` | replay/denial/concurrent Grant path | no duplicate success Audit; denial/rollback remains separated | `PASS` |
| Global Audit failure/unauthenticated request without Tenant | not part of this writer | no global capture claim; a tenant-RLS-compatible design remains open | `NOT RUN / OUT OF SCOPE` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Complete global `REQ-AUD`/`SEC-AUD` event coverage | This Ticket centralizes only current wired call paths | Required action might have no producer/writer call | `MEDIQ-AUD-002` and global `STC-AUD-001` |
| No-Tenant authentication-failure Audit | Current `audit_events` RLS requires verified Tenant row context | Such failures cannot be claimed as captured by this repository | Design separately; do not fabricate Tenant identity |
| Live DB atomicity for PatientMapping-denial writer path | Current gate test is mocked API SQL-contract only | Adapter contract does not prove actual DB/RLS commit/rollback | Add to later protected PACS coordinator integration before STOW |
| Audit query/read API, retention, tamper/WORM, external sink | Excluded from AUD-001 | Review/export/retention and tamper controls remain unimplemented | Separate AUD tickets/productionization decisions |
| Product DICOM source→destination Audit/Provenance, STOW and full A→B E2E | PACS Mandatory Preflight/coordinator remains gated | No end-to-end Audit completeness claim | PACS/INT/PROV/Golden E2E acceptance |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Scoped implementation report | `docs/implementation/MEDIQ-AUD-001/IMPLEMENTATION-REPORT.md` | PHI/Secret 없음 |
| Scoped Acceptance and decision | `docs/ACCEPTANCE-TESTS.md` / `docs/POLICY-DECISION-LOG.md` (`AUD-001-DEC-001`) | Synthetic IDs/specification only |
| API and runtime test output | TEST-001~003 summarized above | No sensitive payload copied |

## 7. 결론

- 결과: `PASS (scoped)`
- PASS 범위: closed metadata-only event model, exact parameterized writer, current Session/Consent/Grant/PatientMapping-denial adapter contract, exact existing 12-column privilege, tested RLS/atomic rollback paths.
- 미포함: global Audit completeness, all authentication failures, query/read, retention/WORM, live PatientMapping-denial DB path, and full PACS/A→B Audit.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM은 사용·기록하지 않았다.
