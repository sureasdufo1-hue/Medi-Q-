# Architecture Decision Log

## ADR-0001 — Synthetic/Test 데이터만 사용

- **상태:** Accepted
- **결정:** Capstone MVP의 모든 fixture·실행 데이터는 Synthetic/Test/De-identified 범위로 제한한다.
- **이유:** 실제 환자정보와 운영 의료기관 경계를 제거하고 재현 가능한 검증 환경을 확보한다.

## ADR-0002 — Orthanc를 Test PACS로 사용

- **상태:** Accepted
- **결정:** Hospital A/B는 Test Orthanc로 시뮬레이션하고 DICOMweb/STOW-RS를 검증한다.
- **이유:** P0 상호운용성 검증을 빠르게 재현할 수 있다.

## ADR-0003 — P0/P1 분리

- **상태:** Accepted
- **결정:** Mobile Secure Vault는 P1로 분리하고 P0 E2E를 차단하지 않는다.
- **이유:** Scope expansion 리스크를 통제한다.

## ADR-0004 — Source PACS와 Cloud Retention 경계

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Hospital PACS를 의료영상 Source of Record로 유지하고 MediQ Cloud에는 Permanent PACS 또는 장기 영상 Archive를 구축하지 않는다. Cloud의 영상 Copy는 승인된 Viewer/Exchange를 위한 TTL 기반 Temporary Processing으로 제한한다.
- **이유:** 병원 데이터 소유권과 보존 책임을 유지하면서 MediQ를 Exchange SaaS로 한정한다.

## ADR-0005 — Cloud Viewer Retrieval 방식

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Hospital User와 Synthetic Patient의 P0 Cloud Viewer는 MediQ Authorization Gateway를 거쳐 Source PACS에서 WADO-RS로 필요한 객체를 온디맨드 조회한다. Browser는 PACS를 직접 호출하지 않는다.
- **이유:** Viewer access control과 Audit을 중앙에서 강제하고 PACS endpoint/credential 노출을 방지한다.

## ADR-0006 — Patient Mobile Viewer 경계

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Mobile Secure Vault와 저장된 영상의 Patient Mobile Viewer는 P1로 유지한다. Mobile Viewer는 device-bound encrypted local copy를 조회하며 P0 Cloud Viewer의 retrieval path와 분리한다.
- **이유:** P0 E2E를 지연시키지 않으면서 환자 통제형 저장·열람 확장을 보존한다.

## ADR-0007 — P1 Mobile 플랫폼과 기기 허용범위

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** P1 Mobile MVP는 Android Native Secure Vault를 우선한다. Android StrongBox는 선호하고 검증된 TEE는 허용하되 Software/Unknown Key Security Level에는 Persistent Vault를 허용하지 않는다. iOS Native Vault는 후속 단계로 두고 적용 가능한 Identity/Test 범위에서는 반응형 Cloud Viewer 경로를 유지한다.
- **이유:** 단일 Native 플랫폼으로 구현·보안시험 범위를 통제하면서도 StrongBox 전용 정책으로 인한 과도한 기기 배제를 피하고, 약한 Software Key로의 하향은 금지하기 위해서다.

## ADR-0008 — Mobile Capsule 암호와 PQC 전환

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Mobile Payload는 AES-256-GCM, Capsule별 DEK 및 Hardware-backed Device Key로 보호하는 Envelope Encryption을 사용한다. Crypto Suite와 복수 Key Wrap Slot을 버전하고 PQC는 DEK Wrap/Key Establishment 계층에서 전환한다. 키 생명주기는 NIST SP 800-57 계열 원칙을 따른다.
- **이유:** 대용량 DICOM 조회 성능을 유지하면서 Payload 전체 재암호화 없이 Key Rotation과 ML-KEM 계열/Hybrid 전환을 가능하게 하기 위해서다.

