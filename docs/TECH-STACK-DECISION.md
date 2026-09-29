# MediQ Technology Stack Decision

**Project:** MediQ  
**Product:** Patient-Controlled Medical Imaging Mobility SaaS  
**Document Type:** Technology Stack Decision / Architecture Decision Record  
**Version:** v1.2 Synthetic Patient Explanation RAG Boundary  
**Decision Date:** 2026-09-20  
**Primary Scope:** CAPSTONE-P0  
**Decision Status:** ACCEPTED FOR P0 SCAFFOLDING  
**Implementation Status:** npm workspace + Postgres/Orthanc Compose configuration IMPLEMENTED / CONFIG-TESTED; application code and container runtime NOT IMPLEMENTED / NOT TESTED

---

# 1. Executive Summary

MediQ P0는 다음 기술 스택으로 구현하는 것을 승인한다.

```text
Runtime             Node.js 24 LTS
Language            TypeScript 6.x
Package/Workspace   npm 11 Workspaces

Backend             NestJS 12 + Fastify 5
Architecture        Modular Monolith + same-codebase Transfer Worker
API Contract        Existing OpenAPI 3.1 as normative source

Web Portal          React 19.3 + Vite 8 SPA
Viewer              OHIF Viewer 3.11
Viewer Data Source  MediQ Viewer Gateway only

Database            PostgreSQL 18
ORM/Query            Drizzle ORM 0.45 stable line
Migration           Drizzle Kit generated SQL + mandatory SQL review

Test PACS           Orthanc 1.13 + DICOMweb plugin
DICOM Metadata      dcmjs
DICOMweb             Adapter over standards-based HTTP; dicomweb-client where validated
Large Payload       Node Web Streams / native fetch-undici pipeline

JWT Verification    jose 6
Authentication      OIDC/OAuth 2.0 Authorization Code + PKCE
Authorization       MediQ domain policy evaluator + Nest Guards

Unit/API            Vitest 5 + Fastify inject
Browser E2E         Playwright 1.63
Integration/E2E     Docker Compose + real PostgreSQL + Orthanc A/B
```

기술을 설치했다는 사실은 구현 또는 검증을 의미하지 않는다. 본 문서는 구현 방향을 고정하지만 모든 현재 상태는 `DOCUMENTED`다.

Azure는 현재 기본 P0 Deployment가 아니다. 동일 컨테이너를 Azure Container Apps, 동일 SPA를 Azure Static Web Apps, 동일 PostgreSQL schema를 Azure Database for PostgreSQL에 배포할 수 있도록 호환성을 유지한다.

---

# 2. Project Context

MediQ의 P0 성공조건은 다음 흐름이다.

```text
Hospital A Test Orthanc
  → QIDO-RS / WADO-RS
  → MediQ Patient Mapping / Consent / Authorization / Scoped Grant
  → VIEW / DOWNLOAD / PACS_IMPORT
  → STOW-RS Hospital B Test Orthanc
  → Destination Verification / Integrity / Provenance / Audit
```

MediQ Cloud는 Permanent PACS나 장기 영상 Archive가 아니며 Browser/Mobile Client는 Hospital PACS를 직접 호출하지 않는다. 기술 스택은 이 보안 경계를 우회할 수 없다.

P1 Mobile Secure Vault는 본 P0 스택을 차단하지 않는다. Android Native 기술 선정은 별도 Mobile Architecture Decision으로 유지한다.

---

# 3. Architecture Constraints

## 3.1 필수 제약

- Synthetic/Test/De-identified DICOM만 사용한다.
- Docker Compose에서 Hospital A/B Orthanc와 PostgreSQL을 재현할 수 있어야 한다.
- Backend는 Full Microservices가 아니라 Modular Monolith다.
- Control Plane과 Imaging Plane을 코드 모듈로 분리한다.
- Consent, Authorization 및 Transfer Grant는 별도 검증한다.
- 모든 보호된 영상 Action은 Backend Authorization Gateway를 통과한다.
- Viewer URL, DICOM UID 또는 Viewer Session ID는 단독 접근권한이 아니다.
- WADO-RS Payload를 기본적으로 전체 메모리에 적재하지 않는다.
- P0 API 업무행위와 canonical scope는 기존 `OPENAPI.yaml`을 따른다.
- 실제 환자정보, 운영 PACS Credential 및 장기 Secret을 저장소에 넣지 않는다.

## 3.2 명시적 비선정

P0에서는 다음을 도입하지 않는다.

- Full Microservices
- Kubernetes
- Kafka 또는 별도 Event Bus
- Redis/BullMQ 전용 Queue
- GraphQL
- Server-side Rendering이 필요한 Next.js Runtime
- Python DICOM Worker
- DIMSE 기반 C-FIND/C-MOVE/C-STORE 구현
- 자체 DICOM Pixel Decoder 또는 Transcoder
- 자체 암호 알고리즘
- Permanent Cloud Object Archive
- Capstone RAG용 외부 LLM·Embedding API
- 일반 Web Search Connector
- P0 공용 Vector Database

필요성이 테스트 증거로 확인되면 별도 ADR로 재검토한다.

## 3.3 Synthetic RAG 기술 경계

첫 RAG Prototype은 TypeScript Workspace 안의 Local Manifest/Chunk Validator, 결정론적 Retriever와 Mock Generator로 구성한다. Model Runtime, Embedding Library와 Vector Store는 현재 `OPEN DECISION`이다. Local Model Spike가 필요하면 Internet Egress가 차단된 별도 Process/Container를 사용하고 PACS/API Credential을 Mount하지 않으며, Model·License·Telemetry·Update 경로를 ADR로 검토한다.

---

# 4. Current Technology Baseline

