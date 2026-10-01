# MediQ P0 개발 착수 가이드

**작성일:** 2026-09-28 · **제출 목표:** 2026-10-05

**최신 Ticket 갱신 (2026-10-01):** `MEDIQ-CON-006`은 권고안·요구사항·보안 기준·5 Acceptance를 먼저 기록한 뒤 pure P0 Authorization policy 범위에서 scoped PASS했다. `MOBILE_EXPORT`가 valid P0 Consent action과 혼합된 evidence도 거부하며, exact action/scope map을 검증했다. API 20 files/373 tests, typecheck, `git diff --check` 통과. API/DB/PACS 경로와 권한은 추가되지 않았으며 전체 P0 readiness는 계속 BLOCKED다. 이전 CON-005 DB/withdrawal checkpoint와 ledger=16/runtime grants=126는 각각 CON-005 evidence의 권위가 유지된다.

**이전 Ticket 갱신 (2026-10-01, CON-002 checkpoint):** `MEDIQ-CON-002`는 `CON-002-DEC-001` 및 `TC-CON-002-DB-001~007`을 먼저 기록한 후 internal synthetic PENDING Consent persistence/versioning 범위에서 PASS했다. API 20 files/355 tests, API typecheck, DB-008 scratch 및 DB-002~007 regressions 통과; 임시 privilege inventory 120에서 당시 baseline 100으로 복원했다. 이 결과는 legal Consent, patient identity, Authorization, Grant 또는 접근 API를 의미하지 않는다. 이후 `MEDIQ-CON-003`도 별도 사전 권고안·범위·Acceptance에 따라 완료했다. 이 문단은 CON-002 당시 결과다.

**문서 성격:** 승인 기준의 실행 요약 및 개발 인계 안내. 독립적인 요구사항·API·보안 규격이 아니다.

**이전 실행 checkpoint (2026-09-30, EXC-003):** `EXC-003-DEC-001` 권고안을 기록하고 제한된 목적지 `USER` Session 생성 API, Actor-scoped idempotency, atomic success Audit 및 정확한 column grants를 구현했다. 당시 API regression 19 files / 345 tests, typecheck/migration checks, EXC-002/003 synthetic PostgreSQL RLS integration과 DB-002~007 회귀 및 clean reset/reapply가 PASS였다. 당시 local ledger=13, runtime privilege rows=100, aggregate catalog=17/44/15/29였다. EXC-003은 live OIDC issuer/HTTP→DB end-to-end와 동시요청 Acceptance가 없어 `PARTIAL`이었다. 이후 migration/grant 증가는 최신 CON-003 checkpoint에 기록한다.

**이전 실행 checkpoint (2026-09-30, DB-008/PAT):** `DB-008-DEC-001` registry policy and additive migration 0007 are normative. DB-001~008 schema checks and GATE-IMP-02 PASS with aggregate catalog 17/44/14/29 PK/FK/UNIQUE/CHECK; DB-006 ran before DB-005 for the optional `imaging_package_id` FK. DB-009 enforces minimal runtime privileges and 16 Tenant RLS boundaries; PAT-001 runtime synthetic persistence passed. PAT-002-DEC-002 permits and verifies an internal synthetic same-Hospital read-only mapping path with exactly eight column SELECT privileges; PAT-003-DEC-001 pure-domain destination mapping validation passed 18 focused tests and the API regression passed 16 files/323 tests. No mapping write/API route, authorized destination retrieval or PACS no-STOW path is enabled; PAT-003 product requirement remains PARTIAL. DB-009 overall remains PARTIAL because HTTP safe errors, business Authorization and Preflight are not implemented. That DB-008 run used disposable scratch for reset/reapply, then DB-002~007 against the persistent local `mediq` development DB; the latter applied pending migrations. At that checkpoint local ledger was 12 and runtime column privileges were 70. Older progress sections below are historical snapshots.