## ADR-0009 — Offline 및 Background 편의 정책

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Offline Lease 기본값은 마지막 성공한 발급 또는 온라인 정책 검증 후 30일이다. Background 진입 시 화면과 복호화된 Pixel Buffer는 즉시 보호하고, 동일 기기가 계속 잠금 해제된 상태로 60초 이내 복귀하는 경우에만 재인증을 생략할 수 있다.
- **이유:** 진료 현장의 오프라인 사용성과 짧은 앱 전환 편의를 제공하면서 App Switcher와 장시간 무인 접근 위험을 제한하기 위해서다.

## ADR-0010 — Mobile 화면 캡처 보호

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Mobile Viewer의 Screenshot, 화면녹화, 미러링 및 비보안 디스플레이 출력을 플랫폼이 제공하는 범위에서 기본 제한한다. 일반 Screenshot 또는 외부 카메라 촬영의 완전 차단은 보장하지 않는다.
- **이유:** 통제되지 않은 저품질 영상 복제와 개인정보 노출을 줄이되 플랫폼 한계를 보안 보장으로 과장하지 않기 위해서다.

## ADR-0011 — 분실 기기와 Vault 복구

- **상태:** Accepted
- **결정일:** 2026-09-15
- **결정:** Device/Vault Key의 Cloud Escrow나 Cross-device 복구를 제공하지 않는다. 분실 기기를 Revoke하고 새 기기를 검증한 뒤 유효한 Consent, Authorization 및 `study:mobile-export` Grant가 있을 때 Source PACS에서 다시 조회하여 새 Device-bound Capsule을 발급한다.
- **이유:** MediQ Cloud를 영구 영상·복구 키 저장소로 만들지 않으면서 유효한 기존 승인에 대해서는 불필요한 임상 재승인을 반복하지 않기 위해서다.

## ADR-0012 — Azure Deployment Profile 후보

- **상태:** Proposed / Not Approved
- **제안일:** 2026-09-19
- **권고:** Azure 배포는 MediQ 제품 기준을 대체하는 별도 Architecture가 아니라 선택적 Deployment Profile로 취급한다. 기본 분류는 `POST-MVP`이며, 평가상 필수인 경우 `CAPSTONE-MVP-BOUNDARY.md`의 Scope Decision을 먼저 개정한다.
- **제약:** 현재 P0 Docker Compose 기준, Test Orthanc A/B, MediQ canonical scope, Backend Viewer Gateway, Temporary Storage 경계 및 Source PACS 원칙을 유지한다.
- **승인 조건:** Local P0 Golden Path, Security Negative Test, PACS 연결 방향, Identity 경계, 비용·Quota 및 IaC/teardown 계획이 증거로 확인되어야 한다.
- **참조:** `AZURE-DEPLOYMENT-RECOMMENDATIONS.md`

## ADR-0013 — P0 Technology Stack

- **상태:** Accepted for P0 Scaffolding
- **결정일:** 2026-09-20
- **결정:** Node.js 24 LTS, TypeScript 6.x, NestJS 12 + Fastify 5, React 19.3 + Vite 8, PostgreSQL 18 + Drizzle stable, Orthanc/DICOMweb, OHIF 3.11, `jose`, Vitest 및 Playwright를 P0 기술 기준으로 사용한다.
- **경계:** 기술 선택은 구현 또는 테스트 완료를 의미하지 않는다. Azure 배포는 `POST-MVP`, Native Mobile Stack은 `CAPSTONE-P1`이며 별도 결정이 필요하다.
- **검증조건:** 대용량 DICOM streaming과 OHIF Viewer Gateway 연동은 구현 전 Validation Gate를 통과해야 한다.
- **참조:** `TECH-STACK-DECISION.md`

## ADR-0014 — P0 Web UI/UX Baseline

- **상태:** Accepted for P0 UI Implementation
- **결정일:** 2026-09-20
- **결정:** P0 Web은 `HOSPITAL_USER`와 Synthetic `PATIENT`의 Exchange, Consent, scoped Grant, Cloud Viewer, DICOM Download, PACS Import 및 Session Evidence 흐름을 `P0-WEB-UI-UX-SPEC.md`에 따라 구현한다. Frontend의 메뉴·버튼 상태는 서버 Authorization을 대체하지 않으며, Browser는 Hospital PACS를 직접 호출하지 않는다.
- **경계:** Mobile Secure Vault는 P1이며, 세부 Doctor/Technician/Admin RBAC와 시스템 전체 운영 Dashboard는 승인된 Identity/API 변경 전까지 P0 권한으로 간주하지 않는다.
- **구현 전 조건:** Consent 상세 조회, OHIF Viewer Gateway metadata, OIDC claim profile 및 장시간 PACS Import 진행 계약 공백을 명시적으로 결정한다.
- **참조:** `P0-WEB-UI-UX-SPEC.md`

