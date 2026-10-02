# MediQ Implementation Records

이 디렉터리는 하나의 승인된 `MEDIQ-*` Ticket 안에서 구현, 실행·시험, 문서화를 함께 완료했다는 증거를 보관한다.

구현 기록은 요구사항·보안·아키텍처 같은 승인 기준 문서를 대체하지 않는다. 실제 구현 결과와 검증 결과를 기준선에 연결하는 실행 기록이다.

## 1. 적용 대상

다음 변경은 작업 시작 시 Ticket별 구현 기록을 생성해야 한다.

- 애플리케이션 코드, 테스트 코드 또는 빌드 코드
- 런타임 설정, 배포·인프라 설정 또는 데이터베이스 Migration
- API, 데이터 모델, 보안 통제 또는 외부 연동
- 실행 가능한 자동화 스크립트

단순 질의, 읽기 전용 조사, 오탈자 정정처럼 실행 가능한 결과물이 없는 문서 작업은 생성을 생략할 수 있다. 여러 Ticket을 한 번에 다루면 Ticket별 디렉터리를 각각 사용한다.

## 2. 필수 작업 흐름

```text
승인 Ticket 확인
→ 구현 기록 생성 또는 열기
→ 요구사항·보안·Acceptance Traceability 기록
→ 코드·설정 변경
→ 필요한 명령과 테스트 실행
→ TEST-EVIDENCE.md에 실제 명령·결과 기록
→ IMPLEMENTATION-REPORT.md에 구현·미구현·위험 기록
→ 관련 승인 기준 문서 동기화
→ 최종 상태 판정
```

코드만 작성한 상태는 완료가 아니다. 실행하지 않은 테스트는 `PASS`로 기록할 수 없으며, 미실행 이유와 잔여 위험을 명시해야 한다.

## 3. 디렉터리 구조

```text
docs/implementation/
├── README.md
├── _templates/
│   ├── IMPLEMENTATION-REPORT.md
│   └── TEST-EVIDENCE.md
└── MEDIQ-<AREA>-<NNN>/
    ├── IMPLEMENTATION-REPORT.md
    └── TEST-EVIDENCE.md
```

PowerShell에서 다음 명령으로 기록을 생성한다.

```powershell
./scripts/new-implementation-record.ps1 `
  -Ticket MEDIQ-API-001 `
  -Title "Exchange session API" `
  -Classification CAPSTONE-P0
