# MediQ Repository Baseline Audit

**Project:** MediQ  
**Initial Audit Date:** 2026-09-12

**Latest Repository Check:** 2026-09-28 — 현재 판정은 §0 참조
**Repository:** `C:\Users\user\Documents\ChatGPT\메디큐 프로젝트`  
**Branch:** `main`  
**Audit Status:** COMPLETE  
**Capstone Technical Readiness:** BLOCKED  
**Production Readiness:** NOT READY / NOT ASSESSED

## 0. 현재 상태 재점검 — 2026-09-28

**현재 상태는 이 절을 우선한다.** 아래 §1~34는 2026-09-12 감사와 9월 15일 보충의 이력이다. 그 안의 `commit 없음`, `untracked`, 도구 버전과 다음 Ticket 명칭을 현재 사실로 재사용하지 않는다.

사용자가 지정한 제출 마감은 **2026-10-05**다. 상세 점검·작업별 의존성·일별 일정은 [P0-EXECUTION-SCHEDULE.md](P0-EXECUTION-SCHEDULE.md)에 등록했다.

| 재점검 대상 | 현재 관찰 | 현재 판정 |
|---|---|---|
| Git 기준점 | HEAD·origin/main·원격 main이 `4308003d19d929df1828dd162a9c886045d605a3`; 점검 시작 시 clean | 기준 커밋·동기화 확인. Branch protection은 미확인 |
| 도구 | Docker Client/Server 29.8.0, Compose v5.5.1, Node v24.18.0, npm 11.16.0 | 실행 확인 |
| 필수 문서 | 현재 AGENTS.md가 열거한 29/29 존재 | 등록 확인. 일부 Ticket/API/Acceptance 연결은 정리 필요 |
| 제품 구조 | API/Worker/Web은 README와 private ESM npm workspace manifest, root lockfile 존재; Postgres/Orthanc Compose 선언 추가; Infra/Tests는 README 단계 | `ENV-002` workspace·`ENV-003` config·`ENV-004` PostgreSQL runtime은 scoped PASS. Orthanc 실행·제품 코드·Migration·제품 테스트 미검증/미구현 |
| 그 외 실행 산출물 | 문서화 스크립트·정적 HTML 목업과 그 기록 존재 | 제품 E2E와 별도 |
| Runtime 조회 | Compose project label `mediq` 조회 결과 0건 | 해당 label만 확인. 별도 이름의 외부 실행 환경은 미평가 |
| Acceptance | P0 제품 시험 실행 증거 없음 | 제품 PASS 없음. 과거 0/10은 감사 요약 역량 집계 |
| 기술 준비 | 핵심 경로 실행에 필요한 제품 환경·코드 부재 | BLOCKED |

Git 기준점 부재를 뜻하던 과거 BLK-001은 해소되었다. 환경·제품 코드·제품 시험·DICOM 전송 증거 부재는 계속 남아 있다. 새로운 계획 차단점으로 Ticket 의미 충돌과 P0 API/상태·Acceptance 참조 공백을 기록했다. §24의 과거 “충돌 1건”을 현재 문서 전체 충돌 수로 사용하지 않는다.

`MEDIQ-ENV-002` workspace, `MEDIQ-ENV-003` Compose config, `MEDIQ-ENV-004` PostgreSQL runtime은 구현 기록에 범위 한정 PASS로 남겼다. PostgreSQL은 internal-only network에서 healthy이며, 별도 Compose peer의 인증 연결과 restart를 검증했다. internal network와 호스트 publish를 함께 선언해도 실제 호스트 포트가 열리지 않는 불일치를 발견해 DB publish를 제거했다. 다음 실행 작업은 `IMPLEMENTATION-PLAN.md` §9의 **ENV-005 Hospital A Test Orthanc**이며, ENV-006~010에서 B·seed·config·health·smoke를 순차 검증한다. Host에서 실행하는 앱 연결 프로파일은 ENV-008에서 결정한다. Compose/DB runtime PASS는 Migration·제품/Phase 0 완료를 뜻하지 않는다. DB schema는 상세 계획 DB-001~008, 보안은 IAM/AUT/GRT 및 관련 기능 Ticket으로 구분한다. 과거 §29의 묶음 ID는 최신 실행 식별자로 사용하기 전에 매핑한다.

재점검 명령과 실제 결과는 실행 계획표 §9를 따른다. 재점검 당시 제품 Unit/Contract/Integration/Security/E2E와 GitHub 보호 규칙, Secret 전수 검사는 실행하지 않았다. 이후 `MEDIQ-ENV-002`에서 workspace 구조와 오프라인 설치만 검증했다. 기술 준비상태는 여전히 BLOCKED이며, 독립 환경 Ticket을 순차 수행 중이다.