## ADR-0015 — P0 DICOM Interoperability Profile

- **상태:** Accepted with Validation Gates
- **결정일:** 2026-09-20
- **결정:** MediQ P0 DICOM Golden Path는 Classic single-frame CT 또는 MR Image Storage와 Explicit VR Little Endian을 최소 대상으로 하며, 첫 고정 Fixture는 Classic CT를 권고한다. Gateway는 Pixel Data를 직접 decode·encode·transcode하지 않고 bounded streaming으로 전달한다.
- **전송 규칙:** QIDO/WADO GET은 제한적으로 재시도할 수 있으나 STOW-RS는 응답 유실 시 Destination Verification 전에 blind retry하지 않는다. STOW HTTP 성공만으로 Exchange를 완료 처리하지 않는다.
- **지원 주장:** SOP Class × Transfer Syntax × DICOMweb Operation × PACS × Viewer 조합이 실제 Contract/E2E Test를 통과한 경우에만 지원으로 표시한다.
- **검증 조건:** Orthanc/plugin exact version, Multipart, OHIF metadata facade, timeout, size, retry/idempotency, TLS 및 CT/MR fixture 조합을 구현·시험해야 한다.
- **참조:** `DICOM-INTEROPERABILITY-PROFILE.md`

## ADR-0016 — P1 Mobile Secure Vault UI/UX Baseline

- **상태:** Accepted for P1 UI Implementation
- **결정일:** 2026-09-20
- **결정:** P1 Mobile MVP는 `MOBILE-UI-UX-SPEC.md`의 Android-first Device Admission, Device-bound AES-256-GCM Capsule, 최대 30일 Offline Lease, Local DICOM Viewer, Background/Capture 보호 및 분실 기기 재발급 흐름을 따른다.
- **플랫폼 경계:** 검증된 `STRONGBOX` 또는 `TRUSTED_ENVIRONMENT`만 Persistent Vault를 허용하며, 미지원 기기는 권한 재검증을 거쳐 Cloud Viewer를 사용한다. iOS Native Vault는 후속 범위다.
- **전송 경계:** Mobile Capsule 또는 복호화 DICOM을 병원에 직접 업로드하지 않는다. 병원 간 전달은 별도 `study:pacs-transfer` 서버 흐름이며 Mobile Sharing은 별도 승인 전 P2다.
- **구현 전 조건:** Native Stack, Mobile OIDC Profile, Attestation 조합, Capsule Format, Secure Time, Offline Audit 및 Mobile OpenAPI를 별도 승인해야 한다.
- **참조:** `MOBILE-UI-UX-SPEC.md`

## ADR-0017 — P1 Mobile Navigation and Security State Model

- **상태:** Accepted for P1 Mobile Implementation
- **결정일:** 2026-09-20
- **결정:** Mobile Navigation과 Security State를 분리하고 Authentication, Patient Identity, Device Registration, Device Security, Vault, Offline Lease, Consent/Grant, Local Viewer Session 및 Application Lifecycle을 독립 상태 머신으로 관리한다. Local 의료영상 접근은 이 상태들의 Composite Guard가 모두 허용할 때만 가능하다.
- **Domain 경계:** `MobileDevice`, `SecureMedicalCapsule`, `MobileViewerSession`의 승인 상태명을 유지하고, `UNREGISTERED`, `ASSESSING`, `UNLOCKING`, `RENEWING` 등은 Client Workflow/UI 파생 상태로만 사용한다.
- **보안 경계:** Server Authentication과 Offline Local Decryption을 분리하고, Deny/Revocation과 최신 `security_epoch`가 오래된 Allow 응답보다 우선한다. Background에서는 즉시 Privacy Lock과 복호화 Buffer 제거를 수행한다.
- **구현 전 조건:** Native State Technology, Secure Time, Offline Audit, Mobile API Enum, Download Resume 및 Remote Delete 계약을 승인해야 한다.
- **참조:** `MOBILE-NAVIGATION-AND-STATE-MODEL.md`