2026-09-20 최초 저장소 조사에서는 모두 미구현이었다. 2026-09-28 `MEDIQ-ENV-002` 이후의 현재 상태는 다음과 같다.

| 항목 | 실제 상태 | 분류 |
|---|---|---|
| `package.json` / lockfile | Root + API/Worker/Web npm workspace manifests 및 lockfile; 오프라인 clean install 확인 | WORKSPACE IMPLEMENTED / TESTED; 앱 dependency 없음 |
| Local infra image references | PostgreSQL `18.6-bookworm` and Orthanc Team `26.9.1`, both manifest-digest pinned in `infra/docker-compose.yml` | CONFIG-DEFINED / container startup not tested |
| Node/TypeScript Runtime | Node.js `v24.18.0` 실행 확인; TypeScript 앱/compiler 설정 없음 | TOOL AVAILABLE; APP NOT IMPLEMENTED |
| Backend Framework | 없음 | UNKNOWN |
| Frontend Framework | 없음 | UNKNOWN |
| ORM/Migration | 없음 | UNKNOWN |
| Dockerfile/Compose | 없음 | UNKNOWN |
| DICOM/DICOMweb Adapter | 없음 | UNKNOWN |
| Viewer 구현 | 없음 | UNKNOWN |
| Authentication 구현 | 없음 | UNKNOWN |
| Unit/Integration/E2E Test | 없음 | UNKNOWN |
| API/Worker/Web 디렉터리 | README placeholder만 존재 | DOCUMENTED |
| Product/Security/OpenAPI baseline | 문서 존재 | DOCUMENTED |

현재 재사용할 구현 코드는 없다. 새 기술 도입은 migration이 아니라 greenfield scaffolding이다. 기존 Highpass 코드는 저장소에 없으며 Normative Source로 취급하지 않는다.

---

# 5. Backend Technology Decision

## 5.1 Decision

```text
Language: TypeScript 6.x
Runtime: Node.js 24 LTS
Framework: NestJS 12
HTTP Adapter: Fastify 5.12.5 이상 패치 버전
Module Format: ESM
Architecture: Modular Monolith
```

Node.js 24는 2026-09-20 기준 LTS이며 NestJS 12 CLI와 Vite/Vitest 요구사항을 만족한다. Node.js 26은 Current 상태이므로 P0 기준으로 사용하지 않는다. TypeScript 7은 새 native compiler 전환에 따른 생태계 호환성 증거가 부족하므로 P0에서는 TypeScript 6.x를 고정한다.

Fastify는 `5.12.5` 이상으로 pin한다. 2026년 공개된 validation/authentication bypass 계열 취약점이 `5.12.2`에서 수정되었으므로 더 낮은 버전을 허용하지 않고 lockfile과 dependency audit를 강제한다.

## 5.2 Runtime Structure

```text
apps/api
  ├── patient-mapping
  ├── exchange
  ├── consent
  ├── authorization
  ├── grants
  ├── viewer
  ├── download
  ├── pacs-transfer
  ├── audit
  └── provenance

apps/worker
  └── same domain/application packages, separate process entrypoint

packages/contracts
packages/domain
packages/testing
```

API와 Worker는 동일 TypeScript workspace와 Domain/Application code를 공유하되 프로세스 entrypoint는 분리할 수 있다. P0 작업 Queue는 PostgreSQL의 명시적 상태 전이와 row locking을 이용한다. Redis/BullMQ는 P0 필수 기술로 추가하지 않는다.

## 5.3 Streaming Decision

- QIDO-RS metadata는 제한된 JSON으로 처리한다.
- WADO-RS/STOW-RS DICOM object는 Node Web Streams와 backpressure를 사용한다.
- abort signal, connect/read/overall timeout 및 payload size limit를 설정한다.
- integrity hash는 stream을 통과하면서 계산한다.
- retry는 idempotency와 destination verification 이후에만 수행한다.
- Browser에 upstream PACS credential이나 endpoint를 전달하지 않는다.
- 전체 Study buffering은 테스트로 정당화되지 않는 한 금지한다.

## 5.4 Comparison

| 후보 | 호환성 20 | 보안 20 | 기능/표준 15 | Azure 15 | 난이도 10 | 테스트 10 | 비용 5 | 확장 5 | 합계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NestJS 12 + Fastify 5 | 12 | 19 | 13 | 15 | 8 | 9 | 5 | 5 | **86** |
| Fastify 직접 구성 | 12 | 17 | 13 | 15 | 9 | 8 | 5 | 5 | 84 |
| FastAPI | 10 | 18 | 15 | 14 | 8 | 9 | 5 | 5 | 84 |
| NestJS + Express | 12 | 17 | 12 | 15 | 8 | 9 | 5 | 4 | 82 |

현재 코드가 없으므로 기존 코드 호환성 점수는 후보 모두 제한적으로만 부여했다. NestJS를 선택한 이유는 복잡한 보안·도메인 모듈 경계를 Guard, Interceptor, DI와 테스트 가능한 provider로 명확히 분리할 수 있기 때문이다. Fastify 직접 구성은 더 작지만 정책 적용 누락 가능성이 상대적으로 높다.

---

# 6. Frontend Technology Decision

## 6.1 Decision

```text
Language: TypeScript 6.x
UI Library: React 19.3
Build Tool: Vite 8
Rendering: CSR SPA
Server-side Rendering: Not selected
```

MediQ Portal은 검색엔진 노출이나 서버 렌더링이 필요한 공개 콘텐츠 서비스가 아니다. 로그인 이후의 동적 Workflow와 Viewer 통합이 중심이므로 CSR SPA가 P0에 가장 단순하다.

브라우저는 Hospital PACS를 직접 호출하지 않고 MediQ API/Viewer Gateway만 호출한다. Service Worker에 DICOM 또는 민감 API 응답을 캐시하지 않으며 Viewer response에는 `private, no-store`를 적용한다.