**현재 상태(2026-10-01):** `MEDIQ-ENV-002~010`, DB-001~009 DB enforcement, GATE-IMP-02, ORG-001~003은 scoped evidence에서 PASS다. PAT-001~004, IAM-001/002, AUT-001~005는 제한된 범위에서 각각 증거가 있다. Consent-001~006 synthetic domain/persistence/request/approval/withdrawal/action-policy slice도 각 scoped Acceptance PASS다. Local `mediq` development DB migration ledger는 16, runtime column privileges는 126이다. DB-008 DB-002~007 regression은 persistent dev DB에 pending migration을 적용하므로 scratch-only가 아니다. DB-009 overall은 HTTP safe-error, business Authorization 및 Preflight가 남아 PARTIAL이다. ORG-003은 A/B QIDO metadata만 enabled하고 A WADO/B STOW는 disabled다. 합성 CT fixture가 있어도 API는 product A→MediQ→B 영상 교환을 완료하지 않았다. Consent technical API 및 pure action policy는 법적 identity/consent, Grant issuance/enforcement, HTTP protected operation, workforce role, integrity/provenance enforcement, WADO/STOW payload, Viewer/Download/PACS와 전체 P0 Acceptance를 입증하지 않는다. 세부 일정은 [실행 계획표](P0-EXECUTION-SCHEDULE.md)를 따른다.

**PAT-004 실행 갱신 (2026-09-30):** `PAT-004-DEC-001` 권고안과 Acceptance를 선행 문서화한 뒤 mocked persistence-to-domain Acceptance 7/7 및 API regression 17 files / 330 tests를 통과했다. Ticket은 mock adapter/domain 범위에서 PASS다. Live DB/RLS·destination authorization·HTTP와 PACS `no-STOW`는 미실행이고 전체 PatientMapping/PACS requirement는 PARTIAL이다. 최신 구현·시험 증거는 [PAT-004 보고서](implementation/MEDIQ-PAT-004/IMPLEMENTATION-REPORT.md)와 [시험 기록](implementation/MEDIQ-PAT-004/TEST-EVIDENCE.md)를 참조한다.

## 1. 지금 문서를 작성하는 방식

개발자가 오늘 구현할 결과, 지켜야 할 제약, 실행할 시험, 남길 증거를 찾을 수 있도록 작성한다. 설계의 배경 설명은 기존 문서에 연결하고, 동일한 요구사항을 새 문서에 여러 번 복사하지 않는다. 관찰한 사실·이미 승인된 결정·권고·미결정·실행 결과를 구분한다.

| 개발 중 필요한 정보 | 기록 위치 | 작성 기준 |
|---|---|---|
| 목표·P0/P1 경계 | [MVP Boundary](CAPSTONE-MVP-BOUNDARY.md), [Product Baseline](PRODUCT-BASELINE.md) | 범위 변경은 이 원문부터 개정 |
| 무엇을 구현하고 거부하는가 | [요구사항](REQUIREMENTS.md), [보안 요구사항](SECURITY-REQUIREMENTS.md), [위협 모델](THREAT-MODEL.md) | 관찰 가능한 동작과 실패 결과로 표현 |
| 데이터·상태·API 계약 | [Domain](DOMAIN-MODEL.md), [Data](DATA-MODEL.md), [ERD](ERD.md), [OpenAPI](OPENAPI.yaml) | 구현·테스트가 따를 단일 기준. 예시 URL을 임의 계약으로 사용하지 않음 |
| 언제·누가 수행하는가 | [실행 계획표](P0-EXECUTION-SCHEDULE.md), [상세 Ticket](IMPLEMENTATION-PLAN.md) | 담당·선행조건·기한·상태를 갱신 |
| 어떤 선택을 했는가 | [정책 결정 로그](POLICY-DECISION-LOG.md) 또는 Ticket의 ADR | 추천안·대안·이유·범위·영향·검증 조건을 기록 |
| 실제로 무엇을 만들었는가 | [구현 보고서 템플릿](implementation/_templates/IMPLEMENTATION-REPORT.md) | 변경 파일·동작·추적성·미완료·위험 기록 |
| 실제로 무엇을 검증했는가 | [시험 증거 템플릿](implementation/_templates/TEST-EVIDENCE.md) | 명령·환경·예상/실제 결과·종료 코드·근거 기록 |