```

스크립트는 기존 Ticket 디렉터리를 덮어쓰지 않는다.

## 4. 상태 정의

| 상태 | 의미 |
|---|---|
| `PLANNED` | 범위와 추적성만 정의됨 |
| `IN_PROGRESS` | 구현 또는 검증이 진행 중 |
| `IMPLEMENTED` | 변경은 작성됐으나 필수 검증이 끝나지 않음 |
| `TESTED` | 계획된 검증을 실행하고 결과를 기록함 |
| `ACCEPTED` | 승인된 Acceptance 기준까지 충족함 |
| `PARTIAL` | 일부 결과는 있으나 필수 구현·검증·문서화가 남음 |
| `BLOCKED` | 외부 의존성 또는 결정 부재로 더 진행할 수 없음 |

`IMPLEMENTED != DONE`이며, `PASS`는 해당 Ticket에 필요한 구현·문서·시험 증거가 모두 있을 때만 사용할 수 있다.

## 5. 증거 작성 원칙

- 실행한 명령은 재현 가능한 형태로 정확히 기록한다.
- 종료 코드, 핵심 결과, 실행 일시와 환경을 기록한다.
- 성공·실패·거부 경로를 구분한다.
- 실행하지 못한 시험은 이유, 영향, 후속 조치를 기록한다.
- 실제 환자정보, 운영 DICOM, Credential, Token, Secret, 암호화 키 또는 민감 Payload를 포함하지 않는다.
- 대용량 로그는 안전한 별도 산출물 경로를 연결하고 기록에는 요약과 무결성 정보를 남긴다.

## 6. 구현 기록 색인

| Ticket | 분류 | 제목 | 상태 | 보고서 |
|---|---|---|---|---|
| `MEDIQ-GOV-002` | `CAPSTONE-P0` | Recommendation-led policy decision governance and documentation | `PASS` (decision workflow/documentation) | [Implementation Report](MEDIQ-GOV-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GOV-002/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-002` | `CAPSTONE-P0` | API·Worker·Web npm workspace 구조 정렬 | `PASS` (Ticket 범위) | [Implementation Report](MEDIQ-ENV-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-002/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-003` | `CAPSTONE-P0` | PostgreSQL·Orthanc Compose 기준선 | `PASS` (config 범위) | [Implementation Report](MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-003/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-004` | `CAPSTONE-P0` | PostgreSQL startup·health·network 연결 | `PASS` (DB 환경 범위) | [Implementation Report](MEDIQ-ENV-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-004/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-005` | `CAPSTONE-P0` | Hospital A Test Orthanc runtime·DICOMweb readiness | `PASS` (A runtime/QIDO readiness만) | [Implementation Report](MEDIQ-ENV-005/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-005/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-006` | `CAPSTONE-P0` | Hospital B Test Orthanc runtime·DICOMweb 및 A/B 경계 확인 | `PASS` (B readiness·격리만; payload 전송 아님) | [Implementation Report](MEDIQ-ENV-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-006/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-007` | `CAPSTONE-P0` | Synthetic CT fixture·manifest·Hospital A seed | `PASS` (fixture provisioning만; 제품 A→B 아님) | [Implementation Report](MEDIQ-ENV-007/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-007/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-008` | `CAPSTONE-P0` | App config validation·PostgreSQL bootstrap/runtime/migration role 분리 | `PASS` (local config/role boundary만; 제품 API·schema 권한 아님) | [Implementation Report](MEDIQ-ENV-008/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-008/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-009` | `CAPSTONE-P0` | API·PostgreSQL·Test Orthanc A/B operational health checks | `PASS` (ENV-009 operational readiness only; product API/flow excluded) | [Implementation Report](MEDIQ-ENV-009/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-009/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-010` | `CAPSTONE-P0` | Reproducible P0 environment smoke test | `PASS` (environment/fixture placement only; no product transfer) | [Implementation Report](MEDIQ-ENV-010/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-010/TEST-EVIDENCE.md) |
| `MEDIQ-DB-001` | `CAPSTONE-P0` | Drizzle-generated SQL migration framework and isolated least-privilege runner | `PASS` (migration framework only; zero product tables) | [Implementation Report](MEDIQ-DB-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-001/TEST-EVIDENCE.md) |
| `MEDIQ-DB-002` | `CAPSTONE-P0` | Organization/Tenant/Hospital/Endpoint/Actor registry schema | `PASS` (5 tables, synthetic constraints/rollback only; no grants/RLS/API) | [Implementation Report](MEDIQ-DB-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-002/TEST-EVIDENCE.md) |
| `MEDIQ-DB-003` | `CAPSTONE-P0` | PatientReference/PatientMapping persistence schema | `PASS` (schema/constraints and rollback only; mapping authorization deferred) | [Implementation Report](MEDIQ-DB-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-003/TEST-EVIDENCE.md) |
| `MEDIQ-DB-004` | `CAPSTONE-P0` | ExchangeSession persistence schema | `PASS` (12-column current schema including required idempotency key and unique Actor/key constraint, constraints/indexes and synthetic rollback; no business authorization/API claim) | [Implementation Report](MEDIQ-DB-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-004/TEST-EVIDENCE.md) |
| `MEDIQ-DB-005` | `CAPSTONE-P0` | Consent and TransferGrant persistence schema | `PASS` (schema only; synthetic constraints/rollback; no authorization service) | [Implementation Report](MEDIQ-DB-005/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-005/TEST-EVIDENCE.md) |
| `MEDIQ-DB-006` | `CAPSTONE-P0` | ImagingPackage/StudyReference metadata schema | `PASS` (metadata schema, synthetic constraints/rollback; executed ahead of DB-005 for optional package-reference FK dependency) | [Implementation Report](MEDIQ-DB-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-006/TEST-EVIDENCE.md) |
| `MEDIQ-DB-007` | `CAPSTONE-P0` | Integrity/Provenance/Audit evidence persistence schema | `PASS` (schema only; synthetic constraints/rollback; no writer or transfer enforcement) | [Implementation Report](MEDIQ-DB-007/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-007/TEST-EVIDENCE.md) |
| `MEDIQ-DB-008` | `CAPSTONE-P0` | P0 full database schema constraint and reset validation | `PASS` (17/44/14/28 catalog, approved registry policy, reset and DB-002~007 regressions; no runtime authorization claim) | [Implementation Report](MEDIQ-DB-008/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-008/TEST-EVIDENCE.md) |
| `MEDIQ-DB-009` | `CAPSTONE-P0` | P0 runtime least privilege and Tenant RLS database boundary | `PARTIAL` (DB/RLS and IAM-002 pool boundary PASS; safe HTTP error handling and business Authorization remain unimplemented) | [Implementation Report](MEDIQ-DB-009/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DB-009/TEST-EVIDENCE.md) |
| `MEDIQ-ORG-001` | `CAPSTONE-P0` | Synthetic Organization and Tenant baseline seed | `PASS` (A/B/C fixtures; repeat/no-op and Organization/Tenant conflict rollback verified; no auth claim) | [Implementation Report](MEDIQ-ORG-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ORG-001/TEST-EVIDENCE.md) |
| `MEDIQ-ORG-002` | `CAPSTONE-P0` | Synthetic Hospital registry baseline seed | `PASS` (A/B/C registry; repeat/no-op, metadata/owner-pair conflict rollback, hospital-only write scope; no auth claim) | [Implementation Report](MEDIQ-ORG-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ORG-002/TEST-EVIDENCE.md) |
| `MEDIQ-ORG-003` | `CAPSTONE-P0` | Role-aligned DICOMweb endpoint registry seed | `PASS` (A QIDO/WADO, B QIDO/STOW; QIDO enabled only; URL allowlist/conflict rollback/no-network verified; no capability or auth claim) | [Implementation Report](MEDIQ-ORG-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ORG-003/TEST-EVIDENCE.md) |
| `MEDIQ-PAT-001` | `CAPSTONE-P0` | Synthetic PatientReference domain and persistence adapter | `PASS` (synthetic-only runtime create/read/conflict/rollback with DB-009 column grants; no API, identity or PatientMapping authorization claim) | [Implementation Report](MEDIQ-PAT-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PAT-001/TEST-EVIDENCE.md) |
| `MEDIQ-PAT-002` | `CAPSTONE-P0` | Synthetic PatientMapping domain/repository plus verified same-Hospital internal reader | `PARTIAL` (DEC-002 exact 8-column read-only runtime/RLS/pool Acceptance PASS; no HTTP route, write workflow, role model or image authorization) | [Implementation Report](MEDIQ-PAT-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PAT-002/TEST-EVIDENCE.md) |
| `MEDIQ-PAT-003` | `CAPSTONE-P0` | Synthetic destination PatientMapping domain validation | `PARTIAL` (Domain Acceptance 18/18 and API regression 323/323 pass; destination retrieval and PACS no-STOW remain untested) | [Implementation Report](MEDIQ-PAT-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PAT-003/TEST-EVIDENCE.md) |
| `MEDIQ-PAT-004` | `CAPSTONE-P0` | PatientMapping persistence-to-domain negative regression | `PASS` (7 mocked adapter/domain Acceptance tests; live DB/RLS, destination authorization and PACS no-STOW remain open) | [Implementation Report](MEDIQ-PAT-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PAT-004/TEST-EVIDENCE.md) |
| `MEDIQ-EXC-001` | `CAPSTONE-P0` | ExchangeSession domain and lifecycle value model | `PASS` (domain factory/reconstitution only; API, persistence and authorization remain pending; transitions tracked separately under EXC-005) | [Implementation Report](MEDIQ-EXC-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-EXC-001/TEST-EVIDENCE.md) |
| `MEDIQ-EXC-002` | `CAPSTONE-P0` | Internal ExchangeSession persistence repository contract | `PARTIAL` (repository and scratch PostgreSQL/RLS Acceptance PASS; EXC-003 later adds its separately approved runtime access; EXC-002 itself makes no business authorization or product API claim) | [Implementation Report](MEDIQ-EXC-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-EXC-002/TEST-EVIDENCE.md) |
| `MEDIQ-EXC-003` | `CAPSTONE-P0` | Destination-Hospital `USER`-bound idempotent ExchangeSession creation API | `PARTIAL` (19-file/345-test API suite, exact 100-row grants, live synthetic PostgreSQL/RLS/Audit rollback and DB-002~007 regression PASS; live OIDC→HTTP→DB and true concurrent-key requests not tested) | [Implementation Report](MEDIQ-EXC-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-EXC-003/TEST-EVIDENCE.md) |
| `MEDIQ-EXC-005` | `CAPSTONE-P0` | ExchangeSession domain state transition rules | `PARTIAL` (domain state-transition Acceptance PASS; runtime expiry, persistence, API/AuthZ remain gated) | [Implementation Report](MEDIQ-EXC-005/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-EXC-005/TEST-EVIDENCE.md) |
| `MEDIQ-IAM-001` | `CAPSTONE-P0` | OIDC/JWT bearer authentication middleware | `PASS` (AUTH-001~007 middleware/config acceptance; no live issuer, login provider, Actor/Tenant, Authorization, rate limiter or product API claim) | [Implementation Report](MEDIQ-IAM-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-IAM-001/TEST-EVIDENCE.md) |
| `MEDIQ-IAM-002` | `CAPSTONE-P0` | Verified Actor/Tenant/Hospital context and transaction-local RLS wrapper | `PASS` (context/transaction acceptance and runtime DB privilege/RLS pool tests pass; no business route/AuthZ claim) | [Implementation Report](MEDIQ-IAM-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-IAM-002/TEST-EVIDENCE.md) |
| `MEDIQ-AUT-001` | `CAPSTONE-P0` | Authorization Context value object and shape validation | `PASS` (complete immutable context and malformed-input tests; no policy decision, route, DB grant or access claim) | [Implementation Report](MEDIQ-AUT-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUT-001/TEST-EVIDENCE.md) |
| `MEDIQ-AUT-002` | `CAPSTONE-P0` | Default-deny Authorization evaluator contract | `PASS` (exact ALLOW only; missing/invalid context, policy, unsupported output and exceptions deny; no real policy or route) | [Implementation Report](MEDIQ-AUT-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUT-002/TEST-EVIDENCE.md) |
| `MEDIQ-AUT-003` | `CAPSTONE-P0` | Object-level Authorization policy over server-resolved evidence | `PASS` (86 pure-policy cases; same-client scope required; no PostgreSQL reader, runtime grants, module/route, or product access; HTTP BOLA pending) | [Implementation Report](MEDIQ-AUT-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUT-003/TEST-EVIDENCE.md) |
| `MEDIQ-AUT-004` | `CAPSTONE-P0` | Authorization-gated application operation boundary | `PARTIAL` (21 focused executor cases and API regression PASS; HTTP fail-closed/BOLA/evidence-reader integration NOT RUN; no route/grants wired) | [Implementation Report](MEDIQ-AUT-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUT-004/TEST-EVIDENCE.md) |
| `MEDIQ-AUT-005` | `CAPSTONE-P0` | Trusted PostgreSQL authorization evidence reader | `PASS` (internal Study reader, exact 41-column SELECT grants and synthetic live runtime Acceptance; no HTTP route, no PatientMapping path through AUT-005, or PACS side effect; PAT-002 access is separately scoped) | [Implementation Report](MEDIQ-AUT-005/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUT-005/TEST-EVIDENCE.md) |
| `MEDIQ-CON-001` | `CAPSTONE-P0` | Immutable synthetic P0 ConsentArtifact domain | `PASS` (36 domain cases; no legal consent, transition, API, persistence, authorization, Grant, Audit, or runtime access claim) | [Implementation Report](MEDIQ-CON-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-001/TEST-EVIDENCE.md) |
| `MEDIQ-CON-002` | `CAPSTONE-P0` | Synthetic Consent persistence and atomic version allocation | `PASS` (scoped internal PENDING persistence/versioning, PostgreSQL/RLS/concurrency/rollback; scratch-only privileges restored 120→100; no API/permanent grants/legal-consent claim) | [Implementation Report](MEDIQ-CON-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-002/TEST-EVIDENCE.md) |
| `MEDIQ-CON-003` | `CAPSTONE-P0` | Destination-Hospital Consent request API with atomic Session/Audit workflow | `PASS` (scoped API/DB Acceptance; no legal-consent, Authorization, Grant, image or overall P0 completion claim) | [Implementation Report](MEDIQ-CON-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-003/TEST-EVIDENCE.md) |
| `MEDIQ-CON-004` | `CAPSTONE-P0` | Synthetic patient claim-bound Consent approval API | `PASS` (scoped synthetic technical transition; 10 Acceptance cases, signed OIDC/JWKS HTTP→PostgreSQL/RLS, concurrency/rollback, exact 125 grants; no legal-consent/AuthZ/Grant/image/PACS/full-P0 claim) | [Implementation Report](MEDIQ-CON-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-004/TEST-EVIDENCE.md) |
| `MEDIQ-CON-005` | `CAPSTONE-P0` | Synthetic patient claim-bound Consent withdrawal API | `PASS` (13 Acceptance cases, signed OIDC/JWKS HTTP→PostgreSQL/RLS, expiry-independent withdrawal, replay/concurrency/rollback, exact 126 grants; no legal withdrawal, Grant concurrency, remote recall or full-P0 claim) | [Implementation Report](MEDIQ-CON-005/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-005/TEST-EVIDENCE.md) |
| `MEDIQ-CON-006` | `CAPSTONE-P0` | P0 Consent allowed-action policy enforcement | `PASS` (5 Acceptance cases; P1 `MOBILE_EXPORT` and invalid/expanded scope evidence deny; API 20 files/373 tests; pure policy only, no Grant/API/PACS integration claim) | [Implementation Report](MEDIQ-CON-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-006/TEST-EVIDENCE.md) |
| `MEDIQ-CON-007` | `CAPSTONE-P0` | Consent Audit event context and minimization Acceptance | `PASS` (5 scoped cases; exact request/approval/withdrawal Audit context/correlation/timestamps, replay/rollback and metadata-only schema; API 20 files/373 tests plus DB-008 full gate; global Audit remains open) | [Implementation Report](MEDIQ-CON-007/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-007/TEST-EVIDENCE.md) |
| `MEDIQ-CON-008` | `CAPSTONE-P0` | Missing/withdrawn Consent operation denial Acceptance | `PASS` (6 DB-backed internal operation cases: missing Consent and withdrawn Consent with still-active Grant denied before callback for VIEW/DOWNLOAD/PACS_IMPORT; DB-008 reset/reapply and DB-002~007; no Grant issuance, HTTP or PACS claim) | [Implementation Report](MEDIQ-CON-008/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-CON-008/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-001` | `CAPSTONE-P0` | Immutable P0 TransferGrant domain metadata | `PASS` (10 scoped Acceptance groups; focused 19 tests; P0-only scope set, persistence-shaped refs/statuses, time/revoke invariants and metadata-only snapshot; no Authorization, persistence, API or access claim) | [Implementation Report](MEDIQ-GRT-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-001/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-002` | `CAPSTONE-P0` | TransferGrant internal persistence and reconstitution | `PASS` (8 Acceptance cases; API 22 files/399 tests and typecheck; DB-008 clean/reset each real PostgreSQL/RLS 7/7 with scratch-only privileges restored 142→126; no permanent Grant privilege, API route or Authorization claim) | [Implementation Report](MEDIQ-GRT-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-002/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-003` | `CAPSTONE-P0` | Consent-bound idempotent Grant issue API | `PASS` (26 API/DB Acceptance cases; API 23 files/442 tests and typecheck; DB-008 clean/reset each signed-OIDC PostgreSQL/RLS 8/8; exact persistent privilege inventory 144; DB-002~007 regression and cleanup PASS; Viewer/Download/PACS operation Authorization remains open) | [Implementation Report](MEDIQ-GRT-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-003/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-004` | `CAPSTONE-P0` | Recipient-bound Grant revocation API | `PASS` (16 API/DB Acceptance cases; API 24 files/453 tests, typecheck/migration check; DB-008 clean/reset each signed-OIDC PostgreSQL/RLS GRT-004, exact 146 privileges, DB-002~007 regressions and scratch cleanup; no remote recall or operation-time image Authorization claim) | [Implementation Report](MEDIQ-GRT-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-004/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-005` | `CAPSTONE-P0` | P0 TransferGrant Scope Enforcement | `PASS` (8 dedicated cases reuse existing pure Authorization policy; focused 1 file/96 tests, typecheck and API regression 24 files/461 tests; no route, DB privilege, image or PACS side-effect claim) | [Implementation Report](MEDIQ-GRT-005/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-005/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-006` | `CAPSTONE-P0` | TransferGrant API payload allowlist | `PASS` (4 domain/controller serialization Acceptance cases; focused test and API regression 25 files/465 tests, build/typecheck; no HTTP integration or DICOM/key handling claim) | [Implementation Report](MEDIQ-GRT-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-006/TEST-EVIDENCE.md) |
| `MEDIQ-GRT-007` | `CAPSTONE-P0` | Strict TransferGrant expiry validation | `PASS` (8 temporal Acceptance cases; focused policy/service 2 files/145 tests, API build/typecheck and regression 25 files/473 tests; no protected-operation/cache/in-flight/PACS enforcement claim) | [Implementation Report](MEDIQ-GRT-007/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GRT-007/TEST-EVIDENCE.md) |
| `MEDIQ-DCM-001` | `CAPSTONE-P0` | Typed internal DICOM Gateway Port | `PASS` (typed QIDO/metadata/single-instance and frame stream/STOW/destination-verification/capability contract; compile-only conformance and API build/typecheck; no network, adapter, Authorization or interoperability claim) | [Implementation Report](MEDIQ-DCM-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DCM-001/TEST-EVIDENCE.md) |
| `MEDIQ-DCM-002` | `CAPSTONE-P0` | Synthetic Orthanc DICOMweb adapter and streaming spike | `PARTIAL` — 14 focused unit tests and 5 read-only Orthanc integrations PASS; live STOW, TLS, product Authorization/Preflight, integrity/provenance/audit and A→B E2E remain NOT RUN | [Implementation Report](MEDIQ-DCM-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DCM-002/TEST-EVIDENCE.md) |
| `MEDIQ-TLS-001` | `CAPSTONE-P0` | Local Test Orthanc HTTPS and certificate validation | `PASS` scoped — all 8 local TLS/DICOM Acceptance cases; API 29 files/526 tests, AppConfig 11/11, HTTPS DICOM/TLS 7/7, Orthanc A/B and environment health PASS; Client ingress, production PKI/mTLS, PACS/STOW remain open | [Implementation Report](MEDIQ-TLS-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-TLS-001/TEST-EVIDENCE.md) |
| `MEDIQ-PACS-004` | `CAPSTONE-P0` | Internal Destination PatientMapping eligibility gate (no STOW) | `PARTIAL` — internal exact-Authorization/same-transaction mapping gate; focused 16/16, API regression 27 files/503 tests and isolated API startup/health smoke PASS; live DB/RLS, product import endpoint, AT-SEC-012/Orthanc no-STOW and full Preflight remain NOT RUN | [Implementation Report](MEDIQ-PACS-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PACS-004/TEST-EVIDENCE.md) |
| `MEDIQ-PACS-006` | `CAPSTONE-P0` | Exact destination Series and Instance verification primitive | `PARTIAL` — internal read-only verifier 31/31, API 35 files/652 tests, typecheck/Port contract and HTTPS Orthanc 7/7 PASS; post-STOW product `AT-FUNC-013`, completion enforcement, full Preflight/coordinator, STOW and A→B E2E remain NOT RUN | [Implementation Report](MEDIQ-PACS-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PACS-006/TEST-EVIDENCE.md) |
| `MEDIQ-PACS-007` | `CAPSTONE-P0` | Durable PACS transfer operation state and idempotency | `PASS` — scoped internal lifecycle/idempotency; PostgreSQL/RLS/exact grants, CAS, atomic Audit and RESULT_UNKNOWN no-retry; DB-008 clean/reset/reapply + DB-002~007 regressions; no route/DICOM/STOW/reconciliation claim | [Implementation Report](MEDIQ-PACS-007/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PACS-007/TEST-EVIDENCE.md) |
| `MEDIQ-PACS-001` | `CAPSTONE-P0` | PACS Import coordinator prerequisites — identity and operation-time authorization-fence sub-gates | `PARTIAL` — identity + shared Session-fence gates PASS; API 29 files/529 tests, type/Compose checks and real scratch PostgreSQL revoke/withdrawal/concurrency/no-operation-row Acceptance PASS. DB-008 full clean/reset/reapply, local migration smoke, DB-002~007 regressions and cleanup now PASS after restoring the exact historical `0018` migration bytes. Full coordinator, product no-STOW/B-unchanged and STOW remain NOT RUN | [Implementation Report](MEDIQ-PACS-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PACS-001/TEST-EVIDENCE.md) |
| `MEDIQ-INT-001` | `CAPSTONE-P0` | Bounded source manifest, operation-bound pending evidence, and authorized synthetic source-capture sub-gates | `PARTIAL` — API build/regression 35 files/642 tests; permanent 236-column privileges and DB-008/RLS regressions PASS. CAP-001~014 pass only their recorded synthetic scopes. CAP-005/007/008 passed 3×31/31; CAP-009/010/011 passed 3×32/32; CAP-012 passed 3×35/35 with runtime-role INSERT faults and independent Audit/evidence observation. CAP-011 verifies the fixed Audit catalog/raw metadata minimization. CAP-012 proves no-WADO start failure and atomic final evidence/Audit rollback with fixed error and unchanged `CREATED` state. B EMPTY, zero STOW/destination calls, cleanup and existing-stack preservation passed. Underlying DB/host/storage latency and production SLO remain unproven; no 2 GiB performance claim. Global Audit completeness, destination comparison/verification, product route, STOW and A→B E2E remain open | [Implementation Report](MEDIQ-INT-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-INT-001/TEST-EVIDENCE.md) |
| `MEDIQ-PROV-001` | `CAPSTONE-P0` | Operation-bound pending Provenance persistence | `PASS (scoped)` — all ten scoped Acceptance cases; API 32 files/565 tests; exact 13-column SELECT/INSERT and 209 total runtime column grants; DB-008 clean/reset/reapply, migration smoke and DB-002~007 regressions PASS; no coordinator/Integrity result/STOW | [Implementation Report](MEDIQ-PROV-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-PROV-001/TEST-EVIDENCE.md) |
| `MEDIQ-AUD-001` | `CAPSTONE-P0` | Metadata-only common Audit event writer | `PASS (scoped)` — 9 writer Acceptance cases; API 31 files/556 tests; DB-008 scratch RLS/exact-grant/atomicity and DB-002~007 regressions PASS; global Audit completeness remains open | [Implementation Report](MEDIQ-AUD-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUD-001/TEST-EVIDENCE.md) |
| `MEDIQ-AUD-002` | `CAPSTONE-P0` | Verified-Tenant Grant denial Audit event pair | `PASS (scoped)` — 8 Acceptance cases; API 31 files/560 tests, typecheck and DB-008 full RLS/atomicity/reset/reapply/DB-002~007 regression PASS; global Audit remains open | [Implementation Report](MEDIQ-AUD-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AUD-002/TEST-EVIDENCE.md) |
| `MEDIQ-GOV-001` | `CAPSTONE-P0` | 구현·실행·문서화 단일 작업 Gate | `TESTED` | [Implementation Report](MEDIQ-GOV-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GOV-001/TEST-EVIDENCE.md) |
| `MEDIQ-DOC-001` | `CAPSTONE-P1` | 합성 건강정보 연계 Preview 문서 기준선 | `TESTED` | [Implementation Report](MEDIQ-DOC-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DOC-001/TEST-EVIDENCE.md) |
| `MEDIQ-DOC-002` | `CAPSTONE-P1` | 환자 경험 기능 1–9 문서 기준선 | `TESTED` | [Implementation Report](MEDIQ-DOC-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DOC-002/TEST-EVIDENCE.md) |
| `MEDIQ-UI-001` | `CAPSTONE-P1` | 환자 경험 기능 1–9 인터랙티브 HTML 목업 | `PARTIAL` | [Implementation Report](MEDIQ-UI-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-UI-001/TEST-EVIDENCE.md) |
| `MEDIQ-HHP-006` | `CAPSTONE-P1` | 건강검진·혈액·항체검사 합성 Preview | `PARTIAL` | [Implementation Report](MEDIQ-HHP-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-HHP-006/TEST-EVIDENCE.md) |
| `MEDIQ-AIQ-001` | `CAPSTONE-P1` | 환자 편의 확장과 합성 AI 질문자료 | `PARTIAL` | [Implementation Report](MEDIQ-AIQ-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AIQ-001/TEST-EVIDENCE.md) |
| `MEDIQ-RAG-001` | `CAPSTONE-P1` | 합성 환자 설명·질문 준비 RAG 문서 기준선 | `TESTED` | [Implementation Report](MEDIQ-RAG-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-RAG-001/TEST-EVIDENCE.md) |