## 6.2 Comparison

| 후보 | 호환성 20 | 보안 20 | 기능 15 | Azure 15 | 난이도 10 | 테스트 10 | 비용 5 | 확장 5 | 합계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| React 19.3 + Vite 8 SPA | 14 | 18 | 14 | 15 | 9 | 10 | 5 | 5 | **90** |
| Next.js | 14 | 17 | 15 | 12 | 6 | 8 | 4 | 5 | 81 |
| React custom build without Vite | 10 | 15 | 11 | 13 | 5 | 7 | 5 | 3 | 69 |

Next.js는 P0에 필요하지 않은 SSR/Server Component 운영경계를 추가하므로 선정하지 않는다. Azure Static Web Apps와 React SPA의 호환성은 유지한다.

---

# 7. ORM & Migration Decision

## 7.1 Decision

```text
Database: PostgreSQL 18, current patched minor
Driver: node-postgres (`pg`)
ORM/Query Builder: Drizzle ORM 0.45 stable line
Migration: Drizzle Kit generated SQL committed to Git
Schema Source: reviewed migration SQL + Drizzle schema
```

2026-09-20 기준 PostgreSQL 18은 Community와 Azure Flexible Server에서 지원된다. Docker와 Azure의 major version을 동일하게 유지한다.

Drizzle `1.0.0-rc`는 pre-release이므로 사용하지 않는다. 안정 버전 `0.45.x`를 exact version과 lockfile로 pin하고 minor upgrade도 migration diff와 통합 테스트를 통과해야 한다.

## 7.2 Rules

- Production-like 환경에서 `drizzle-kit push`를 사용하지 않는다.
- 모든 schema change는 versioned SQL migration으로 남긴다.
- Foreign Key, Unique, Check Constraint와 Index를 DB에 구현한다.
- Tenant Isolation은 application check가 기본이며 RLS는 defense-in-depth 후속 Gate다.
- RLS 도입 시 transaction-scoped tenant context와 connection pool reset을 시험한다.
- Migration은 forward, rollback strategy 및 empty/existing DB test를 가져야 한다.
- Audit/Exchange 상태 전이는 하나의 transaction에서 원자적으로 처리한다.

## 7.3 Comparison

| 후보 | 호환성 20 | 보안 20 | 기능 15 | Azure 15 | 난이도 10 | 테스트 10 | 비용 5 | 확장 5 | 합계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Drizzle ORM + reviewed SQL | 12 | 19 | 14 | 15 | 8 | 9 | 5 | 5 | **87** |
| Prisma | 12 | 16 | 13 | 15 | 9 | 9 | 5 | 5 | 84 |
| Knex | 12 | 17 | 13 | 15 | 7 | 8 | 5 | 4 | 81 |
| TypeORM | 12 | 14 | 12 | 15 | 7 | 7 | 5 | 4 | 76 |
| SQLAlchemy + Alembic | 8 | 18 | 15 | 14 | 6 | 9 | 5 | 5 | 80 |

Drizzle는 PostgreSQL SQL, transaction, raw SQL 및 RLS 정책을 비교적 직접적으로 표현할 수 있다는 점을 높게 평가했다. Python 전용 SQLAlchemy/Alembic은 우수하지만 P0 단일언어 원칙과 충돌한다.

---

# 8. DICOM / DICOMweb Technology Decision

## 8.1 Role Separation

| 역할 | 선정 기술 | 상태 |
|---|---|---|
| Test DICOM Server/PACS | Orthanc 1.13 + DICOMweb plugin | DOCUMENTED |
| DICOM File/Metadata Parsing | dcmjs stable pinned version | DOCUMENTED |
| QIDO/WADO/STOW Client | MediQ `DicomwebAdapter` + standards HTTP | DOCUMENTED |
| DICOMweb helper | `dicomweb-client` after compatibility test | PROPOSED |
| Large payload transport | Node Web Streams/native fetch-undici | DOCUMENTED |
| Pixel Decode/Render | OHIF/Cornerstone3D | DOCUMENTED |
| Transcoding | Orthanc/GDCM capability only | DOCUMENTED |
| DIMSE Network | 미선정 | DEFERRED |

## 8.2 Decision

P0에서는 TypeScript DICOM Gateway를 사용한다. DICOMweb은 HTTP 표준이므로 QIDO/WADO/STOW orchestration 자체를 위해 Python Worker를 추가하지 않는다.

`dcmjs`는 metadata/UID/Part 10 validation과 테스트 도구로 제한한다. Pixel Data decode나 의료영상 렌더링은 직접 구현하지 않는다. 압축 Transfer Syntax 지원은 Orthanc/GDCM과 Viewer capability를 검증하여 결정한다.

`dicomweb-client`는 QIDO와 metadata operation에 우선 검토하되, WADO/STOW가 전체 payload를 buffering하거나 cancellation/backpressure를 충분히 지원하지 못하면 large-object path에는 사용하지 않는다. 이 판단은 `MEDIQ-DICOM-001`의 streaming spike로 확정한다.

## 8.3 Required Adapter Contract

```text
queryStudies()
retrieveStudyMetadata()
retrieveInstanceStream()
retrieveFrameStream()
storeInstanceStream()
verifyDestinationStudy()
```

Adapter는 다음을 강제한다.

- allowlisted Hospital endpoint
- TLS certificate validation
- server-side credential injection
- timeout/cancellation
- content type and multipart boundary validation
- maximum metadata/body limit
- transfer syntax capture
- integrity hash
- correlation/session context
- payload-free logging

## 8.4 Why Python Is Deferred