## ADR-0018 — P1 Android Application Architecture

- **상태:** Accepted with Validation Gates
- **결정일:** 2026-09-20
- **결정:** P1 Android App은 Kotlin, Gradle Kotlin DSL, Jetpack Compose, Single Activity/Navigation Compose, ViewModel/StateFlow UDF, Coroutines, Hilt, Room, DataStore, WorkManager 및 Android Keystore를 기준으로 구현한다. Student MVP는 7개 물리 Module과 Feature 내부 Package 분리를 사용한다.
- **보안 경계:** Backend가 생성한 Device-bound AES-256-GCM Capsule의 Ciphertext만 Android에 다운로드하고 `noBackupFilesDir`에 저장한다. StrongBox를 선호하고 서버 검증된 TEE를 허용하며 Software/Unknown Key는 거부한다.
- **DICOM 경계:** 최초 Mobile Validation Target은 Synthetic Classic single-frame CT + Explicit VR Little Endian이다. DICOM Engine과 Renderer는 Adapter 뒤에 격리하고 Android 호환성, License, Memory, Malformed Corpus 및 Physical Device 시험 후 선정한다.
- **운영 경계:** WorkManager는 Persistent Download/Sync/Cleanup 기준이지만 Android 16 장기작업 Quota와 사용자 시작 대용량 전송 API는 별도 Validation Gate를 통과해야 한다.
- **미결정:** minSdk/targetSdk, DICOM Engine, Renderer Backend, Secure Time 및 Mobile API. Device Wrap Algorithm과 Capsule Chunk Format은 ADR-0019에서 Validation Gate 조건으로 후속 결정했다.
- **참조:** `MOBILE-APP-ARCHITECTURE.md`

## ADR-0019 — P1 Secure Medical Capsule Format

- **상태:** Accepted with Cryptographic and Physical Device Validation Gates
- **결정일:** 2026-09-20
- **결정:** Mobile Capsule v1은 128-byte Fixed Header, RFC 8949 Deterministic CBOR Manifest, 독립 Framed Record, Capsule별 AES-256-GCM DEK, 96-bit `random-prefix || global-sequence` Nonce, 128-bit Tag 및 64-byte 고정 AAD를 사용한다. 기본 DICOM Chunk는 1 MiB다.
- **무결성:** Header, Public Manifest, Recipient Set은 COSE_Sign1 ES256으로 인증하고, 서명된 Record Directory의 SHA-256과 각 Record AES-GCM Tag를 함께 검증한다. P1에는 Merkle Tree를 도입하지 않는다.
- **Device Wrap:** RFC 9180 HPKE Base Mode의 P-256/HKDF-SHA256/AES-256-GCM Profile을 선택하되 StrongBox/TEE Physical Device와 Backend↔Android Interop Test를 통과하기 전 구현 확정으로 간주하지 않는다. 실패 시 RSA-OAEP 또는 Software Key로 조용히 하향하지 않는다.
- **PQC:** ML-KEM/Hybrid는 Versioned Wrap Slot 확장점으로만 예약하고 승인된 표준 Profile과 Device Key Protection 검증 전에는 생성하지 않는다.
- **Resume/Commit:** Strong ETag, `If-Range`, Record 단위 Checkpoint를 사용하며 모든 Signature/Hash/Tag/Device/Lease 검증 후 같은 File System의 Atomic Rename과 DB Transaction으로 `COMMITTED` 처리한다.
- **정책 경계:** Recipient Set은 P1에서 발급 후 Immutable이고 모든 Slot은 동일 Device Binding을 가리킨다. 새 Device는 기존 Capsule에 Slot을 추가하지 않고 Source PACS에서 새 Capsule을 발급한다.
- **미결정:** Capsule API, Signing Key KMS/HSM, Secure Time, Package Test Vector, DICOM Engine Random Access, PQC/Hybrid Profile.
- **참조:** `SECURE-MEDICAL-CAPSULE-FORMAT.md`