본 가이드는 문서 탐색의 시작점이다. [AGENTS.md](../AGENTS.md)의 필수 문서 확인과 승인 기준의 우선순위를 면제하지 않는다. 충돌을 발견하면 관련 원문과 Acceptance를 함께 정리하고, 이 요약이 새 기준을 대신 결정하게 하지 않는다.

## 2. 개발자가 먼저 이해할 P0

첫 통합 목표는 **합성 CT Study 한 건이 Hospital A Test Orthanc에서 보안 업무 흐름을 통과해 Hospital B Test Orthanc에 반입되고, 목적지·무결성·출처·감사가 확인되는 것**이다. 최종 P0 완료에는 병원·Synthetic Patient Cloud Viewer와 승인된 DICOM Download도 포함된다.

| 항목 | 현재 기준 | 개발 시 의미 |
|---|---|---|
| 영상 원본 | Hospital PACS가 Source of Record | MediQ를 영구 PACS·장기 영상 보관소로 만들지 않음 |
| 실행 환경 | 로컬 Docker Compose, Test Orthanc A/B, PostgreSQL | 실제 병원 연결·클라우드 배포는 첫 통합의 전제조건이 아님 |
| Backend | Node/TypeScript, NestJS/Fastify, Modular Monolith | 동일 코드베이스의 API·Worker에서 Domain 정책 공유 |
| Web·Viewer | React/Vite, OHIF, MediQ Gateway | Browser가 PACS를 직접 호출하거나 Credential을 받지 않음 |
| 첫 영상 시험 | Classic single-frame CT + Explicit VR Little Endian 우선 | 유효한 Synthetic DICOM·Manifest 필요. 자료집 PNG는 시험 Fixture가 아님 |
| 환자·병원 구분 | MediQ PatientReference와 병원 Local Patient ID 분리 | Mapping이 모호하거나 유효하지 않으면 영상 접근·반입 거부 |
| 인증·인가 | Synthetic/Test issuer·JWT 검증 및 서버 Domain Authorization | 계정 선택 UI, Tenant 입력, URL·UID만으로 권한을 부여하지 않음 |
| 작업 권한 | `study:view`, `study:download`, `study:pacs-transfer` 분리 | 동의·Authorization·Grant를 각각 검사, VIEW를 Download/Import로 승격하지 않음 |
| 데이터 수명 | 필요한 메모리·제한된 임시 처리 | 임시 객체 binding·TTL·purge 증거와 Browser no-store 적용 |
| 후속 기능 | Mobile Vault·QR·환자/병원 편의·RAG는 P1 등 | 10월 5일 계획의 신규 구현 우선순위에 포함하지 않음 |

버전 기준은 [TECH-STACK-DECISION.md](TECH-STACK-DECISION.md), 영상 조합과 처리 기준은 [DICOM-INTEROPERABILITY-PROFILE.md](DICOM-INTEROPERABILITY-PROFILE.md)를 따른다. 이 가이드에서는 새 버전을 선정하지 않는다. 구현 시 실제 설치·호환성을 검증하고 exact version·lockfile·image digest를 기록한다. 대안이 필요하면 선택 이유와 관련 결정서를 함께 갱신한다.

## 3. 첫 제품 흐름과 완료 판정

아래는 PACS Import 구현 순서의 요약이며 새 Domain 상태 enum이 아니다. 조회와 콘텐츠 접근의 각 API에는 승인된 해당 권한 정책을 적용한다.