`pydicom`, `pynetdicom`, `dicomweb-client` Python 패키지는 각각 File Parsing, DIMSE Network, DICOMweb Client 역할이 다르다. 향후 de-identification, tag mutation, DIMSE 또는 복잡한 transcoding 요구가 생기면 Python Worker를 별도 ADR로 검토한다. 현재는 운영 언어와 배포 단위를 늘릴 만큼의 요구가 없다.

---

# 9. Medical Image Viewer Decision

## 9.1 Decision

```text
Viewer: OHIF Viewer 3.11
Rendering Core: Cornerstone3D through OHIF
Data Source: MediQ Viewer Gateway
Direct PACS Access: Prohibited
Diagnostic Certification Claim: Prohibited
```

OHIF는 DICOMweb Data Source, Study/Series navigation, progressive pixel retrieval, Window/Level, Zoom/Pan, measurement 및 multi-frame 기반을 제공하므로 학생 MVP에서 Viewer를 처음부터 조립하는 것보다 적합하다.

OHIF는 별도 Static Viewer application 또는 repository 내 configured build로 배포한다. 데이터 소스 URL은 Hospital PACS가 아니라 MediQ Viewer Gateway다.

```text
OHIF
  → MediQ bearer authentication
  → short-lived ViewerSession
  → MediQ Viewer Gateway
  → authorized WADO-RS upstream
```

ViewerSession URL이나 StudyInstanceUID만으로 접근을 허용하지 않는다. Viewer는 PACS credential을 알 수 없어야 한다.

## 9.2 Comparison

| 후보 | 호환성 20 | 보안 20 | DICOM 15 | Azure 15 | 난이도 10 | 테스트 10 | 비용 5 | 확장 5 | 합계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| OHIF 3.11 configured app | 14 | 18 | 15 | 15 | 8 | 8 | 5 | 5 | **88** |
| Cornerstone3D custom viewer | 14 | 19 | 15 | 15 | 5 | 7 | 5 | 5 | 85 |
| dcmjs-only custom viewer | 10 | 12 | 8 | 14 | 3 | 5 | 5 | 3 | 60 |

OHIF Gateway integration이 불가능하거나 session header injection이 불안정하다는 증거가 나오면 Cornerstone3D custom viewer로 전환한다. 이는 Viewer Spike의 명시적 fallback이지 동시 구현 대상이 아니다.

---

# 10. Authentication & Authorization Decision

## 10.1 User Authentication

```text
Protocol: OpenID Connect + OAuth 2.0 Authorization Code with PKCE
API Token: JWT Bearer
JWT Verification: jose 6.x
Required validation: signature, alg allowlist, iss, aud, exp, nbf, typ
```

P0 Local Profile은 Synthetic/Test Identity 전용 test issuer/JWKS fixture를 사용한다. Test issuer와 private key는 테스트·로컬 프로파일 밖에서 활성화할 수 없어야 하며 non-test profile에서 설정되면 startup을 실패시킨다.

Azure Deployment Profile이 승인되면 Hospital User는 Microsoft Entra ID와 MSAL을 사용한다. 실제 Patient Identity/CIAM은 `PRODUCTIONIZATION`이며 Hospital Workforce Identity와 분리한다.

## 10.2 Domain Authorization

Nest Guard는 요청 context를 수집하지만 최종 의료영상 허가를 자체 판단하지 않는다. 다음 chain을 application/domain policy evaluator가 하나의 명시적 decision으로 평가한다.

```text
Identity
→ Tenant
→ Exchange Session
→ Patient Mapping
→ Consent
→ Authorization Policy
→ Transfer Grant
→ Resource
→ Action
→ Destination
```

OPA/Casbin 등 외부 Policy Engine은 P0에 도입하지 않는다. 현재 policy는 Domain Model과 DB 상태에 밀접하고 규모가 작으므로 TypeScript domain service가 더 단순하고 테스트 가능하다.

## 10.3 Hospital Authentication

- P0 Test Orthanc credential은 server-side environment/secret로만 사용한다.
- Browser에 PACS endpoint/credential을 노출하지 않는다.
- TLS/mTLS adapter interface와 certificate validation 경계를 둔다.
- 실제 mTLS, Hospital PKI와 VPN/Outbound Connector는 `PRODUCTIONIZATION`이다.

## 10.4 Transfer Credential

현재 `TransferGrant` Domain Entity가 권한의 기준이다. One-Time Transfer Token을 별도 권한원으로 추가하지 않는다. 향후 필요하면 Grant에서 파생된 짧은 1회용 execution credential로만 도입하고 `jti`/nonce, expiry, binding 및 consumed 상태를 검증한다.

---

# 11. Testing Framework Decision

| Test Layer | 선정 기술 | 실제 외부 구성요소 |
|---|---|---|
| Unit/Domain | Vitest 5 | 없음 |
| API/Controller | Vitest + Fastify `inject()` | Nest application |
| DB/Migration | Vitest + PostgreSQL 18 container | PostgreSQL |
| DICOMweb Contract | Vitest HTTP tests | Orthanc A/B |
| Browser E2E | Playwright 1.63 | Web + API + Viewer |
| Security Negative | Vitest/Playwright data-driven suites | PostgreSQL + Orthanc A/B |
| Full Golden Path | Docker Compose orchestration | 전체 P0 stack |
| Container Health | Docker Compose healthcheck | 전체 container |

NestJS 12 ESM workflow의 기본 testing 방향과 맞추기 위해 Jest 대신 Vitest를 선택한다. Playwright는 로그인, Consent, Viewer, Transfer 상태 및 실패 화면을 브라우저에서 검증한다.

Mock PACS만으로 P0를 PASS 처리하지 않는다. Unit Test에서는 adapter를 mock할 수 있지만 Contract/Integration/E2E는 실제 Test Orthanc A/B를 사용한다.

필수 테스트 범위:

