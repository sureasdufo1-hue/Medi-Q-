# MEDIQ-CON-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-004` |
| 제목 | Synthetic patient claim-bound Consent approval API |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` (scoped) |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local synthetic test environment |
| Runtime·Toolchain | Node.js v24.18.0; npm 11.16.0; Docker Compose PostgreSQL 18.6 test image |
| 대상 환경 | Local / Test / CI |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-004-API-001` | Signed synthetic patient claim exact match and eligible actor | HTTP + PostgreSQL/RLS | Consent ACTIVE, Session CONSENTED, one success Audit, no Grant | Exact outcome observed | `PASS` |
| `TC-CON-004-API-002~004` | Missing/malformed/mismatched claim; actor separation; cross-Tenant/object BOLA | HTTP + OIDC/JWKS + PostgreSQL/RLS | Safe deny; no state/Audit write | 401/403 outcomes; pending records unchanged | `PASS` |
| `TC-CON-004-API-005` | Wrong Session/Consent state pair and expired Consent/Session | HTTP + PostgreSQL | 409, no approval | Rejected without state/Audit side effects | `PASS` |
| `TC-CON-004-API-006~007` | Idempotent replay and two concurrent identical requests | HTTP + PostgreSQL | One transition/Audit; replay response | Both observed; one Audit | `PASS` |
| `TC-CON-004-API-008` | Consent UPDATE, Session transition, Audit INSERT and COMMIT fault injection | HTTP + PostgreSQL rollback | Full rollback at each fault | All four injected failures left PENDING/CONSENT_PENDING and zero approval Audit | `PASS` |
| `TC-CON-004-API-009` | Exact runtime privilege inventory and forced RLS | PostgreSQL catalog | Exactly 125 grants; exact Consent/Session UPDATE columns; no table-wide grants | 125 rows; updates only `consents(status, issued_at, updated_at)` and `exchange_sessions(state, updated_at)` | `PASS` |
| `TC-CON-004-API-010` | Body/query/header override and untrusted signed-token claims | HTTP + OIDC/JWKS | No claim override; invalid bearer denied | Selector inputs 400; malformed signed claim 401; missing/mismatched claims denied | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API regression

- 목적: Consent approval을 포함한 전체 API 회귀
- 명령: `npm run test:api`
- 종료 코드: `0`
- 핵심 결과: 20개 test file, 361개 test 통과
- 판정: `PASS`

### TEST-002 — TypeScript 및 migration 검사

- 명령: `npm run typecheck:api`; `npm run db:migrations:check`; `npm run test:db-migrations`
- 종료 코드: 각 `0`
- 핵심 결과: API typecheck 및 migration 정합성 검사 통과, migration runner 6개 시험 통과
- 판정: `PASS`

### TEST-003 — DB-008 전체 schema 및 회귀 Gate

- 명령: `./scripts/test-db-008-full-schema.ps1 -EnvFile .env`
- 종료 코드: `0`
- 핵심 결과: disposable DB clean/repeat/reset/reapply 통과; CON-004 signed synthetic OIDC/JWKS HTTP→PostgreSQL/RLS 성공·거부·재생·동시성·rollback Acceptance 통과; DB-009 exact grant/forced RLS 검사 통과; DB-002~007 persistent local development DB 회귀 통과. 최종 local ledger=15, product tables=17, aggregate catalog=`17/44/15/29`, exact runtime grants=125. 기존 local DB volume은 reset하지 않았으며 DB-002~007 단계는 pending migration을 적용했다.
- 판정: `PASS`

### TEST-004 — Integration test 구문 검사

- 명령: `node --check tests/database/consent-approval-api-runtime.integration.test.mjs`
- 종료 코드: `0`
- 핵심 결과: Node.js syntax check 통과
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-004-API-002~010` | Claim tampering, actor separation, cross-Tenant/object mismatch, expired/wrong state, replay/race, injected faults and overgrant probes | Safe denial, one replay/Audit, rollback and no excess grants verified | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live external/production OIDC and real patient identity proofing | Synthetic test issuer only; expressly outside approved P0 scope | No claim of legal/real identity assurance | Separate production identity and legal/security decision |
| Hospital A/B PACS and actual image transfer | No Grant or image/PACS action is in CON-004 scope | No end-to-end medical image exchange proof | Later PACS/Grant Acceptance |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Ticket report and synthetic test outputs | This directory | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` — CON-004 scoped synthetic technical Consent approval API와 관련 DB/RLS 경계
- PASS를 주장할 수 있는 범위: `TC-CON-004-API-001~010` 및 위에 열거한 실행 명령의 결과만 해당
- 입증하지 않은 사항: 실제 환자 신원확인·법적 동의, production OIDC, Authorization/Transfer Grant, Viewer/Download, PACS 및 전체 P0 A→MediQ→B E2E
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