## 1. Purpose

이 문서는 승인된 MediQ Baseline과 현재 Repository의 실제 상태를 비교하여 구현 공백, 보안 공백, Ticket 우선순위와 다음 행동을 고정한다. 감사 중 기능 구현이나 기존 상태의 파괴적 변경은 수행하지 않았다.

## 2. Evidence Boundary

감사 기준일 현재 Repository에는 공식 문서와 초기 디렉터리 README만 존재한다. 다음 명령으로 확인했다.

```text
git branch --show-current       → main
git rev-parse --short HEAD      → 실패: 유효한 commit 없음
git status --short               → 모든 프로젝트 파일이 untracked
docker version                   → 29.7.2 (Docker CLI/Server 사용 가능)
psql                            → NOT_FOUND
docker compose config           → compose 파일 없음
```

실제 환자 데이터, 실제 병원 Endpoint, 운영 PACS Credential에는 접근하지 않았다.

## 3. Normative Baseline

감사에 사용한 기준 문서:

- `docs/PROJECT-CHARTER.md`
- `docs/CAPSTONE-MVP-BOUNDARY.md`
- `docs/PRODUCT-BASELINE.md`
- `docs/REQUIREMENTS.md`
- `docs/SECURITY-REQUIREMENTS.md`
- `docs/DOMAIN-MODEL.md`
- `docs/DATA-MODEL.md`
- `docs/ERD.md`
- `docs/SYSTEM-ARCHITECTURE.md`
- `docs/DATA-FLOW.md`
- `docs/OPENAPI.yaml`
- `docs/THREAT-MODEL.md`
- `docs/ACCEPTANCE-TESTS.md`
- `docs/IMPLEMENTATION-PLAN.md`
- `AGENTS.md`

모든 위 문서는 존재한다. `docs/OPENAPI.yaml`은 YAML 파싱 검증을 통과했다. 기준 문서의 존재는 구현 완료의 증거가 아니다.

## 4. Git / Working Tree Status

| 항목 | 실제 상태 | 판정 |
|---|---|---|
| Branch | `main` | 확인 |
| HEAD commit | 없음 | BLOCKED |
| Working tree | 초기 파일 전체 untracked | BLOCKED |
| 변경 추적 기준선 | 없음 | BLOCKED |
| 보호된 baseline commit | 없음 | BLOCKED |

첫 실행 Ticket에서 초기 baseline commit과 repository convention을 확정해야 한다. 기존 사용자 변경을 삭제하거나 reset하지 않았다.

## 5. Directory Structure

현재 존재하는 구조:

```text
AGENTS.md
README.md
.env.example
docs/
  approved baseline documents
infra/README.md
services/api/README.md
services/worker/README.md
web/README.md
tests/README.md
scripts/README.md
data/.gitkeep
```

애플리케이션 소스, 실제 test suite, Docker 설정, migration, seed, CI 설정은 발견되지 않았다.

## 6. Architecture Alignment

| 영역 | 기대 Baseline | 실제 Repository | 판정 |
|---|---|---|---|
| API | 업무 행위 중심 HTTP API | README/문서만 존재 | MISSING |
| API/Domain | Modular Monolith 경계 | 구현 없음 | MISSING |
| Worker | DICOMweb/STOW-RS 처리 | 구현 없음 | MISSING |
| Web | Viewer/Consent 흐름 | 구현 없음 | MISSING |
| Persistence | PostgreSQL 및 migration | 미존재 | MISSING |
| PACS | Orthanc A/B | compose/config 미존재 | MISSING |
| Audit | lifecycle/audit 저장·조회 | 구현 없음 | MISSING |

## 7. Docker / Runtime Environment

Docker 29.7.2는 설치되어 있으나 `docker-compose.yml` 또는 동등한 compose 구성은 없다. 실행 중인 MediQ Container, Orthanc A/B, PostgreSQL은 검증할 수 없었다.

**판정:** PARTIAL (도구만 존재), P0 환경은 BLOCKED.

## 8. PostgreSQL / Migration / P0 Tables

`psql` CLI, database connection 설정, migration 디렉터리, schema SQL, seed SQL이 없다. 따라서 17개 P0 Table의 존재·PK/FK·Tenant constraint·unique/index·transaction rule을 확인할 수 없다.