```text
QIDO/WADO/STOW success
Invalid DICOM and unsupported transfer syntax
No consent / revoked consent
Wrong tenant / patient / recipient / destination
Wrong scope and expired/revoked grant
ViewerSession replay/UID-only access
Transfer interruption/retry/idempotency
Integrity mismatch
Destination verification failure
Audit and provenance linkage
Temporary object expiry/purge
```

---

# 12. Azure Deployment Compatibility

현재 기본 P0는 Docker Compose다. 기술 선택은 다음 Azure mapping을 허용하지만 Azure 자원을 생성하거나 배포를 승인하지 않는다.

| Local/P0 | Azure candidate | Classification |
|---|---|---|
| React/Vite static files | Azure Static Web Apps | POST-MVP |
| Nest/Fastify container | Azure Container Apps | POST-MVP |
| Worker container | Internal Container Apps | POST-MVP |
| PostgreSQL 18 | Azure Database for PostgreSQL Flexible Server | POST-MVP |
| Local temporary volume | Temporary Blob Storage | POST-MVP |
| `.env` test secret | Key Vault + Managed Identity | POST-MVP |
| Local logs | Azure Monitor/Application Insights | POST-MVP |

Container Apps는 Linux container runtime에 종속되지 않으므로 Node/Nest 선택과 호환된다. PostgreSQL 18은 Azure Flexible Server 지원 버전이다. Azure 전환에서도 OpenAPI, Domain Model 및 canonical scope를 변경하지 않는다.

---

# 13. Security Considerations

## 13.1 Mandatory Controls

- Fastify `trustProxy`는 명시된 trusted ingress에서만 활성화한다.
- Header 기반 인증은 schema validation에만 의존하지 않고 Guard/hook에서 검증한다.
- JWT는 decode 결과가 아니라 signature와 claims가 검증된 결과만 사용한다.
- JWKS URI와 issuer는 configuration allowlist로 고정한다.
- Request/metadata/token/JWKS size limit와 rate limit를 적용한다.
- OpenAPI DTO validation 실패는 Fail Closed한다.
- DB service role은 불필요한 `BYPASSRLS` 권한을 갖지 않는다.
- DICOM response와 Buffer를 application log에 기록하지 않는다.
- Secret과 실제 `.env`를 커밋하지 않는다.
- Dependency lockfile과 container digest를 커밋한다.
- Dependency audit와 container scan에서 Critical/High 정책을 정의한다.

## 13.2 License Boundary

Orthanc는 GPLv3+/일부 plugin은 AGPLv3+ 계열이므로 unmodified standalone service로 실행하고 REST/DICOMweb을 통해 호출한다. Orthanc code나 plugin code를 MediQ 애플리케이션에 복사·링크하지 않는다. 배포물에는 필요한 license와 attribution을 포함한다.

OHIF, dcmjs, dicomweb-client, NestJS, Fastify 및 React 계열의 라이선스는 구현 시 exact version에 대해 SBOM과 함께 다시 검증한다. 기술명만으로 법률 적합성을 확정하지 않는다.

---

# 14. Technology Comparison Matrix

평가 배점은 다음과 같다.

| 기준 | 배점 |
|---|---:|
| 기존 코드/기준선 호환성 | 20 |
| 보안 요구사항 충족 | 20 |
| 의료영상 또는 기능 적합성 | 15 |
| Azure 배포 적합성 | 15 |
| 구현·유지보수 난이도 | 10 |
| 테스트 용이성 | 10 |
| Student MVP 비용 | 5 |
| Production 확장성 | 5 |

현재 실제 코드가 없으므로 호환성 점수는 코드 재사용률이 아니라 문서 기준선, OpenAPI, Modular Monolith 및 단일 팀 운영과의 적합성을 평가한 것이다. 점수는 후보의 절대 품질이 아니라 MediQ P0에 대한 상대적 우선순위다.

---

# 15. Final Technology Stack

| 영역 | 선정 기술 | 현재 적용 상태 | 선정 이유 | 대안 |
|---|---|---|---|---|
| Runtime | Node.js 24 LTS | DOCUMENTED | 지원 중 LTS, Nest/Vite/Vitest 호환 | Node 26은 Current라 보류 |
| Backend 언어 | TypeScript 6.x | DOCUMENTED | Web과 단일언어, 타입 기반 계약 | Python |
| Backend Framework | NestJS 12 | DOCUMENTED | Modular Monolith와 Guard/DI/Test | Fastify direct, FastAPI |
| HTTP Adapter | Fastify 5.12.5+ | DOCUMENTED | streaming/low overhead/schema | Express |
| Web 언어 | TypeScript 6.x | DOCUMENTED | 공유 계약 타입 | JavaScript |
| Web Framework | React 19.3 + Vite 8 | DOCUMENTED | CSR, Viewer 생태계, SWA 적합 | Next.js |
| Package Manager | npm 11 Workspaces | DOCUMENTED | Node 동봉, 추가 도구 최소화 | pnpm |
| Database | PostgreSQL 18 | DOCUMENTED | transaction/constraint/RLS/Azure | 없음 |
| ORM | Drizzle ORM 0.45.x stable | DOCUMENTED | SQL 통제와 타입 안정성 | Prisma, Knex |
| Migration | Drizzle Kit + reviewed SQL | DOCUMENTED | versioned migration과 raw SQL | Prisma Migrate, Alembic |
| PACS | Orthanc 1.13 + DICOMweb | DOCUMENTED | 재현 가능한 QIDO/WADO/STOW | dcm4chee |
| DICOM Processing | dcmjs | DOCUMENTED | TypeScript metadata 처리 | pydicom worker |
| DICOMweb Client | MediQ Adapter + HTTP streams | DOCUMENTED | auth/binding/streaming 통제 | Python dicomweb-client |
| DICOMweb Helper | dicomweb-client | PROPOSED | 표준 요청 boilerplate 절감 | direct HTTP only |
| DICOM Gateway | Nest Imaging module + Worker | DOCUMENTED | authorization 우회 방지 | 독립 Python service |
| Viewer | OHIF 3.11 | DOCUMENTED | 완성형 DICOMweb viewer | Cornerstone3D custom |
| JWT Validation | jose 6.x | DOCUMENTED | JWKS/JWT 표준 검증 | passport-jwt |
| User Authentication | OIDC Code + PKCE | DOCUMENTED | 표준·provider 분리 | custom login 금지 |
| P0 Identity | Synthetic test issuer/JWKS | DOCUMENTED | self-contained test | local Keycloak |
| Azure Identity | Entra ID + MSAL | PROPOSED | Azure profile | 다른 OIDC IdP |
| Authorization | MediQ policy evaluator | DOCUMENTED | Consent/Grant/Tenant domain 반영 | OPA는 후속 |
| Hospital Authentication | Server-side test credential | DOCUMENTED | P0 재현성 | mTLS production |
| Unit Test | Vitest 5 | DOCUMENTED | Nest ESM/Vite 통일 | Jest |
| API Test | Vitest + Fastify inject | DOCUMENTED | 네트워크 없이 HTTP pipeline 검증 | Supertest |
| Integration Test | Vitest + Docker Compose | DOCUMENTED | 실제 PG/Orthanc 검증 | Testcontainers optional |
| Browser E2E | Playwright 1.63 | DOCUMENTED | multi-browser workflow/trace | Cypress |
| Security Test | data-driven Vitest/Playwright | DOCUMENTED | 허용·거부 경로 동일 stack | 별도 도구 후속 |