1. 서버가 인증된 Actor·Tenant를 확인하고 Exchange·PatientReference·병원 A/B를 결합한다.
2. 승인 범위에서 Study를 선택하고, 동의 요청의 목적·영상 범위·작업·목적지·만료를 정한다.
3. 해당 Synthetic Patient가 동의한다. 다른 환자의 동의를 대신 승인할 수 없어야 한다.
4. 서버가 Consent와 별도로 Authorization을 평가하고, 정확한 자원·수신자·작업·만료의 Grant를 발급한다.
5. 허가된 Source를 WADO-RS로 조회하고 Imaging Package·예상 Instance 집합·원본 Integrity evidence를 준비한다.
6. STOW 직전 Mandatory Preflight에서 Tenant, Mapping, 현재 Consent/Authorization/Grant, 목적지, 만료, 허용 Endpoint와 Integrity/Provenance context를 검증한다.
7. 통과한 경우에만 병원 B에 STOW-RS를 실행한다.
8. 목적지의 실제 Instance 집합과 필요한 콘텐츠 무결성을 확인하고 Provenance·Audit를 연결한다.
9. 완료 조건이 모두 성립한 서버 결과만 UI에 `COMPLETED`로 표시한다.

| 사건 | 허용되는 판정·후속 동작 |
|---|---|
| Preflight 실패 | STOW 호출 0건, 안전한 거부 사유·감사 기록 |
| STOW 성공 응답 수신 | 저장 후보. 목적지 검증·Integrity 없이 완료 표시 금지 |
| STOW 응답 손실·Timeout | 결과 불명으로 취급, 목적지 확인·상태 복구 후 재시도 판단 |
| 일부 Instance만 저장 | 전체 완료 금지. 확인된 수신 집합·누락·실패를 추적 |
| 목적지 불일치 또는 Integrity 실패 | 완료 금지, 실패·조사 결과를 보존 |
| 모든 Gate 충족 | Destination Verification·Integrity·Provenance·Audit 근거로 완료 |

판정 기준은 [Data Flow](DATA-FLOW.md), [DICOM Profile](DICOM-INTEROPERABILITY-PROFILE.md), [Acceptance Tests](ACCEPTANCE-TESTS.md)의 `AT-E2E-003`을 따른다. 기술 Spike의 직접 A/B 시험은 격리된 합성 테스트이며 보안 업무 흐름을 통과한 제품 E2E와 별도로 보고한다.

## 4. 코드 위치와 책임

| 위치 | 맡을 책임 | 구현 시 확인할 기준 |
|---|---|---|
| `services/api/` | 인증 Context, Domain/Application, 업무 API | OpenAPI·객체별 인가·Tenant/Patient binding |
| `services/worker/` | 승인된 전송 작업·중단·복구·목적지 확인 | 처리 시점 정책 재검증, Idempotency, 완료 Gate |
| `web/` | 병원·Synthetic Patient 업무 화면, Viewer 연결 | 서버 결과로 상태 표시, 직접 PACS 호출 금지 |
| `infra/` | Compose·Test PACS·DB·로컬 네트워크/TLS 설정 | 재현 가능한 설정, 독립 PACS 데이터·로컬 Secret |
| `tests/` | Contract·Integration·Security·E2E | 실제 Orthanc A/B 시험과 차단 시 upstream 호출 수 검증 |
| `scripts/` | 환경·Fixture·증거 생성 보조 | 반복 실행·실패 반환·대상 범위 제한 |
| `data/` | 실행 시 생성한 로컬 합성 데이터 | Runtime DICOM Git 제외, Fixture 재생성 방법은 추적 |

현재 제품 디렉터리는 README 단계다. 위 표는 책임 배치 계획이며 실제 모듈·배포가 존재한다는 뜻이 아니다. [System Architecture](SYSTEM-ARCHITECTURE.md)를 따르며 DB·보안 정책을 Web에 복제하지 않는다.

## 5. 첫 환경 구축을 Ticket으로 나누기

아래 의미는 [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) §9의 상세 정의를 따른다. 과거 감사에서 ENV-002가 전체 환경을 뜻했던 표현과 구분한다. 예정 경로는 구현 시 확정하고 변경하면 보고서·실행 안내를 함께 갱신한다.