**판정:** MISSING / NOT ASSESSED. 문서에 정의된 데이터 모델은 구현 증거가 아니다.

## 9. Organization / Tenant / Hospital

Organization, Tenant, Source Hospital, Destination Hospital의 실제 모델·repository·API·격리 middleware가 없다.

**판정:** MISSING. Tenant isolation은 PASS로 표시하지 않는다.

## 10. PatientReference / PatientMapping

Patient Reference, Hospital-local Patient ID mapping, mapping validation 및 security enforcement 구현이 없다.

**판정:** MISSING. Invalid mapping에서 접근/STOW를 차단하는 실행 증거 없음.

## 11. ExchangeSession

Exchange Session entity, lifecycle state machine, expiry/revocation/failed transition 구현이 없다.

**판정:** MISSING.

## 12. Consent

Consent request, synthetic patient approval, artifact, expiry/revocation 및 consent enforcement 구현이 없다.

**판정:** MISSING. Consent가 없을 때 DENY하는 테스트도 없다.

## 13. Authentication / Authorization / Fail-Closed

Identity provider, authentication middleware, policy engine, authorization decision, fail-closed handler 구현이 없다.

**판정:** MISSING / CRITICAL P0 GAP. 유효 Consent + Authorization 없이는 접근하지 않는다는 실행 증거가 없다.

## 14. TransferGrant

Scoped Grant 발급·검증·만료·취소와 `VIEW`, `DOWNLOAD`, `PACS_IMPORT` action 분리 구현이 없다.

**판정:** MISSING. Grant scope bypass 여부를 테스트할 수 없다.

## 15. DICOMweb / Imaging

QIDO-RS, WADO-RS, STOW-RS adapter, Study/Series/Instance retrieval, Imaging Package, DICOM binary handling 구현이 없다.

**판정:** MISSING. Test Orthanc 연동을 수행하지 않았다.

## 16. Viewer / Download

Web Viewer route, scoped image read path, DICOM download path, content authorization 및 audit hook이 없다.

**판정:** MISSING.

## 17. PACS Import / STOW-RS

Transfer worker, STOW preflight, destination binding, destination verification, idempotency/retry 구현이 없다. Wrong destination, invalid mapping, invalid grant, integrity failure 시 STOW를 막는 코드도 없다.

**판정:** MISSING / P0 CRITICAL PATH BLOCKED.

## 18. Integrity / Provenance / Audit / Logging

Integrity hash/verification, source-to-destination provenance chain, audit event persistence/query, sensitive logging redaction이 없다.

**판정:** MISSING. `COMPLETED`를 검증 결과와 연결할 구현이 없다.

## 19. TLS / Secret Management

`.env.example`은 존재하지만 실행 가능한 secret loading, secret rotation, TLS/mTLS configuration, certificate validation은 구현되지 않았다. 실제 Secret은 발견되지 않았다.

**판정:** PARTIAL (개발 변수 템플릿만 존재), runtime control은 MISSING.

## 20. Test Suite

`tests/README.md`만 존재하며 Unit, Contract, Integration, Security, E2E 테스트 파일과 test runner configuration은 없다. 테스트 실행 결과도 없다.

| Test class | 상태 |
|---|---|
| Unit / Domain | MISSING |
| API / Contract | MISSING |
| Integration with Orthanc A/B | MISSING |
| Security / DENY | MISSING |
| E2E | MISSING |

테스트되지 않은 기능은 PASS 또는 DONE으로 표시하지 않는다.

## 21. Acceptance Coverage

| Acceptance | 요구 결과 | 실제 증거 | 판정 |
|---|---|---|---|
| AT-001 Source Retrieval | DICOMweb Study 조회 | 없음 | BLOCKED |
| AT-002 Patient Mapping | A/MediQ/B 매핑 | 없음 | BLOCKED |
| AT-003 Exchange Session | 생성·추적 | 없음 | BLOCKED |
| AT-004 Consent Deny | Consent 없음 DENY | 없음 | BLOCKED |
| AT-005 Viewer | Consent+Grant PASS | 없음 | BLOCKED |
| AT-006 Download | scoped DICOM PASS | 없음 | BLOCKED |
| AT-007 PACS Import | STOW-RS PASS | 없음 | BLOCKED |
| AT-008 Tenant Isolation | cross-tenant DENY | 없음 | BLOCKED |
| AT-009 Integrity | source/destination 검증 | 없음 | BLOCKED |
| AT-010 Auditability | lifecycle 추적 | 없음 | BLOCKED |

