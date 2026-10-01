# MEDIQ-GRT-007 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-007` |
| 제목 | Strict TransferGrant Expiration Validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` — scoped temporal policy and issuance TTL tests only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Node.js | `v24.18.0` |
| npm | `11.16.0` |
| 대상 | API unit/service tests; no external service required |
| 데이터 | Synthetic deterministic timestamps and fixtures only |

## 2. Acceptance 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-GRT-007-EXP-001` | Inclusive `issuedAt` boundary | Pure policy | `now === issuedAt` may allow when all other evidence is valid | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-002` | Future issue time | Pure policy | Deny | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-003` | Exact expiry boundary | Pure policy | Deny at `now === expiresAt` | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-004` | ACTIVE status with elapsed expiry | Pure policy | Deny; do not trust status alone | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-005` | Missing/malformed timestamps or non-positive interval | Pure policy | Fail closed | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-006` | Non-ACTIVE/revoked Grant despite future expiry | Pure policy | Deny | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-007` | Expired/terminal Session or Consent | Pure policy | Deny | Dedicated policy case passed | `PASS` |
| `TC-GRT-007-EXP-008` | Issue TTL capped by Consent/Session expiry and 30-minute maximum | Issue service | Use earliest expiry; never exceed cap | Dedicated service case passed | `PASS` |

## 3. 실행 명령과 결과

실행 시각은 2026-10-01 (Asia/Seoul); 아래 결과는 이번 Ticket의 실제 실행 기록이다.

### TEST-001 — Focused expiry policy and issue-service regression

```powershell
npm exec vitest -- run tests/api/object-authorization-policy.test.mjs tests/api/grant-issue.service.test.mjs --reporter=dot
```

- 종료 코드: `0`
- 결과: 2 files / 145 tests passed; eight `TC-GRT-007-EXP-*` cases passed.
- 판정: `PASS`

### TEST-002 — API build

```powershell
npm run build:api
```

- 종료 코드: `0`
- 결과: API TypeScript build passed.
- 판정: `PASS`

### TEST-003 — API typecheck

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 결과: API typecheck passed.
- 판정: `PASS`

### TEST-004 — Full API regression

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: `0`
- 결과: 25 files / 473 tests passed; command also ran the API build step.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-GRT-007-EXP-002~007` | Future/malformed time, exact/elapsed expiry, revoked/terminal Grant, expired parent Session/Consent | All cases denied by pure policy | `PASS` |

These are unit/policy denial cases, not HTTP responses or proof that an image/PACS side effect is suppressed by a live route.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Protected HTTP operation re-checks expiry | This ticket adds regression evidence for an existing pure policy; no protected operation route is wired | A future route could fail to call the policy at use time | Implement under the protected-operation/Preflight ticket and test deny-before-side-effect |
| Viewer/Download/PACS expiry denial | No image operation adapter/route was part of this ticket | Policy pass does not prove data or STOW is withheld after expiry | Add operation-level integration tests |
| Cache invalidation, viewer-session termination, in-flight fencing | No cache/session or streaming lifecycle implementation was changed | Already-authorized work may need explicit termination semantics | Decide and document within viewer/session integration scope |
| PostgreSQL/RLS or Test Orthanc integration | No schema, persistence, privilege or PACS code changed | No live DB/PACS behavior is claimed | Run when the protected operation path is implemented |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Acceptance definitions/status | `docs/ACCEPTANCE-TESTS.md`, `TC-GRT-007-EXP-001~008` | Synthetic-only; no PHI/secret |
| Test source | `tests/api/object-authorization-policy.test.mjs`; `tests/api/grant-issue.service.test.mjs` | Synthetic fixtures only |
| Decision record | `docs/POLICY-DECISION-LOG.md`, `GRT-007-DEC-001` | No PHI/secret |
| Implementation summary | `IMPLEMENTATION-REPORT.md` | No PHI/secret |

## 7. 결론

- 결과: `PASS` — strict temporal pure-policy cases and Grant issue TTL cap only.
- PASS가 증명하는 범위: existing `issuedAt <= now < expiresAt` rule, ACTIVE/not-revoked and parent Session/Consent validity checks, invalid-time fail-closed behavior, plus the issue-service TTL cap, as covered by the listed tests.
- PASS가 증명하지 않는 범위: HTTP operation-time enforcement, image delivery denial, Viewer/cache/in-flight termination, PACS/STOW no-call, or overall P0 completion.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM은 증거에 포함하지 않는다.