---

# 16. Architecture Decision Records

## TS-ADR-001 — Node.js/TypeScript 단일 P0 Application Stack

**Decision:** Node.js 24 LTS, TypeScript 6.x 및 npm workspaces를 사용한다.  
**Alternatives:** Python-only, TypeScript+Python dual runtime.  
**Rationale:** 현재 DICOM 업무는 DICOMweb HTTP orchestration과 opaque streaming이 중심이며 별도 Python runtime의 운영비용을 정당화하지 못한다.  
**Security Impact:** LTS patch와 lockfile을 유지하고 EOL runtime을 금지한다.  
**Migration Impact:** Greenfield scaffolding.  
**Risks:** DICOM library 기능 부족.  
**Mitigation:** DICOM spike 실패 시 Python Worker 별도 ADR.  
**Validation:** QIDO/WADO/STOW streaming, cancellation, memory test.  
**Status:** ACCEPTED

## TS-ADR-002 — NestJS + Fastify Modular Monolith

**Decision:** NestJS 12와 Fastify adapter를 사용한다.  
**Alternatives:** Fastify direct, Express, FastAPI.  
**Rationale:** Domain/Security module 경계를 유지하면서 single deployable을 보존한다.  
**Security Impact:** Guard 누락 방지를 위한 global auth guard와 explicit public-route annotation이 필요하다.  
**Risks:** Adapter-specific middleware 차이와 Fastify advisory.  
**Mitigation:** Fastify `>=5.12.5`, integration test, dependency audit.  
**Validation:** OpenAPI contract, security negative tests, stream benchmark.  
**Status:** ACCEPTED

## TS-ADR-003 — React/Vite CSR Portal

**Decision:** React 19.3 + Vite 8 SPA를 사용한다.  
**Alternatives:** Next.js.  
**Rationale:** SSR이 필요하지 않으며 Azure Static Web Apps와 정적 배포가 단순하다.  
**Security Impact:** token storage, no-store, CSP 및 XSS 통제가 필요하다.  
**Validation:** Login, Consent, Viewer, Transfer Playwright E2E.  
**Status:** ACCEPTED

## TS-ADR-004 — PostgreSQL 18 + Drizzle Stable

**Decision:** PostgreSQL 18과 Drizzle 0.45 stable line을 사용한다.  
**Alternatives:** Prisma, TypeORM, SQLAlchemy/Alembic.  
**Rationale:** SQL constraint, transaction, raw SQL 및 향후 RLS 제어가 중요하다.  
**Risks:** Drizzle 0.x upgrade compatibility.  
**Mitigation:** exact pin, reviewed SQL migration, migration test.  
**Validation:** 17-table schema, constraints, transaction, cross-tenant tests.  
**Status:** ACCEPTED

## TS-ADR-005 — Orthanc + TypeScript DICOMweb Adapter

**Decision:** Test PACS는 Orthanc, MediQ Adapter는 TypeScript로 구현한다.  
**Alternatives:** Python Worker, DIMSE.  
**Rationale:** P0 표준은 QIDO/WADO/STOW이며 Orthanc가 decoding/transcoding 경계를 담당할 수 있다.  
**Risks:** multipart streaming과 transfer syntax 상호운용성.  
**Mitigation:** `MEDIQ-DICOM-001` spike와 real Orthanc contract test.  
**Validation:** memory ceiling, cancel/retry, multipart, compressed DICOM.  
**Status:** ACCEPTED WITH VALIDATION GATE

## TS-ADR-006 — OHIF behind MediQ Viewer Gateway

**Decision:** OHIF 3.11을 사용하되 모든 DICOMweb 요청은 MediQ Gateway를 통과한다.  
**Alternatives:** Cornerstone3D custom viewer.  
**Rationale:** 필요한 Viewer 기능을 가장 빠르게 확보한다.  
**Security Impact:** direct PACS URL과 credential 노출을 금지하고 ViewerSession을 재검증한다.  
**Risks:** custom authorization/data source 통합 난이도.  
**Mitigation:** Viewer spike 실패 시 Cornerstone3D fallback.  
**Validation:** no direct PACS request, session revoke/expiry, progressive retrieval.  
**Status:** ACCEPTED WITH VALIDATION GATE