| Ticket | 만들 결과 | 위치·증거 (계획 / 실제) | 완료 기준 |
|---|---|---|---|
| MEDIQ-ENV-002 | 저장소 구조·책임·실행 진입점 정렬 | 기존 `services/`, `web/`, `infra/`, `tests/`, `scripts/` | 기존 변경 보존, 구조와 후속 작업 매핑 |
| MEDIQ-ENV-003 | Compose 기본 구성 | `infra/docker-compose.yml` 예정 | 해석 가능한 Compose, 서비스·network·volume 경계 확인 |
| MEDIQ-ENV-004 | 로컬 PostgreSQL | `infra/docker-compose.yml`; internal-only `database` network | 기동·health·재시작·별도 Compose peer 인증 연결 통과; host port 미공개, schema/migration과 구분 |
| MEDIQ-ENV-005 | Hospital A Test Orthanc | `infra/docker-compose.yml`의 A 환경변수·healthcheck; `scripts/test-orthanc-a.ps1`; [시험 증거](implementation/MEDIQ-ENV-005/TEST-EVIDENCE.md) | A health·인증 거부·DICOMweb QIDO readiness 확인 |
| MEDIQ-ENV-006 | Hospital B Test Orthanc | `infra/docker-compose.yml`의 B 환경변수·healthcheck; `scripts/test-orthanc-b.ps1`; [시험 증거](implementation/MEDIQ-ENV-006/TEST-EVIDENCE.md) | B health·인증 거부·DICOMweb QIDO 및 A/B 네트워크·볼륨 분리 확인 |
| MEDIQ-ENV-007 | Synthetic DICOM 준비·seed | `scripts/generate-synthetic-ct.py`, `scripts/validate-synthetic-ct.py`, `scripts/seed-synthetic-ct.ps1`; ignored data `data/synthetic-ct-env007/` | PASS: SOP Class·Transfer Syntax·UID/count/hash manifest, A-only STOW seed, idempotent rerun, B empty; see [evidence](implementation/MEDIQ-ENV-007/TEST-EVIDENCE.md) |
| MEDIQ-ENV-008 | App configuration·DB role boundary | `services/api/src/config/app-config.ts`, `.env.example`, `scripts/setup-local-postgres-roles.ps1`, `scripts/validate-app-config.ps1` | PASS: container profile/required env validation, bootstrap/runtime/migration separation, runtime no DDL, invalid password rejected; product API connection/schema remain unimplemented |
| MEDIQ-ENV-009 | Health checks | `scripts/test-environment-health.ps1`, internal health-only API | API + PostgreSQL + A/B full operational health gate PASS; business API excluded |
| MEDIQ-ENV-010 | 재현 가능한 smoke test | `scripts/test-environment-smoke.ps1` | Compose 재현 기동, fixture manifest/hash 검증, API/DB/A/B readiness 및 A-only synthetic Study 확인; no reset |
| MEDIQ-DB-001 | P0 migration framework | Drizzle Kit generated SQL + `scripts/run-database-migrations.mjs`; opt-in least-privilege migrator | Repeatable empty-product-schema ledger test; product tables/schema grants not included; see [evidence](implementation/MEDIQ-DB-001/TEST-EVIDENCE.md) |
| MEDIQ-DB-002 | Organization/Tenant/Hospital registry | Five tables with approved keys/checks/indexes; synthetic rollback integration PASS; no grants/RLS/API; see [evidence](implementation/MEDIQ-DB-002/TEST-EVIDENCE.md) |
| MEDIQ-DB-003 | PatientReference/PatientMapping | Two tables with synthetic status/FK/unique/rollback checks; no real patient identifiers or import authorization; see [evidence](implementation/MEDIQ-DB-003/TEST-EVIDENCE.md) |

DB/PACS/API health만 실행한 상태와 Phase 0 전체 완료를 구분한다. PostgreSQL은 `database` network 내부에서 `postgres:5432`로 접근한다. ENV-009 operational API는 runtime role로 `SELECT 1`을 수행하고 A/B readiness를 확인하지만 product schema·business endpoint·Worker·Tenant RLS는 포함하지 않는다. 전체 P0 Gate는 별도 제품 API 및 보안 업무 흐름 Acceptance가 있어야 PASS다.