**Acceptance coverage:** 0/10 evidence-backed PASS.

## 22. Legacy Highpass Review

현재 Repository에는 Highpass 코드나 asset이 없다. Orthanc Docker, DICOMweb, TLS/mTLS, Audit, 기존 Test의 재사용 가능성을 assessed 상태로 올릴 근거가 없다.

**LEGACY REUSE:** NOT ASSESSED.  
**정책:** MediQ Baseline과 migration gate를 통과하기 전에는 legacy asset을 도입하지 않는다.

## 23. Documentation Audit

공식 baseline 문서는 모두 현재 Repository에 등록되어 있고 README와 `AGENTS.md`가 문서 탐색 경로를 제공한다. 문서 기준선과 구현의 직접 충돌은 발견되지 않았으나, 구현 부재로 인해 문서-코드 traceability는 연결되지 않는다.

**Documentation:** PASS (등록 상태 기준)  
**Implementation traceability:** BLOCKED

## 24. Baseline Conflicts

구현 코드가 없어 기능적 baseline conflict는 관찰되지 않았다. 다만 커밋이 없어 baseline을 재현하거나 변경 이력을 추적할 수 없다.

- Observed implementation conflicts: `0`
- Baseline reproducibility conflict: `1` (no commit / all files untracked)

## 25. Critical Security Findings

구현된 취약점은 확인할 코드가 없어 직접 판정할 수 없다. 대신 다음 필수 보안 통제가 모두 미구현이며 P0 blocker다.

1. Default-deny Authentication/Authorization 미구현
2. Consent enforcement 미구현
3. Transfer Grant scope enforcement 미구현
4. Tenant isolation 미구현
5. STOW preflight/destination binding 미구현
6. Integrity/Provenance/Audit evidence 미구현

**CRITICAL SECURITY FINDINGS:** 0 observed defects; 6 unimplemented critical controls.

## 26. Blockers

| ID | Blocker | 영향 |
|---|---|---|
| BLK-001 | 보호된 baseline commit 없음 | 재현 가능한 시작점 없음 |
| BLK-002 | Docker/Orthanc/PostgreSQL 환경 없음 | 통합 검증 불가 |
| BLK-003 | 애플리케이션·도메인·보안 구현 없음 | P0 기능 실행 불가 |
| BLK-004 | 테스트 suite 및 runner 없음 | PASS 증거 생성 불가 |
| BLK-005 | DICOMweb/STOW 및 destination verification 없음 | 핵심 E2E 경로 차단 |

**BLOCKERS:** 5

## 27. Risk Register

| Risk | 현재 상태 | 대응 Ticket |
|---|---|---|
| Scope expansion | 문서 기준선은 존재 | 모든 작업을 `MEDIQ-*` ticket으로 제한 |
| Environment drift | compose/seed 없음 | MEDIQ-ENV-001 |
| Security bypass | auth/grant 없음 | MEDIQ-DOMAIN-001 이후 security tickets |
| DICOM complexity | adapter 없음 | MEDIQ-DICOM-001 |
| Unverified completion | tests 없음 | MEDIQ-TEST-001 |
| Legacy contamination | asset 미존재 | 별도 assessment 후 제한 도입 |

## 28. Implementation Gap Analysis

| Capability | Baseline expectation | Actual | Classification |
|---|---|---|---|
| Repository baseline | commit/tree convention | no commit | BLOCKED |
| Local runtime | Orthanc A/B + PostgreSQL | absent | MISSING |
| P0 data layer | 17 tables + constraints | absent | MISSING |
| Domain layer | Patient/Exchange/Consent/Grant | absent | MISSING |
| API | OpenAPI workflow contract | absent | MISSING |
| DICOM | QIDO/WADO/STOW adapters | absent | MISSING |
| Access modes | Viewer/Download/Import | absent | MISSING |
| Security | auth/tenant/fail-closed | absent | MISSING |
| Trust controls | integrity/provenance/audit | absent | MISSING |
| Tests | unit/integration/security/E2E | absent | MISSING |

## 29. Ticket Status Matrix

