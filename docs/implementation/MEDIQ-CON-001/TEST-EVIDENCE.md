# MEDIQ-CON-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-001` |
| 제목 | P0 ConsentArtifact immutable domain |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — pure immutable P0 domain only; all integration/legal/authorization gates remain untested |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js `v24.18.0`, npm `11.16.0`, TypeScript `6.0.3`, Vitest `5.0.2` |
| 대상 환경 | Local API TypeScript build and unit/contract suites; no database or application route |
| 데이터 | Synthetic UUID/date fixtures only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-001-DOM-001` | Fresh Consent identity, PENDING create state and context preservation | Unit | Server-generated unique ID; no issue/withdrawal time or permission | Create/default/context tests pass | `PASS` |
| `TC-CON-001-DOM-002` | Existing schema statuses | Unit | Five declared statuses reconstitute; unknown state denies | All five statuses pass; unknown/null/undefined deny | `PASS` |
| `TC-CON-001-DOM-003` | UUID shape and distinct source/destination | Unit/security | Invalid references and same Hospital reject with fixed error | Six malformed ID fields and equal Hospital reject; UUIDs normalized | `PASS` |
| `TC-CON-001-DOM-004` | Nonempty, unique, P0-only actions | Unit/security | Only `VIEW`, `DOWNLOAD`, `PACS_IMPORT`; reject duplicate, empty, unknown, P1 | Full P0 action set accepted; all invalid sets reject; exported allowlists are frozen | `PASS` |
| `TC-CON-001-DOM-005` | Optional Package scope | Unit | Null or exact UUID only; null never creates permission | Null/exact package pass; malformed package rejects; no authorize operation exists | `PASS` |
| `TC-CON-001-DOM-006` | Caller-assigned Consent version | Unit | Positive safe integer only; domain does not allocate/version-lock | Valid version preserved; 0, negative, fraction, NaN, Infinity and unsafe values reject | `PASS` |
| `TC-CON-001-DOM-007` | Timestamp shape, ordering and immutability | Unit | Valid Dates only; `updatedAt >= createdAt`; detach mutable inputs | Invalid timestamps/order reject; input and returned Date/action mutation cannot alter object | `PASS` |
| `TC-CON-001-DOM-008` | Technical consent boundary | Scope/security review + unit | Creation remains PENDING; no approval/authorization/API/DB side effect | No `approve` or `authorize` method or infrastructure wiring in Ticket | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build

- 실행 일시: 2026-09-30 17:07 KST
- 목적: Compile the API and generated domain sources.
- 명령:

```powershell
npm run build:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript API project compiled successfully.
- 판정: `PASS`

### TEST-002 — Focused ConsentArtifact domain Acceptance

- 실행 일시: 2026-09-30 17:07:43 KST
- 명령:

```powershell
npx vitest run tests/api/consent-artifact.test.mjs
```

- 종료 코드: `0`
- 핵심 결과: 1 test file passed, 36 tests passed.
- 판정: `PASS` for pure domain contract.

### TEST-003 — Full API regression

- 실행 일시: 2026-09-30 17:07:54 KST
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: API build passed; 12 test files passed, 269 tests passed.
- 판정: `PASS` for API unit/contract regression.

### TEST-004 — API no-emit typecheck

- 실행 일시: 2026-09-30 17:05 KST
- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 핵심 결과: API TypeScript project typechecked without emitting files.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-001-DOM-003/004/006/007` | Malformed IDs/actions/version/timestamps and inconsistent created/updated chronology | Fixed `CONSENT_ARTIFACT_INVALID`; no persistence or follow-on operation occurs | `PASS` |
| `TC-CON-001-DOM-008` | Caller interprets new artifact or ACTIVE snapshot as approval/access | Object has no approval/authorization method; no route/service wired | `PASS` (scope review) |
| No-consent Grant issuance, withdrawn Consent use, cross-Tenant/resource/destination access, safe HTTP error and no PACS side effect | These are workflow/security integrations, not domain factory/reconstitution behavior | `NOT RUN` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Consent persistence and unique-version concurrency | `MEDIQ-CON-002` is out of scope; no runtime grants or DB integration | Concurrent callers may not safely allocate distinct versions until persistence is implemented | Add transactional allocator and A/B/C least-privilege/RLS tests before runtime use |
| Approval/rejection/withdrawal/expiry lifecycle and Audit | Separate planned Consent Application/API Tickets | This domain alone cannot produce or revoke evidence | Implement state transitions with authenticated Actor, transaction, Audit and failure-path Acceptance |
| Legal consent, identity proof or production legal enforceability | Outside CAPSTONE-P0 synthetic Technical Consent | UI could overstate consent efficacy if connected incorrectly | Keep screens/API clearly technical and synthetic; require legal/privacy review for real use |
| `SEC-CONSENT-001~004`, live Authorization, BOLA and PACS behavior | No route, Consent repository, Grant workflow or trusted evidence reader in this Ticket | Domain PASS does not secure product access | Complete appropriate CON/AUT/DB/Grant Gates before any protected route |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Build and test command results | `npm run build:api`; focused `36/36`; full API `269/269` | Synthetic only; no PHI, Secret, token, DICOM payload or credential |

### Static checks

| Check | Command/result | 판정 |
|---|---|---|
| Tracked patch whitespace | `git diff --check` — exit `0`; only Git line-ending normalization notices | `PASS` |
| New CON-001 source/test/record trailing whitespace | `rg -n "[ \t]+$" services/api/src/consent/domain/consent-artifact.ts tests/api/consent-artifact.test.mjs docs/implementation/MEDIQ-CON-001 docs/POLICY-DECISION-LOG.md` — no matches (`rg` exit `1`, expected for a clean scan) | `PASS` |
| API typecheck | `npm run typecheck:api` — exit `0` | `PASS` |

## 7. 결론

- 결과: `PASS` (domain scope only)
- PASS를 주장할 수 있는 범위: immutable ConsentArtifact factory/reconstitution and eight domain Acceptance groups only
- Not proven: persisted consent, unique version allocation, patient approval, legal consent, Authorization, Grant issue, DB/RLS, API safe errors, Audit or PACS behavior
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