## ADR-0020 — P1 Mobile API Contract and Separate OpenAPI

- **상태:** Accepted as Contract Baseline with IAM/OpenAPI Validation Gates
- **결정일:** 2026-09-20
- **결정:** 기존 `OPENAPI.yaml` v1.1.0의 P0 경로는 보존하고, Mobile Device·Export·Capsule·Lease·Revocation·Audit 계약은 후속 `OPENAPI-MOBILE.yaml`로 분리한다. 실제 YAML은 구현 Ticket 전까지 생성하지 않는다.
- **인증:** Native User Authentication은 Authorization Code + PKCE S256을 사용하고, Device 등록 후 민감 API에는 RFC 9449 DPoP Profile을 선택한다. Device Proof Key와 HPKE Wrap Key는 분리하며 DPoP는 IAM/Android SDK Validation Gate를 통과해야 한다.
- **업무 경계:** Mobile Export는 `/exchange-sessions/{sessionId}/actions/mobile-export` Action으로 정의하고 정확한 `study:mobile-export` Grant를 요구한다. 기존 `study:view`·`study:download`·`study:pacs-transfer`로 대체하지 않는다.
- **다운로드:** Capsule Envelope와 encrypted Record exact bytes를 별도 API로 전달하고, 짧은 DPoP-bound Download Session Token, strong ETag, `If-Range`, Record Checkpoint를 사용한다.
- **Lease/Revocation:** Offline Lease는 별도 COSE Signed Evidence이며 Capsule과 분리한다. Server Device Revocation은 Offline Data 삭제 완료를 의미하지 않는다.
- **Reissue:** 새 Device는 기존 DEK/Slot을 이전하지 않고 현재 권한을 재검증하여 Source PACS에서 새 Capsule을 생성한다.
- **미결정:** Patient Mobile Session/Study discovery, IAM DPoP 지원, Attestation TTL/조합, Artifact TTL, Signing KMS, Secure Time, Rate Limit, Deletion polling.
- **참조:** `MOBILE-API-CONTRACT.md`

## ADR-0021 — Hospital Clinical Workflow P1 Extension

- **상태:** Accepted as P1 Design Baseline with API/RBAC Validation Gates
- **결정일:** 2026-09-27
- **결정:** Hospital Portal에 권한 범위 과거 영상 비교, 진료 인계 패킷, 팀 배정·인계, 개인정보 최소 Hospital Inbox와 설명형 Audit·Provenance Timeline을 P1 확장으로 도입한다.
- **권한 경계:** P0 `HOSPITAL_USER`는 상위 Workforce Principal로 유지한다. `CLINICIAN`, `IMAGING_STAFF`, `PACS_OPERATOR`, `AUDITOR`, `HOSPITAL_ADMIN`은 P1 Role/Capability 계약과 거부시험 전 권한이 아니다. Assignment, Notification, Deep Link와 Packet Reference도 권한이 아니다.
- **영상 경계:** 과거 Study는 Study별 `study:view` 재인가가 필요하며 비교 Viewer Session은 허용 Study 집합에 binding한다. Pixel은 Source PACS에서 WADO-RS로 온디맨드 전달하고 장기 Cloud Copy를 만들지 않는다.
- **임상문서 경계:** 영상 Grant는 판독문·의뢰서 권한을 포함하지 않는다. 해당 Payload 연계는 POST-MVP다.
- **화면 경계:** 기존 79개 SaaS Screen ID를 보존하고 5개 `HCW-SCR-*` P1 Extension과 기존 `SAAS-SCR-080` 확장을 사용한다.
- **구현 전 조건:** OpenAPI 업무 행위, Role/Permission, Domain/Data/ERD Migration, Threat/Acceptance와 P0 Regression을 같은 Ticket에서 승인·검증한다.
- **참조:** `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md`