| Ticket | Scope | Status | Acceptance evidence |
|---|---|---|---|
| MEDIQ-ENV-001 | Repository/runtime baseline audit | COMPLETE | This document |
| MEDIQ-ENV-002 | Docker Compose Orthanc A/B + PostgreSQL | NOT STARTED | None |
| MEDIQ-DATA-001 | Migration + P0 tables/constraints | NOT STARTED | None |
| MEDIQ-DOMAIN-001 | Patient Mapping/Exchange/Consent/Grant skeleton | NOT STARTED | None |
| MEDIQ-SEC-001 | Auth, authorization, tenant isolation, fail-closed | NOT STARTED | None |
| MEDIQ-DICOM-001 | QIDO/WADO/STOW adapter + preflight | NOT STARTED | None |
| MEDIQ-ACCESS-001 | Viewer/Download/PACS Import workflows | NOT STARTED | None |
| MEDIQ-TRUST-001 | Integrity/Provenance/Audit | NOT STARTED | None |
| MEDIQ-TEST-001 | Unit/Integration/Security/E2E suite | NOT STARTED | None |

## 30. P0 Critical Path Status

```text
Repository baseline       BLOCKED
Runtime environment       MISSING
Database/migrations       MISSING
Domain/workflow           MISSING
Security controls         MISSING
DICOM interoperability   MISSING
Viewer/download/import    MISSING
Trust controls            MISSING
Acceptance tests          BLOCKED
P0 E2E                    BLOCKED
```

## 31. Recommended Next Ticket

### `MEDIQ-ENV-002 — Establish Reproducible P0 Test Environment`

**선정 이유:** 현재는 Docker가 설치되어 있지만 Orthanc A/B와 PostgreSQL을 재현할 compose 구성, health check, seed 경로가 없어 이후 모든 기능과 통합 테스트가 시작될 수 없다.

**범위:**

- `infra/docker-compose.yml` 작성
- Hospital A/B Test Orthanc 구성
- PostgreSQL 개발 인스턴스 구성
- health check와 network/volume 경계 정의
- Synthetic/Test 데이터 seed 위치와 실행 문서 정의
- 실제 Credential·환자 데이터가 이미지/저장소에 들어가지 않도록 검증

**완료 증거:**

- `docker compose config` PASS
- A/B Orthanc health check PASS
- PostgreSQL health check PASS
- Synthetic fixture seed PASS
- 실제 환자/운영 Credential 부재 확인
- 환경 문서와 실행 명령 갱신

그 이후의 첫 애플리케이션 Ticket은 `MEDIQ-DATA-001`이다.

## 32. Final Audit Decision

```text
DOCUMENTATION BASELINE: PASS
GIT BASELINE: BLOCKED
RUNTIME BASELINE: MISSING
DATABASE BASELINE: MISSING
DOMAIN IMPLEMENTATION: MISSING
SECURITY IMPLEMENTATION: MISSING
DICOM IMPLEMENTATION: MISSING
TEST IMPLEMENTATION: MISSING
LEGACY REUSE: NOT ASSESSED
BASELINE CONFLICTS: 1 reproducibility conflict
CRITICAL SECURITY FINDINGS: 0 observed / 6 unimplemented controls
BLOCKERS: 5
CAPSTONE TECHNICAL READINESS: BLOCKED
PRODUCTION READINESS: NOT READY
NEXT RECOMMENDED TICKET: MEDIQ-ENV-002
REPOSITORY BASELINE AUDIT: COMPLETE
```

## 33. Audit Limitations

이 감사는 실제 구현이 없는 초기 repository snapshot을 대상으로 했다. 코드·runtime·database·PACS가 추가되면 이 문서를 갱신하여 각 항목을 실제 evidence와 함께 재평가해야 한다. 테스트되지 않은 기능은 이후 감사에서도 PASS로 승격하지 않는다.

---

## 34. Documentation Amendment Note — 2026-09-15

Viewer 및 Storage Architecture 기준문서가 다음 결정으로 개정되었다.

- Hospital PACS = Source of Record
- MediQ Cloud = No Permanent PACS / No Long-Term Imaging Archive
- Hospital User 및 Synthetic Patient Cloud Viewer = P0
- Source PACS WADO-RS On-Demand Retrieval = P0
- Mobile Secure Vault Local Viewer = P1

이 변경은 계획 문서 개정이며 구현 증거가 아니다.

| Newly clarified capability | Repository evidence | Audit status |
|---|---|---|
| Actor-aware ViewerSession | 없음 | MISSING |
| On-demand WADO-RS Viewer delivery | 없음 | MISSING |
| Temporary cache TTL/purge | 없음 | MISSING |
| Backend-only PACS connector isolation | 없음 | MISSING |
| Patient Mobile Vault Viewer | 없음 | P1 NOT STARTED |

기존 Final Audit Decision은 유지한다. `CAPSTONE TECHNICAL READINESS = BLOCKED`, `NEXT RECOMMENDED TICKET = MEDIQ-ENV-002`다.