## TS-ADR-007 — Standards-based Authentication, Domain Authorization

**Decision:** OIDC/PKCE와 `jose`로 인증하고 MediQ Domain Service로 인가한다.  
**Alternatives:** custom JWT auth, external policy engine.  
**Rationale:** 인증 Provider와 Consent/Grant/Tenant 업무 인가를 분리한다.  
**Security Impact:** issuer/audience/algorithm/JWKS trust와 fail-closed policy가 필수다.  
**Validation:** malformed/expired/wrong issuer/audience/scope/cross-tenant negative tests.  
**Status:** ACCEPTED

## TS-ADR-008 — Unified TypeScript Test Stack

**Decision:** Vitest, Fastify inject, Playwright 및 Docker Compose를 사용한다.  
**Alternatives:** Jest/Supertest, pytest split stack.  
**Rationale:** Node/Nest ESM stack과 도구 수를 최소화하면서 real dependency test를 유지한다.  
**Validation:** Unit/API/DB/DICOMweb/Security/E2E CI stages.  
**Status:** ACCEPTED

---

# 17. Migration & Implementation Impact

## 17.1 유지할 항목

- 기존 Domain/Security/Data/OpenAPI/Acceptance 문서
- `services/api`, `services/worker`, `web`, `infra`, `tests` 책임 경계
- Docker Compose P0 기준
- canonical scope와 업무행위

## 17.2 추가할 항목

```text
package.json
package-lock.json
tsconfig base/configs
Nest API and Worker applications
React/Vite Web application
OHIF configuration/extension boundary
Drizzle schema and versioned migrations
Orthanc A/B and PostgreSQL Compose
DICOMweb adapter
OIDC/JWT adapter
Vitest and Playwright configuration
CI workflow
SBOM/license inventory
```

## 17.3 교체할 항목

현재 실제 구현이 없으므로 교체할 framework, ORM, migration 또는 test code가 없다.

## 17.4 API/Schema 영향

기술 선정만으로 `OPENAPI.yaml`, Domain Model 또는 17-table baseline을 변경하지 않는다. 구현 중 불일치가 발견되면 code를 조용히 우선하지 않고 해당 기준문서와 Acceptance Test를 함께 개정한다.

---

# 18. MVP vs Production Scope

## MVP 필수

- Node/TypeScript/Nest/Fastify
- React/Vite
- PostgreSQL/Drizzle/Migration
- Orthanc A/B와 DICOMweb adapter
- OHIF Gateway integration
- JWT validation과 MediQ Authorization
- Vitest/Playwright/Docker Compose

## MVP 선택

- `dicomweb-client` helper 채택
- PostgreSQL RLS
- Testcontainers
- OpenTelemetry exporter
- Azure 배포 프로파일

## Production Target

- Entra Workforce Identity와 Patient CIAM 분리
- Hospital outbound Connector/VPN/mTLS/PKI
- Managed Identity/Key Vault
- WAF/APIM/SIEM
- HA/DR/SLA
- WORM 또는 Audit Hash Chain
- 실제 PACS vendor interoperability certification
- Mobile Secure Vault P1 Native stack

---

# 19. Validation Criteria

본 결정은 다음 증거가 있어야 구현 관점에서 `TESTED`로 승격된다.

## Environment Gate

- `docker compose config` PASS
- PostgreSQL 18 health check PASS
- Orthanc A/B DICOMweb health check PASS
- Synthetic fixture seed PASS

## Backend/Data Gate

- Nest/Fastify startup PASS
- OpenAPI contract test PASS
- Migration empty DB/apply/reapply failure behavior PASS
- Tenant constraint와 transaction tests PASS

## DICOM Gate

- QIDO-RS metadata PASS
- WADO-RS instance/frame progressive delivery PASS
- STOW-RS destination import PASS
- memory ceiling, timeout, cancellation, retry evidence
- compressed/unsupported transfer syntax behavior documented

## Viewer Gate

- OHIF가 MediQ Gateway만 호출함을 network evidence로 확인
- PACS endpoint/credential 미노출
- ViewerSession expiry/revoke/replay DENY
- Study/Series/Instance/Frame 표시 PASS

## Security/E2E Gate

- no consent, wrong tenant/scope/destination, invalid mapping DENY
- Hospital A → MediQ → Hospital B Golden Path PASS
- Destination Verification, Integrity, Provenance, Audit PASS
- secret/payload log absence 확인

검증 실패 시 해당 ADR을 `PROPOSED`로 되돌리거나 대안 기술을 별도 ADR로 평가한다.

---

# 20. References

공식 자료 확인 기준일은 2026-09-20이다.

