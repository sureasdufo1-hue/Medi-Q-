# MEDIQ-GRT-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-004` |
| 제목 | Recipient-bound Grant revocation API |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` |
| 결과 | `PASS` — scoped Ticket Acceptance |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 Education |
| Node.js / npm | `v24.18.0` / `11.16.0` |
| PowerShell | `7.6.5` |
| Docker Client / Engine | `29.8.0` / `29.8.0` |
| 대상 | Local disposable PostgreSQL / DB-008 scratch Compose project |
| 데이터 | Synthetic actor, tenant, hospital, session, consent and grant fixtures only |

## 2. Acceptance 결과

| 검증 ID | 실제 결과 | 판정 |
|---|---|---|
| `TC-GRT-004-REV-API-001~012` | Unit suite plus signed OIDC/JWKS HTTP→PostgreSQL/RLS integration covered success, exact actor/tenant/hospital/session binding, hidden/mismatched resource, stable replay, expiry-independent revoke, terminal conflict, body/query override denial, concurrent request, atomic Audit rollback, fixed response and non-recall boundary | `PASS` |
| `TC-GRT-004-REV-DB-001` | Runtime privilege catalog exactly 146 column privilege rows; GRT-003 baseline 144 plus only `transfer_grants.status` and `transfer_grants.revoked_at` UPDATE; forbidden broad/table/DDL privileges denied | `PASS` |
| `TC-GRT-004-REV-DB-002` | Approved two-column update succeeds in the authorized path; binding/scope/issue/expiry/creation columns remain non-updatable by runtime role | `PASS` |
| `TC-GRT-004-REV-DB-003` | Forced RLS, verified context, wrong-tenant and missing-context denial verified by the GRT-004 integration and DB-008 access-boundary gate | `PASS` |
| `TC-GRT-004-REV-DB-004` | Concurrent revoke resolves to one durable transition and one success Audit; DB-008 clean/reset-reapply and owned-resource cleanup pass | `PASS` |
| `AT-FUNC-009` | Metadata revocation returns stable replay behavior; it does not claim to recall offline data or terminate in-flight operations | `PASS` — scoped behavior only |

## 3. 실행 명령과 결과

### TEST-001 — PowerShell test-harness parse

- 목적: 보강한 DB-008 readiness/bootstrap 스크립트의 구문 확인
- 명령:

```powershell
$tokens=$null; $errors=$null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/test-db-008-full-schema.ps1'), [ref]$tokens, [ref]$errors) > $null
if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }
```

- 종료 코드: `0`
- 결과: `PowerShell AST parse PASS`

### TEST-002 — API typecheck

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 결과: `tsc --project services/api/tsconfig.json --noEmit` 완료

### TEST-003 — migration journal/check

```powershell
npm run db:migrations:check
```

- 종료 코드: `0`
- 결과: Drizzle reported `Everything's fine`; 18 migrations checked

### TEST-004 — API build and full API regression

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: `0`
- 결과: API build PASS; `24` test files and `453` tests passed

### TEST-005 — DB-008 full scratch-schema gate

```powershell
pwsh -NoProfile -File .\scripts\test-db-008-full-schema.ps1 -EnvFile .env
```

- 종료 코드: `0`
- clean apply: `db008_clean_up=PASS`; 17 product tables, 18 migration ledger rows, catalog counts `17|44|15|30`
- reset: only the owned ephemeral Compose project was removed; no DB-008 container or volume remained
- reset/reapply: `db008_reset_reapply=PASS`; 17 product tables and 18 migrations
- both clean and reset/reapply executions passed DB-009 exact privilege/RLS gates and signed OIDC/JWKS GRT-003/GRT-004 PostgreSQL integrations
- GRT-004 result on both passes: exact recipient, expiry-independent revoke, replay, concurrency, Audit atomic rollback and denial PASS; only `status`/`revoked_at` UPDATE permitted
- DB-002~007 regression and final `db008_ephemeral_cleanup=PASS` passed
- final result: `db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false`

## 4. 실패·거부 경로 및 재시도 이력

개발 중 최초 DB-008 실행에서 누적 privilege allowlist/AUT-005 기대값, Consent 쿼리 privilege fixture 및 Grant 시간 제약 fixture가 현재 기준과 불일치하여 시험이 실패했다. 이를 승인된 146-row least-privilege 기준과 `expires_at > issued_at` fixture 제약에 맞게 수정했다. 별도 reset 재기동에서는 초기화 도중의 일시적 PostgreSQL 연결 오류가 발견되어 test harness가 이를 놓치지 않도록 다음 시험 전 보강했다.

