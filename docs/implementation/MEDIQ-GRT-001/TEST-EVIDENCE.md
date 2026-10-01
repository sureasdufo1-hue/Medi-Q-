# MEDIQ-GRT-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-001` |
| 제목 | Immutable P0 TransferGrant domain metadata |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` (Asia/Seoul) |
| 결과 | `PASS` — pure domain scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows PowerShell |
| Runtime·Toolchain | Node.js `v24.18.0`; npm `11.16.0`; Vitest `5.0.2`; TypeScript |
| 대상 환경 | Local test/build; no database or product service side effects |
| 데이터 | Synthetic UUIDs and timestamps only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-GRT-001-DOM-001` | Fresh in-memory construction | Domain unit | unique Grant UUID; exact context; ACTIVE metadata, no Authorization method | assertions passed | `PASS` |
| `TC-GRT-001-DOM-002` | Nullable recipient Actor/Package and UUID case normalization | Domain unit | exact optional refs retained; canonical IDs | assertions passed | `PASS` |
| `TC-GRT-001-DOM-003` | Four persisted statuses | Domain unit | states preserved; only temporally active ACTIVE can return true | four status cases passed | `PASS` |
| `TC-GRT-001-DOM-004` | Required/optional malformed IDs | Negative domain unit | malformed identifiers rejected | seven field cases passed | `PASS` |
| `TC-GRT-001-DOM-005` | P0 scope shape/P1 scope denial | Negative domain unit | non-empty unique P0 values only | empty/duplicate/unknown/MOBILE_EXPORT rejected | `PASS` |
| `TC-GRT-001-DOM-006` | Time validity/chronology | Negative domain unit | malformed timestamps and expiry≤issue rejected | five timestamp cases passed | `PASS` |
| `TC-GRT-001-DOM-007` | State/revocation timestamp consistency | Negative domain unit | revoked timestamp required only for REVOKED and cannot precede issuance | status matrix passed | `PASS` |
| `TC-GRT-001-DOM-008` | Temporal activity interval | Domain boundary unit | `[issuedAt, expiresAt)` only; invalid time false | boundary assertions passed | `PASS` |
| `TC-GRT-001-DOM-009` | Immutable revoke transition | Domain transition unit | ACTIVE→REVOKED copy; source unchanged; invalid states/times rejected | transition matrix passed | `PASS` |
| `TC-GRT-001-DOM-010` | Snapshot exposure/minimization | Domain structural unit | exact metadata allowlist; defensive Date/scope copies; no secret/payload property | allowlist and copy assertions passed | `PASS` |
| `TC-GRT-001-REG-001` | API regression | Build/unit/contract | existing suite passes | 21 files, 392 tests passed | `PASS` |
| `TC-GRT-001-REG-002` | API typecheck | Static analysis | no TypeScript errors | `tsc --noEmit` passed | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Focused domain tests

- 실행일: 2026-10-01
- 명령:

```powershell
npx vitest run tests/api/transfer-grant.test.mjs
```

- 종료 코드: `0`
- 핵심 결과: 1 file passed; 19 tests passed
- 판정: `PASS`

### TEST-002 — API TypeScript typecheck

- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 핵심 결과: `tsc --project services/api/tsconfig.json --noEmit` 통과
- 판정: `PASS`

### TEST-003 — API build and regression

- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: API build 통과; 21 test files / 392 tests passed
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-GRT-001-DOM-004` | malformed required/optional identifier | `InvalidTransferGrantError` | `PASS` |
| `TC-GRT-001-DOM-005` | empty, duplicate, unknown, P1 `study:mobile-export` scope | `InvalidTransferGrantError` | `PASS` |
| `TC-GRT-001-DOM-006/007` | invalid timestamp/expiry/revocation metadata | `InvalidTransferGrantError` | `PASS` |
| `TC-GRT-001-DOM-008` | before issue, exact expiry, after expiry, invalid `now` | temporal helper returns false | `PASS` |
| `TC-GRT-001-DOM-009` | terminal-state revoke, invalid time, pre-issue revoke | `InvalidTransferGrantError` | `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| PostgreSQL Grant repository/RLS/least-privilege | `MEDIQ-GRT-001` changes no persistence or grants | Domain snapshot has no row provenance guarantee | `MEDIQ-GRT-002` recommendation and scratch Acceptance |
| Grant issuance, Consent/Authorization/recipient/scope/resource enforcement | No Grant service/API in scope | Entity metadata could be misused if an application bypasses its gates | GRT-003/005/006 and AUT operation Gates |
| HTTP BOLA, expired-access denial, Viewer/Download/PACS/E2E | Product protected routes are not part of this Ticket | Unit temporal result alone does not prevent product access | GRT-007 and HTTP/PACS Acceptance |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Focused domain test | `tests/api/transfer-grant.test.mjs` | Synthetic UUIDs only |
| Acceptance record | `docs/ACCEPTANCE-TESTS.md`, `TC-GRT-001-DOM-001~010` | No PHI/secret |
| Domain source | `services/api/src/grant/domain/transfer-grant.ts` | Metadata fields only |

## 7. 결론

- 결과: `PASS` — immutable TransferGrant pure-domain metadata only
- P0 scope shape, statuses, timestamps, immutable revoke and metadata minimization have direct unit evidence
- No Authorization, persisted Grant issuance, HTTP access, product side effect or P0 E2E is claimed
- DB/integration tests were not run because this Ticket changes no DB/schema/runtime privilege
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다