- Node.js release status: <https://nodejs.org/en/about/previous-releases>
- Node.js 24 migration/LTS: <https://nodejs.org/en/blog/migrations/v22-to-v24>
- NestJS migration guide: <https://docs.nestjs.com/migration-guide>
- NestJS Fastify adapter: <https://docs.nestjs.com/techniques/performance>
- Fastify documentation/LTS: <https://fastify.dev/docs/latest/Reference/LTS/>
- Fastify security advisories: <https://github.com/fastify/fastify/security/advisories>
- React versions: <https://react.dev/versions>
- Vite 8: <https://vite.dev/blog/announcing-vite8>
- TypeScript releases: <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html>
- Drizzle migrations: <https://orm.drizzle.team/docs/migrations>
- Drizzle transactions: <https://orm.drizzle.team/docs/transactions>
- Drizzle RLS: <https://orm.drizzle.team/docs/rls>
- PostgreSQL version policy: <https://www.postgresql.org/support/versioning/>
- Azure PostgreSQL supported versions: <https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions>
- Orthanc Docker images: <https://orthanc.uclouvain.be/book/users/docker.html>
- Orthanc DICOMweb plugin: <https://orthanc.uclouvain.be/book/plugins/dicomweb.html>
- Orthanc licensing: <https://orthanc.uclouvain.be/book/faq/licensing.html>
- dcmjs: <https://github.com/dcmjs-org/dcmjs>
- dicomweb-client: <https://github.com/dcmjs-org/dicomweb-client>
- OHIF 3.11: <https://docs.ohif.org/3.11/>
- OHIF DICOMweb data source: <https://docs.ohif.org/3.11/configuration/datasources/dicom-web/>
- Microsoft identity authentication flows: <https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows>
- jose security considerations: <https://github.com/panva/jose/security>
- Vitest: <https://vitest.dev/guide/>
- Playwright: <https://playwright.dev/docs/intro>
- Docker Compose health-dependent startup: <https://docs.docker.com/compose/how-tos/startup-order/>
- Azure Container Apps containers: <https://learn.microsoft.com/en-us/azure/container-apps/containers>
- Azure Static Web Apps: <https://learn.microsoft.com/en-us/azure/static-web-apps/>

버전과 보안 패치 상태는 scaffolding 시 lockfile/container digest를 생성하기 직전에 다시 확인한다.

---

# Final Decision State

```text
TECHNOLOGY DECISION: ACCEPTED FOR P0 SCAFFOLDING
CURRENT IMPLEMENTATION: ENV-002 workspace; ENV-003 Compose config; ENV-004 PostgreSQL runtime only (no product service/schema)
CURRENT TEST EVIDENCE: ENV-002/003/004 scoped; see docs/implementation/README.md
NEXT TICKET: MEDIQ-ENV-005 Hospital A Test Orthanc
AZURE DEPLOYMENT: POST-MVP RECOMMENDATION
MOBILE NATIVE STACK: DEFINED FOR CAPSTONE-P1 BY ADR-0018
MOBILE CAPSULE FORMAT: DEFINED FOR CAPSTONE-P1 BY ADR-0019; CRYPTO/DEVICE VALIDATION PENDING
MOBILE API CONTRACT: DEFINED FOR CAPSTONE-P1 BY ADR-0020; OPENAPI/IAM VALIDATION PENDING
```

---

# P1 Android Technology Architecture Amendment — 2026-09-20

본 Amendment는 P0 기술 스택을 변경하지 않고 `CAPSTONE-P1` Android Mobile Secure Vault의 구현 기준을 추가한다.

| 영역 | P1 Android 결정 | 상태 |
|---|---|---|
| Language/Build | Kotlin + Gradle Kotlin DSL + Version Catalog | ACCEPTED |
| UI/Navigation | Jetpack Compose + Single Activity + Navigation Compose | ACCEPTED |
| State/Async | ViewModel + StateFlow UDF + Coroutines/Flow | ACCEPTED |
| Dependency Injection | Hilt | ACCEPTED |
| Structured Metadata | Room, 최소 Index와 encrypted metadata blob | ACCEPTED WITH SECURITY GATE |
| Settings | DataStore, 비민감 설정 한정 | ACCEPTED WITH SCOPE LIMIT |
| Persistent Work | WorkManager, Android 16 long-running quota 검증 | ACCEPTED WITH VALIDATION GATE |
| Key/Local Auth | Android Keystore + StrongBox/TEE + BiometricPrompt | ACCEPTED WITH PHYSICAL DEVICE GATE |
| Vault Storage | Internal `noBackupFilesDir`, Backup/D2D 제외 | ACCEPTED |
| DICOM Engine/Renderer | Adapter 격리 후 Device·License·Malformed Corpus Spike | OPEN DECISION |

Student MVP는 `:app`, `:core:domain`, `:core:data`, `:core:security`, `:core:dicom`, `:feature:mobile`, `:testing`의 7개 물리 Module로 시작한다. 정확한 Android SDK와 Dependency Version은 구현 Ticket에서 최신 Stable을 확인해 고정한다.

상세 근거와 Security/Test Gate는 `MOBILE-APP-ARCHITECTURE.md` 및 ADR-0018을 따른다.

Capsule Format은 `SECURE-MEDICAL-CAPSULE-FORMAT.md`와 ADR-0019를 따른다. AES-256-GCM Record, Deterministic CBOR Manifest, COSE ES256 Envelope, 1 MiB Chunk, ETag/Range Resume 및 HPKE P-256 Device Wrap Profile은 문서 기준선이며, HPKE의 실제 StrongBox/TEE 지원과 Backend↔Android 상호운용은 Physical Device Gate 통과 전까지 `NOT TESTED`다.

Mobile API는 `MOBILE-API-CONTRACT.md`와 ADR-0020을 따른다. 기존 P0 OpenAPI는 보존하고 후속 Mobile OpenAPI를 분리하며, Authorization Code + PKCE, 등록 후 DPoP, Device/Export/Capsule/Lease/Revocation/Audit 계약은 IAM·SDK·OpenAPI Contract Test 통과 전까지 `DOCUMENTED / PROPOSED`다.

## Synthetic Health Data Preview Stack Boundary — 2026-09-26

Preview 최초 구현은 Android의 별도 `:feature:health-preview`와 Versioned Local Synthetic Fixture를 사용한다. Full FHIR Server, 실제 기관 SDK, 운영 Connector, Credential 또는 신규 Backend API를 기술 스택 전제조건으로 추가하지 않는다.

`HealthDataProvider` Port와 `MockHealthDataProvider`를 분리하되 실제 Provider Adapter는 Productionization 승인 전 구현·등록하지 않는다. Fixture Parser는 필요한 최소 구조만 검증하며 공식 FHIR 적합성을 주장하지 않는다.