- `running|healthy`가 세 번 연속 관찰된 후에만 연결을 시도
- scratch role/schema bootstrap을 하나의 transaction으로 묶어 retry 시 부분 생성 방지
- database-not-yet-created 및 PostgreSQL startup/shutdown SQLSTATE 등 제한된 초기화 오류만 bounded retry
- 운영 Compose healthcheck, 실제 DB 설정, application runtime policy는 변경하지 않음

보강 후 위 TEST-005 전체 게이트가 clean 및 reset/reapply 양쪽에서 exit code `0`으로 완료됐다.

| 경로 | 결과 | 판정 |
|---|---|---|
| Same-Hospital 다른 Actor 또는 잘못된 Session | 고정 거부, Grant 상태 변경 및 success Audit 없음 | `PASS` |
| Wrong Tenant/Hospital, unsupported Actor, missing/mismatched Grant | Fail closed; 데이터 비노출 | `PASS` |
| 만료 Consent/Session/Grant 시간에도 ACTIVE Grant 철회 | 위험 감소 철회 성공 | `PASS` |
| EXPIRED/CONSUMED Grant | 상태 재전이 없이 fixed conflict | `PASS` |
| caller body/query의 identity/state override | 입력 거부, 쓰기 없음 | `PASS` |
| 동시 철회 및 Audit 실패 | 한 번만 전이/성공 Audit; 실패 시 atomic rollback | `PASS` |
| broad UPDATE, cross-tenant/no-context access | privilege/RLS로 거부 | `PASS` |

## 5. 미실행 시험 및 범위 경계

| 시험 | 상태 및 이유 | 잔여 위험 |
|---|---|---|
| 오프라인 Capsule/기기 데이터 원격 회수 | 이 Ticket 범위 밖이며 기술적으로 보장하지 않음 | 이미 전달·저장된 복사본은 철회 API로 회수되지 않음 |
| 진행 중 Viewer/Download/PACS 작업의 race-safe 취소/fencing | 별도 operation-time Authorization/lease Ticket 미구현 | 철회가 이미 진행 중인 작업을 취소한다고 보장하지 않음 |
| Hospital A→B 실제 DICOM STOW/E2E | 별도 PACS integration Ticket | 전체 P0 transfer Acceptance 미완료 |

## 6. 증거 및 데이터 확인

- 실행 결과: TEST-001~005 및 위 DB-008 structured gate output
- 종료 후 검증: `docker ps -a --filter "name=mediq-db008"`와 같은 이름의 volume 조회에서 결과 없음
- 보고서와 테스트 증거에 실제 환자정보, DICOM payload, credential, token 또는 secret을 포함하지 않음

## 7. 결론

- 결과: `PASS` — `MEDIQ-GRT-004`의 승인된 범위에 한함
- Grant revoke는 exact recipient-bound authorization metadata 전이다.
- `PASS`는 operation-time Viewer/Download/PACS 인가, in-flight fencing, offline recall, Hospital A→B E2E 또는 전체 P0 완료를 뜻하지 않는다.

## 8. Shared regression diagnostic follow-up (2026-10-03)

DB-008 session 6711 exited 1 in the shared GRT-003/004 test file: combined 12 PASS/2 FAIL; named failures are the GRT-003 rollback case and its parent, not a GRT-004 revoke case. Exact owned resource inventory is empty and existing stack healthy. See MEDIQ-GRT-003 evidence §8 for the retained error; its cause is unproven.

Before shared test edits, GRT-003-DEC-002/DIAG-001~004 prescribe fixed connection/query-phase diagnostics, unchanged forwarding/error identity/fault semantics, and non-sensitive output checks. GRT-004 product code/recipient boundary/expiry behavior/Audit atomicity/timeout/grants are unchanged. New shared-proxy unit tests and actual full rerun are pending; earlier PASS remains historical, not a current-schema acceptance claim. No live source-run input is changed.

**Shared checks:** `node --test tests/scripts/grant-db-diagnostics.test.mjs` exited 0 at **17:34:25 KST**, **15/15 PASS** using AST-extracted real functions/fake clients; the `revoke-audit` rejection remains intact along with all four other fault modes. Exact query/parameter/timeout forwarding, release binding, original error identity and sanitized output pass. JS syntax/PowerShell parser/diff checks pass. No actual shared HTTP/PostgreSQL rerun result yet; full current regression remains unaccepted. See GRT-003 §8 for exact changed diagnostics and retained failure.

**Actual follow-up:** Full scratch diagnostic rerun **51950** / **mediq-db008-181f3dd33ac9** is live after source/API workloads ended. Only PostgreSQL readiness/role bootstrap passed so far. Shared GRT-003/004 HTTP/PostgreSQL, repeat/reset/reapply, final exit and cleanup still pending; see MEDIQ-PACS-001 evidence §44. Preserve all current run inputs and earlier failure evidence.