현재 [.env.example](../.env.example)의 주소·개발용 placeholder는 템플릿이다. 컨테이너 내부 `localhost`와 Host의 주소는 설정 시 구분해야 한다. placeholder를 유효한 암호키나 배포 Credential로 취급하지 않는다. 로컬 TLS·Port·Endpoint 계약을 정리하고 인증서 검증을 끄는 방식으로 통합 시험을 통과시키지 않는다.

### 첫 기록 예시: MEDIQ-ENV-003

**목표:** 후속 DB·PACS Ticket이 사용할 Compose 경계와 재현 가능한 진입점을 만든다. **선행:** 환경 점검 결과와 이 Ticket의 단일 의미 확인. **완료 근거:** Compose 구문 검사 및 정의한 경계 확인; 실제 서비스 실행 시험은 구성한 범위만 기록한다.

아래는 **착수 때 사용할 예시 명령이며 이 문서 작성 중 실행한 명령이 아니다.** 기존 기록이 있으면 새로 생성하지 않고 연다.

```powershell
./scripts/new-implementation-record.ps1 `
  -Ticket MEDIQ-ENV-003 `
  -Title "P0 Docker Compose baseline" `
  -Classification CAPSTONE-P0
```

이 명령은 ENV-003 Compose 기준선 검사 예시다. 이미 구현된 Ticket은 해당 Ticket의 실제 환경과 `TEST-EVIDENCE.md`에 기록된 명령·결과를 사용한다. Compose 구문 검사만으로 실행 가능성이나 서비스 health를 주장하지 않는다.

```powershell
docker compose -f infra/docker-compose.yml config --quiet
```

config 해석 성공은 Container health나 E2E 성공과 다르다. 실제 startup·seed·health·integration 명령은 구현된 서비스 이름과 스크립트에 맞추어 Ticket의 `TEST-EVIDENCE.md`에 기록한다. 확장된 전체 config 출력에는 Secret이 포함될 수 있으므로 증거에는 값이 드러나지 않는 검사 결과를 사용한다.

## 6. 연관 구현 전에 닫을 결정 목록

모든 항목의 현재 상태는 **OPEN**이다. 담당 역할은 배정 제안이며 실제 담당자는 실행 계획표에서 확정한다. 결정 근거가 없는 항목을 단순히 APPROVED로 바꾸지 않는다.

| 결정 항목·기존 ID | 권고 담당 | 결정으로 남겨야 할 내용 | 완료 증거·차단 작업 |
|---|---|---|---|
| Ticket 의미 중복 | 개발 총괄 | ENV-002 및 DB-001/AUD-001, 과거 묶음 ID의 원문·참조 매핑 | 충돌 참조 수정·검사. 영향받는 기록 생성 전 |
| 버전·Fixture: DICOM-DEC-001/002 | Infra·DICOM | 실제 설치 버전·plugin·digest, 첫 Synthetic CT Manifest | A/B capability·seed 시험. DICOM 통합 전 |
| Consent read/reject: SAAS-OD-003 | Backend·Web | Actor/Patient binding, 상세 필드, 거절 상태와 오류·감사 | OpenAPI·Domain·요구사항·Acceptance 동기화. 승인/거절 UI 연결 전 |
| Viewer metadata: SAAS-OD-005, DICOM-DEC-004 | Viewer·Backend | OHIF discovery·session 전달·metadata/픽셀 권한·cache 경계 | 승인 계약·Contract Test·Browser network 증거. Viewer 완료 전 |
| 전송 상태·복구: SAAS-OD-006, DICOM-DEC-008 | Backend·DICOM | 작업 ID·멱등성·상태 조회·결과 불명·부분 성공·재시작·중복 방지 | API/상태·필요 시 Data/ERD 개정, 응답 손실 시험. 복구 동작 구현 전 |
| 브라우저 인증: SAAS-OD-007 | Backend·Web·보안 | 쿠키/BFF 또는 memory token 경로, 필요한 CSRF·CORS·로그아웃 동작 | 선택 ADR·보안시험. 인증 UI/API 연결 전 |
| TLS·성능·무결성: DICOM-DEC-006/007/009 | Infra·DICOM·보안 | 신뢰 설정, timeout/size/concurrency, 비교 대상 representation | 실측·경계값·잘못된 인증서·무결성 시험. 지원 범위/보안 PASS 전 |
| Acceptance 참조 오류 | QA·기능 담당 | Integrity는 AT-SEC-018, 민감 로그는 AT-SEC-020임을 기준으로 관련 행 정정 | 실제 시험 제목·요구사항 대조. 해당 완료 보고 전 |

자세한 공백은 [실행 계획표 §5](P0-EXECUTION-SCHEDULE.md#5-착수-전에-정리할-충돌과-결정)와 [SaaS 화면설계](SAAS-SCREEN-DESIGN-SPEC.md)의 Open Decisions를 따른다. 이 표 자체는 신규 Endpoint·테이블·재시도 정책을 승인하지 않는다. 독립적인 환경 작업은 필요한 결정이 닫히는 동안 병렬 진행할 수 있다.

## 7. 시험으로 증명할 것

| 구현 결과 | 정상 시험 | 함께 필요한 거부·실패 시험 | 원문 기준 |
|---|---|---|---|
| Mapping·Exchange | 유효한 Patient/Session 조회·생성 | 잘못된 Mapping, 다른 객체 접근, Tenant 위조 | AT-FUNC-001~003, AT-SEC-003/004/012/026 |
| Consent·Grant | 본인 승인·유효한 작업 범위 발급 | 동의 없음/철회, 만료, 다른 수신자, Scope 상승 | AT-FUNC-005~009, AT-SEC-005~009 |
| PACS Import | 예상 Instance·목적지·Integrity·출처·감사 일치 | VIEW-only, wrong destination, Mapping 실패, Integrity mismatch, STOW 응답 손실 | AT-E2E-003, AT-SEC-011~013/018, AT-DICOM-003 |
| Cloud Viewer | 병원 및 해당 Synthetic Patient 열람 | UID/URL 우회, 만료·철회 후 재요청, PACS 장애 | AT-E2E-001, TC-VIEW-004~009, TC-SEC-VIEW-001~003 |
| DICOM Download | 승인한 Study 다운로드·감사 | VIEW-only, 잘못된 scope/recipient, 중단·만료 | AT-E2E-002, AT-SEC-008~010 |
| 임시 데이터·로그 | no-store·TTL/purge, 최소 감사 Context | 임시 객체 직접 접근, 로그의 Secret/Payload, 인증서 실패 | AT-SEC-019~023, TC-DATA-004/005, AT-AUD-001~003 |

표는 구현자용 요약이다. 최종 적용 시험은 [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md), [DICOM Profile](DICOM-INTEROPERABILITY-PROFILE.md)과 변경한 기능의 기준을 모두 대조한다. 이 목록을 전체 P0 시험의 대체 목록으로 사용하지 않는다.

UI 캡처만으로 STOW 미호출·Tenant 격리·Integrity를 입증하지 않는다. 실제 Adapter 호출 수, 목적지 조회, 비교 결과, 보존된 감사·출처 Context 등 해당 조건을 관찰할 증거를 남긴다. Mock은 Unit Test에 사용하고 최종 PACS 통합·E2E는 Test Orthanc A/B에서 실행한다.

## 8. 코드와 문서를 한 작업으로 끝내기

1. 실제 Ticket의 범위·요구사항·보안·Acceptance를 확인하고 기존 기록을 열거나 생성한다.
2. 필요한 계약 변경이 있으면 승인 기준과 테스트 기준을 먼저 함께 정리한다.
3. 최소 구현과 해당 정상·거부·장애 시험을 작성·실행한다.
4. 구현 보고서에 변경 파일·실제 동작·미완료·위험을 적는다.
5. 시험 증거에 대상 commit/working-tree 변경, 버전·Fixture, 명령·종료 코드·예상/실제 결과를 적는다.
6. 실행하지 못한 시험은 `NOT RUN`과 이유·영향을 적고 [구현 기록 색인](implementation/README.md)을 갱신한다.

작성할 때 다음 표현을 구분한다.

| 표현 | 사용할 수 있는 조건 |
|---|---|
| DOCUMENTED / PLANNED | 계약·계획만 작성됨 |
| IMPLEMENTED | 실제 코드·설정이 작성됨. 완료·검증을 뜻하지 않음 |
| TESTED | 지정 시험을 실행하고 결과를 기록함. 모든 시험 성공과는 다름 |
| PASS | 해당 평가 범위의 요구사항·구현·시험·문서 증거가 충족됨 |
| FAIL / NOT RUN | 실제 기대 위반 / 미실행을 각각 기록 |

예를 들어 Compose 검사가 성공해도 ENV 전체나 제품 P0는 PASS가 아니다. 시험 기록의 예상 결과와 실제 결과를 같은 칸에 작성하지 않는다. 기존 [보고서](implementation/_templates/IMPLEMENTATION-REPORT.md)·[증거](implementation/_templates/TEST-EVIDENCE.md) 템플릿을 사용하므로 별도 중복 양식을 만들 필요가 없다.

## 9. 마감까지 유지할 우선순위

바로 착수할 작업은 ENV-002~010 환경 구성과 독립적인 계약 결정 정리다. 이후 인증·Domain 정책과 DICOM 기술 Spike 결과를 결합해 **10월 1일 첫 보안 E2E**, **10월 3일 전체 시험 결과**, **10월 4일 기능 동결·재현**, **10월 5일 제출**을 목표로 한다. 상세 날짜별 담당·결과는 [실행 계획표](P0-EXECUTION-SCHEDULE.md) 한곳에서 관리한다.

팀 가용 시간이 아직 확정되지 않았으므로 완료를 보장하지 않는다. 마감에 미달한 기능은 검증됨·미검증·미구현·목업으로 나누어 제출 상태를 설명하고 필수 보안·완료 Gate를 면제하지 않는다.

## 10. 이번 문서 작업의 범위

```text
Ticket: 사용자 요청 P0 개발 착수 가이드 문서 작업
Scope: 승인 기준 요약, 첫 Ticket 인계, 미결정·수용 기준, 구현/시험 기록 안내
Changed: P0-DEVELOPER-BASELINE.md 신규와 README·실행 계획표 탐색 링크
Not changed: 제품 코드·설정·OpenAPI·DB·보안 규격·P0 완료조건
Security impact: 기존 보안 불변조건 및 증거 기반 완료 원칙을 실행 기준에 연결
Tests executed: 변경 문서 링크, Ticket/시험/결정 ID 대조, 공백 검사
Tests not executed: 제품 Unit/Contract/Integration/Security/E2E — 제품 구현 부재
Evidence: 본 문서 및 연결된 승인 기준, 아래 문서 검사 결과
Implementation record: 순수 문서 작업 예외; 실제 구현 착수 시 Ticket별 두 기록 필수
Remaining risks: OPEN 계약·ID 정리, 실제 환경/제품 구현, 팀 가용 시간
Status: PASS — 요청된 가이드 문서 작성·검사 범위; 제품은 NOT IMPLEMENTED / NOT RUN
```

문서 검사 결과(2026-09-28):

- 이번 변경 문서 3개에서 상대 로컬 링크 87개 검사, 존재하지 않는 대상 0개. 실행 계획표 §5 링크의 제목도 대조했다.
- 가이드의 범위 표기를 확장해 Ticket·Acceptance·Open Decision ID 61개를 각 원문과 대조, 누락 0개. ID 존재 검사는 미결정 사항을 해결했다는 의미가 아니다.
- ENV-002~010의 의미와 AT-E2E-003, AT-SEC-018/020의 시험 제목을 직접 대조했다.
- `git diff --check` 종료 코드 0. 신규 가이드·계획표의 후행 공백 별도 검사 통과.
- 예시 구현 기록 생성·Compose 명령과 제품 시험은 실행하지 않았다. 기존 미커밋 문서 변경을 보존했으며 이번 작업에서도 commit/push는 수행하지 않았다.
