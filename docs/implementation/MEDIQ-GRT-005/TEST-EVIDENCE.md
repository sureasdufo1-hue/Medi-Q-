# MEDIQ-GRT-005 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-005` |
| 제목 | P0 TransferGrant Scope Enforcement |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` |
| 결과 | `PASS` — pure policy scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 Education |
| Node.js / npm | `v24.18.0` / `11.16.0` |
| PowerShell | `7.6.5` |
| 대상 | Local API build and Vitest unit tests |
| 데이터 | Synthetic-only policy fixtures; no clinical data |

## 2. Acceptance 결과

| 검증 ID | 실제 결과 | 판정 |
|---|---|---|
| `TC-GRT-005-AUTH-001` | `VIEW` permits only `study:view` | `PASS` |
| `TC-GRT-005-AUTH-002` | `DOWNLOAD` permits only `study:download` | `PASS` |
| `TC-GRT-005-AUTH-003` | `PACS_IMPORT` policy permits only `study:pacs-transfer`; no PACS callback exists in this pure test | `PASS` |
| `TC-GRT-005-AUTH-004` | Cross-action scope coercion is denied | `PASS` |
| `TC-GRT-005-AUTH-005` | Missing requested scope is denied for all three P0 actions | `PASS` |
| `TC-GRT-005-AUTH-006` | Duplicate, unsupported, unknown and P1 mobile-export scopes are denied | `PASS` |
| `TC-GRT-005-AUTH-007` | Grant scope expansion beyond Consent or missing requested Consent action is denied | `PASS` |
| `TC-GRT-005-AUTH-008` | Malformed/missing scope evidence and resolver failure are denied | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build

```powershell
npm run build:api
```

- 종료 코드: `0`
- 결과: API TypeScript build passed.

### TEST-002 — Dedicated policy file

```powershell
npm exec vitest -- run tests/api/object-authorization-policy.test.mjs --reporter=dot
```

- 종료 코드: `0`
- 결과: `1` file passed, `96` tests passed, including the eight `TC-GRT-005-AUTH-*` cases.

### TEST-003 — API typecheck

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 결과: API `tsc --noEmit` passed.

### TEST-004 — Full API regression

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: `0`
- 결과: `24` files passed, `461` tests passed.

## 4. 실패·거부 경로

All eight dedicated Acceptance cases passed. Scope omissions, wrong action/scope pairs, duplicate/unknown/P1 scopes, Consent expansion, malformed evidence and resolver exceptions all produce `DENY` in the pure policy.

## 5. 의도적으로 실행하지 않은 시험

| 시험 | 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| HTTP route, live PostgreSQL Evidence Reader / RLS | No route or persistence behavior is in this Ticket | Pure policy inputs are not proof of trusted live request facts | Separate protected-operation integration Acceptance |
| Viewer/Download response, PACS Import/STOW side effect | Scope decision alone cannot authorize or execute protected resource operations | No data/side-effect boundary is proven here | Separate `MEDIQ-VIEW-*`, `MEDIQ-DWN-*`, `MEDIQ-PACS-*` gates |
| Decision-to-side-effect race fencing | No operation execution/lease boundary is part of this pure-policy Ticket | Concurrent revoke versus in-flight operation remains unproven | Define a separate lease/fencing Acceptance before those integrations |
| DB migration/DB-008 | No schema, runtime privilege or repository change was made | None introduced by this Ticket | Not applicable |

## 6. 결론

- 결과: `PASS` for `MEDIQ-GRT-005` pure scope-policy Acceptance only.
- Scope decision rules reuse `decideObjectAuthorization`; no duplicate policy evaluator was added.
- This PASS does not establish live HTTP authorization, image delivery, Download, PACS/STOW behavior or overall P0 completion.
- No real patient data, DICOM payload, credential, token or secret was used or recorded.
