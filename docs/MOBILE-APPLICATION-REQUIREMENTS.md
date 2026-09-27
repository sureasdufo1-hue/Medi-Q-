# MediQ Mobile Application Requirements Specification

**Project:** MediQ  
**Product:** Patient-Controlled Medical Imaging Mobility SaaS  
**Document ID:** MEDIQ-MOB-REQ-001  
**Document:** `MOBILE-APPLICATION-REQUIREMENTS.md`  
**Version:** 1.6.0  
**Classification:** CAPSTONE-P1  
**Status:** Approved P1 Requirements Baseline — Implementation Not Started  
**Owner:** MediQ Product, Mobile, Architecture & Security  
**Last Updated:** 2026-09-26

---

# 1. Purpose

본 문서는 MediQ 환자 모바일 애플리케이션의 기능, 보안, 데이터, 성능, UX, QR Handoff 및 검증 요구사항을 구현 가능한 수준으로 정의한다.

## 1.1 편의·AI 질문자료 확장

`MOB-PXE-CX-001~009`는 기존 77개 화면 ID를 자동 변경하지 않는 논리 화면 후보다. P1 합성 Prototype은 Timeline·쉬운 모드·질문 준비와 `AI 질문용 자료 만들기`를 제공할 수 있다. AI 질문자료는 On-device Allowlist 처리와 사용자 Preview 후 Local Clipboard 복사만 허용하고 외부 LLM 네트워크 통신을 구현하지 않는다. 실제 Record에서는 Production Gate 전 기능을 비활성화한다.

## 1.2 Synthetic RAG Mobile Boundary

`MOB-RAG-001~006`은 기존 77개 화면 ID에 자동 합산하지 않는 논리 화면이다. Mobile Prototype은 합성 Record, Local Knowledge Pack, 근거·질문·한계 Projection만 허용한다. Background 진입 시 Context를 차폐·제거하며, 외부 Network·실제 건강정보·진단 Intent는 Fail Closed한다.

다음 기존 기준선을 대체하지 않고 세부화한다.

- `REQUIREMENTS.md`의 `REQ-MOB-*` 요구사항
- `SECURITY-REQUIREMENTS.md`의 Mobile Security 요구사항
- `MOBILE-UI-UX-SPEC.md`
- `MOBILE-NAVIGATION-AND-STATE-MODEL.md`
- `MOBILE-APP-ARCHITECTURE.md`
- `SECURE-MEDICAL-CAPSULE-FORMAT.md`
- `MOBILE-API-CONTRACT.md`
- `docs/architecture/qr/` QR Handoff 설계 패키지

충돌 시 프로젝트 최상위 기준선과 P0 보안 불변조건을 우선한다. 이 문서는 설계 기준이며 구현 또는 테스트 완료를 의미하지 않는다.

---

# 2. Product Goal

모바일 애플리케이션의 목표는 환자가 다음 작업을 안전하고 편리하게 수행하도록 하는 것이다.

1. 자신의 의료영상 목록과 상태를 확인한다.
2. 승인된 영상을 Cloud Viewer로 조회한다.
3. 명시적으로 승인된 영상을 암호화된 Mobile Secure Vault에 저장한다.
4. 저장된 영상을 기기 인증 후 로컬에서 빠르게 열람한다.
5. QR Handoff를 통해 인증된 의료기관의 조회 또는 PACS 반입 요청을 확인하고 승인한다.
6. 기기 분실, 권한 철회, 오프라인 만료 및 저장 실패를 안전하게 처리한다.

```text
편의성 우선 UX
+
암호화 저장
+
환자 통제
+
명시적 Consent / Authorization / Grant
+
Fail Closed
```

---

# 3. Scope and Priority

## 3.1 Included — CAPSTONE-P1

- Android Native 애플리케이션
- OIDC 기반 환자 로그인과 PatientReference 결합
- Android 기기 등록 및 보안등급 확인
- 환자 의료영상 목록과 상세 화면
- 승인된 Patient Cloud Viewer 연결
- `study:mobile-export` 기반 Secure Medical Capsule 발급·다운로드
- 앱 전용 Mobile Secure Vault
- 로컬 DICOM Viewer
- 최대 30일 Offline Lease
- Background Privacy, 화면 캡처 제한
- 기기 분실·폐기·교체와 재승인·재다운로드
- QR Handoff 생성·대기·병원 확인·Consent·승인·거절·취소
- 모바일 감사 이벤트와 오류·복구 UX

## 3.2 Prerequisites

다음 P0 Gate가 우선 PASS해야 P1 구현을 완료로 판단할 수 있다.

```text
DICOMweb QIDO/WADO/STOW
Exchange Session
Consent / Authorization / Transfer Grant
Cloud Viewer
PACS Import and Destination Verification
Tenant Isolation
Integrity / Provenance / Audit
P0 E2E
```

## 3.3 Out of Scope

- iOS 동시 구현
- 실제 환자 본인확인과 법률상 동의 완결성 주장
- 실제 운영 PACS 및 실제 환자정보
- Mobile-to-PACS 직접 STOW-RS
- Mobile Capsule의 병원 직접 업로드·재전송
- Gallery, 일반 Download 폴더 또는 공유 Storage 저장
- Cloud Key Escrow와 기기 간 Private Key 이전
- 영구 Cloud PACS 또는 모바일 백업용 장기 Cloud DICOM 보관
- QR에 DICOM, PHI, Access Token, Grant 또는 암호키 포함
- Full PQC 알고리즘 배포
- AI 진단 및 의료적 판독 기능

---

# 4. Actors and Trust Boundary

| Actor/System | Role |
|---|---|
| Patient | 자신의 Study 조회, Mobile Export, Vault 열람, QR 요청 승인 |
| Patient Android App | 환자 UX, Device Proof, 암호화 Capsule 저장과 로컬 표시 |
| Hospital User | QR claim 후 승인된 Viewer/PACS Import 수행 |
| MediQ Backend | 인증·동의·인가·Grant·Capsule·QR·감사 중개 |
| Source Hospital PACS | 의료영상 원본 Source of Record |
| Destination Hospital PACS | 승인된 PACS Import 목적지 |
| Identity Provider | 환자/의료진 인증 Context 제공 |

모바일 앱은 PACS endpoint를 직접 호출하거나 PACS Credential을 수신해서는 안 된다.

---

# 5. Requirement Convention

우선순위는 다음과 같다.

| Priority | Meaning |
|---|---|
| MUST | P1 기능의 보안·정합성·핵심 사용자 흐름에 필수 |
| SHOULD | MVP 품질을 위해 권장되며 미구현 시 위험과 대안을 기록 |
| MAY | 후속 개선 또는 선택 기능 |

모든 요구사항은 `CAPSTONE-P1`로 분류한다. Production 조건은 별도 표시한다.

---

# 6. Platform and Application Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-PLT-001 | MUST | P1 모바일 앱은 Android Native로 구현해야 한다. | Android 빌드·설치·실행 증거 |
| MAPP-PLT-002 | MUST | UI는 Kotlin과 Jetpack Compose 기반 Single Activity 구조를 사용해야 한다. | Architecture/Navigation test |
| MAPP-PLT-003 | MUST | 앱은 `:app`, `:core:domain`, `:core:data`, `:core:security`, `:core:dicom`, `:feature:mobile`, `:testing` 경계를 유지해야 한다. | Dependency rule test |
| MAPP-PLT-004 | MUST | 정확한 min/target SDK와 Dependency 버전은 구현 Ticket에서 지원 중 Stable을 검증해 고정해야 한다. | Version decision evidence |
| MAPP-PLT-005 | MUST | 운영 영상·실제 PHI가 아닌 Synthetic/Test DICOM만 MVP에서 사용해야 한다. | Fixture and log inspection |
| MAPP-PLT-006 | SHOULD | 네트워크 단절·프로세스 종료·저장공간 부족 후에도 안전한 복구 UX를 제공해야 한다. | Recovery tests |

---

# 7. Authentication and Patient Identity Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-AUTH-001 | MUST | 로그인은 System Browser 기반 OIDC Authorization Code Flow와 PKCE `S256`을 사용해야 한다. | Redirect/PKCE negative tests |
| MAPP-AUTH-002 | MUST | Implicit Flow, Resource Owner Password 및 WebView 내 비밀번호 수집을 사용해서는 안 된다. | Static/config inspection |
| MAPP-AUTH-003 | MUST | API는 Token의 서명, 허용 알고리즘, issuer, audience, expiry, `nbf`, token type을 검증해야 한다. | Invalid token matrix |
| MAPP-AUTH-004 | MUST | 앱이 전달한 `patientId`를 신뢰하지 않고 서버 인증 Context에서 PatientReference를 결정해야 한다. | IDOR/BOLA tests |
| MAPP-AUTH-005 | MUST | 등록 후 민감 API는 승인된 DPoP Profile로 사용자 Token과 기기 Proof를 결합해야 한다. | `jti/htu/htm/ath/nonce` tests |
| MAPP-AUTH-006 | MUST | 생체인증은 앱/Vault 해제 수단이며 서버 환자 Identity와 Authorization을 대체해서는 안 된다. | Policy test |
| MAPP-AUTH-007 | MUST | 승인·기기폐기·QR 최종승인 등 민감 작업은 최근의 서버 검증 가능한 재인증 Context를 요구해야 한다. | Stale-auth denial test |
| MAPP-AUTH-008 | MUST | 로그아웃 시 Access Token, 메모리 평문, Viewer Session 및 민감 UI 상태를 제거해야 한다. | Logout cleanup test |

---

# 8. Device Registration and Security Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-DEV-001 | MUST | Device Proof Key와 Capsule Wrap Key를 별도 생성하고 Private Key export를 금지해야 한다. | Key alias/usage inspection |
| MAPP-DEV-002 | MUST | 등록 Challenge는 짧은 수명의 일회용이며 사용자·목적·키에 binding되어야 한다. | Replay/substitution tests |
| MAPP-DEV-003 | MUST | 서버는 Android Key Attestation 또는 승인된 동등 Evidence의 검증 결과와 최소 증적만 저장해야 한다. | Attestation negative tests |
| MAPP-DEV-004 | MUST | 보안등급을 `STRONGBOX`, `TRUSTED_ENVIRONMENT`, `SOFTWARE`, `UNKNOWN`으로 명시해야 한다. | Device matrix test |
| MAPP-DEV-005 | MUST | `SOFTWARE` 또는 `UNKNOWN` 기기는 Persistent Vault와 Mobile Export 대상에서 제외해야 한다. | Admission denial test |
| MAPP-DEV-006 | SHOULD | Secure Vault를 지원하지 못하는 기기에는 승인된 Cloud Viewer 경로를 명확하게 안내해야 한다. | Fallback UI test |
| MAPP-DEV-007 | MUST | 기기 상태는 `PENDING`, `ACTIVE`, `REVOKED`, `LOST`, `RETIRED`로 관리하고 비활성 기기의 신규 민감 작업을 거부해야 한다. | State transition tests |
| MAPP-DEV-008 | MUST | Device Private Key, raw Attestation Chain, 평문 DEK를 장기 저장·로그·백업해서는 안 된다. | Storage/log inspection |

QR Handoff는 Persistent Vault가 아니므로 지원되는 등록 앱 세션과 DPoP를 사용할 수 있으나, QR 최종승인 정책은 Device Trust와 최근 재인증을 별도로 검증해야 한다.

---

# 9. Medical Study Discovery and Cloud Viewer Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-STU-001 | MUST | 환자는 자신에게 binding되고 현재 조회가 허용된 Study만 볼 수 있어야 한다. | Cross-patient/tenant denial |
| MAPP-STU-002 | MUST | 목록에는 정책상 허용된 병원명, 검사일, Modality, 설명 및 상태만 표시해야 한다. | Data minimization inspection |
| MAPP-STU-003 | MUST | DICOM UID나 Study URL을 안다는 사실만으로 목록·상세·영상을 조회할 수 없어야 한다. | Direct-reference denial |
| MAPP-STU-004 | MUST | Cloud Viewer는 Backend Authorization Gateway와 short-lived Viewer Session을 사용해야 한다. | Viewer contract test |
| MAPP-STU-005 | MUST | Cloud Viewer 데이터는 Source PACS WADO-RS를 통해 필요한 Study/Series/Instance/Frame 단위로 점진적으로 전달해야 한다. | Orthanc WADO integration |
| MAPP-STU-006 | MUST | Source PACS 장애 시 영구 Cloud Copy로 우회하지 않고 Fail Closed해야 한다. | Upstream failure test |
| MAPP-STU-007 | MUST | Cloud Viewer 응답과 WebView/HTTP cache에는 `private, no-store` 등 승인된 비보존 정책을 적용해야 한다. | Cache inspection |
| MAPP-STU-008 | SHOULD | 사용자는 Cloud Viewer와 Mobile Vault 로컬 Viewer의 차이를 UI에서 구분할 수 있어야 한다. | UX comprehension test |

---

# 10. Mobile Export Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-EXP-001 | MUST | Mobile Export는 유효한 ExchangeSession, Consent, Authorization 및 `study:mobile-export` Grant를 요구해야 한다. | Missing-evidence denial matrix |
| MAPP-EXP-002 | MUST | `study:view` 또는 `study:download`를 Mobile Export 권한으로 확대 해석해서는 안 된다. | Scope escalation test |
| MAPP-EXP-003 | MUST | Patient, Tenant, Device, Source Hospital, Study와 Grant는 서버 Context에서 binding되어야 한다. | Binding mismatch tests |
| MAPP-EXP-004 | MUST | 모바일 앱은 PACS에서 직접 영상을 다운로드하지 않고 MediQ Backend만 Source PACS WADO-RS를 호출해야 한다. | Network endpoint inspection |
| MAPP-EXP-005 | MUST | Backend는 원본 검증 후 Device-bound Secure Medical Capsule을 생성해야 한다. | Package interoperability test |
| MAPP-EXP-006 | MUST | Download Session은 짧은 수명의 Capsule·Patient·Device·Grant 범위로 제한된 DPoP-bound Token을 사용해야 한다. | Token replay/cross-device tests |
| MAPP-EXP-007 | MUST | Capsule Envelope와 암호화 Record는 exact bytes로 전달하고 중간 JSON 재구성을 금지해야 한다. | Byte-for-byte contract test |
| MAPP-EXP-008 | MUST | HTTP Range, strong ETag 및 `If-Range`로 중단 다운로드를 재개하되 버전 변경 시 기존 부분 데이터를 혼합하지 않아야 한다. | Resume/version conflict tests |
| MAPP-EXP-009 | MUST | 완료 전 데이터는 Staging에 격리하고 전체 검증 후 원자적으로 Vault에 활성화해야 한다. | Kill/storage-full recovery test |
| MAPP-EXP-010 | MUST | 동일 요청 재시도는 Idempotency-Key를 통해 중복 Capsule·Export 작업을 만들지 않아야 한다. | Idempotency test |

---

# 11. Secure Medical Capsule Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-CAP-001 | MUST | 의료영상 Payload는 Capsule별 독립 DEK와 AES-256-GCM Record로 암호화해야 한다. | Known-answer/interoperability tests |
| MAPP-CAP-002 | MUST | GCM Nonce는 Capsule 내에서 절대 재사용되지 않아야 한다. | Duplicate/non-monotonic sequence tests |
| MAPP-CAP-003 | MUST | Manifest, Record 순서·길이·해시·AAD·인증 Tag를 검증해야 한다. | Mutation/truncation/mixing tests |
| MAPP-CAP-004 | MUST | Envelope/Directory는 승인된 COSE 서명 Profile로 검증하고 unknown critical field를 거부해야 한다. | Signature/critical-header tests |
| MAPP-CAP-005 | MUST | DEK는 검증된 대상 Device Wrap Key에만 결합해야 한다. | Wrong-device unwrap denial |
| MAPP-CAP-006 | MUST | Content 암호와 Key Wrap을 분리하고 versioned Crypto Suite/Wrap Slot Registry를 사용해야 한다. | Version compatibility test |
| MAPP-CAP-007 | MUST | 표준화되지 않은 자체 PQC Hybrid Combiner를 구현해서는 안 된다. | Algorithm allowlist test |
| MAPP-CAP-008 | SHOULD | PQC 전환은 Content 재암호화가 아닌 승인된 신규 Wrap Slot/Profile 추가가 가능하도록 설계해야 한다. | Crypto-agility design test |
| MAPP-CAP-009 | MUST | 지원하지 않는 Major version, 알고리즘, Key Protection 수준은 Fail Closed해야 한다. | Downgrade/unknown-suite tests |
| MAPP-CAP-010 | MUST | Capsule은 Source PACS 원본을 대체하지 않으며 Cloud 영구 백업으로 사용해서는 안 된다. | Lifecycle/storage inspection |

---

# 12. Mobile Secure Vault Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-VLT-001 | MUST | Capsule은 앱 전용 `noBackupFilesDir` 또는 승인된 동등 내부 저장소에 저장해야 한다. | Filesystem/backup test |
| MAPP-VLT-002 | MUST | Gallery, MediaStore, 일반 Download, 외부 공유 Storage에 DICOM이나 평문 파생물을 저장해서는 안 된다. | Filesystem scan |
| MAPP-VLT-003 | MUST | Backup과 Device-to-Device restore 대상에서 Vault와 키를 제외해야 한다. | Backup extraction test |
| MAPP-VLT-004 | MUST | Room에는 최소 메타데이터와 상태만 저장하고 DICOM Binary와 평문 DEK를 저장해서는 안 된다. | DB inspection |
| MAPP-VLT-005 | MUST | 부분·손상·미검증 Capsule을 정상 Vault 항목으로 표시해서는 안 된다. | Corruption/recovery test |
| MAPP-VLT-006 | MUST | 저장공간 부족 시 안전하게 중단하고 Staging 정리·재시도 UX를 제공해야 한다. | Low-storage test |
| MAPP-VLT-007 | MUST | Capsule 삭제, Device revoke, Lease 만료와 Local 파일 삭제 상태를 서로 구분해야 한다. | State/UI test |
| MAPP-VLT-008 | MUST | 앱 제거 또는 Device Key 폐기 시 잔존 Ciphertext를 복호화할 수 없어야 한다. | Crypto-shredding test |
| MAPP-VLT-009 | SHOULD | Vault에는 병원·검사일·Modality·용량·Lease 만료·동기화 상태를 안전하게 표시해야 한다. | UI test |
| MAPP-VLT-010 | MUST | 일반 Android 공유 Intent로 Capsule/DICOM을 내보내는 기능을 기본 제공해서는 안 된다. | Intent/exported-component test |

---

# 13. Local DICOM Viewer Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-LVW-001 | MUST | Viewer 열기 전 Device Binding, Capsule 상태, Offline Lease 및 환자 기기 인증을 검증해야 한다. | Guard matrix |
| MAPP-LVW-002 | MUST | 필요한 Instance/Frame만 메모리에서 점진적으로 복호화·파싱·렌더링해야 한다. | Memory/performance test |
| MAPP-LVW-003 | MUST | 전체 Study 평문 파일을 임시 디스크에 생성해서는 안 된다. | Filesystem observation |
| MAPP-LVW-004 | MUST | 화면 종료·Session 종료·Background 이동 시 평문 Pixel Buffer와 민감 메모리를 가능한 즉시 제거해야 한다. | Lifecycle/memory test |
| MAPP-LVW-005 | MUST | 최소 확대·축소, 이동, Window/Level 및 Series/Instance 탐색을 제공해야 한다. | Functional UI tests |
| MAPP-LVW-006 | MUST | 지원하지 않는 Transfer Syntax·손상 DICOM·과도한 크기·악성 Metadata를 안전하게 거부해야 한다. | Malformed corpus test |
| MAPP-LVW-007 | MUST | 앱을 진단용 의료기기로 오해하지 않도록 MVP 비진단용 경계를 명시해야 한다. | UI/legal-copy review |
| MAPP-LVW-008 | SHOULD | 사용자가 첫 영상을 빠르게 볼 수 있도록 초기 프레임 우선 로딩과 후속 프리패치를 지원해야 한다. | First-frame benchmark |

---

# 14. Offline Lease Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-OFF-001 | MUST | Offline Lease는 Capsule과 분리된 서명된 정책 Evidence여야 한다. | Signature/parser test |
| MAPP-OFF-002 | MUST | 오프라인 허용기간은 발급 또는 마지막 성공한 온라인 정책 검증 시점부터 최대 30일이어야 한다. | Boundary/time tests |
| MAPP-OFF-003 | MUST | Lease는 Patient, Device, Capsule, policy/security epoch, 발급·만료시간과 version에 binding되어야 한다. | Binding/rollback tests |
| MAPP-OFF-004 | MUST | Lease 만료, 서명 오류, Rollback 또는 안전한 시간 판단 불가 시 로컬 열람을 거부해야 한다. | Time-tamper tests |
| MAPP-OFF-005 | MUST | 온라인 갱신 시 현재 Consent, Grant, Device 및 Capsule 상태를 재검증해야 한다. | Revocation/renewal tests |
| MAPP-OFF-006 | MUST | 오프라인 기기는 즉시 Revoke를 받을 수 없다는 잔여위험을 UI·감사·정책에 반영해야 한다. | Risk/UX review |

---

# 15. QR Handoff Requirements

QR Handoff는 Mobile Vault 저장 여부와 독립적으로 사용할 수 있어야 한다. QR은 요청 연결 수단이며 의료영상 데이터 경로가 아니다.

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-QR-001 | MUST | 환자는 서버가 확인한 자신 소유의 한 Study와 한 작업을 선택해 QR 요청을 생성할 수 있어야 한다. | Create contract test |
| MAPP-QR-002 | MUST | 초기 Profile은 `VIEW` 또는 `PACS_IMPORT` 중 하나만 허용해야 한다. | Action schema/scope tests |
| MAPP-QR-003 | MUST | QR에는 version과 256비트 불투명 request reference만 포함하고 PHI·DICOM·UID·Token·Grant·Key를 포함해서는 안 된다. | Payload decode/log tests |
| MAPP-QR-004 | MUST | QR 원문은 한 번만 반환하고 서버에는 SHA-256 해시만 저장해야 한다. | DB/API inspection |
| MAPP-QR-005 | MUST | QR 요청 기본 TTL은 제안값 5분으로 하며 실제 판단은 서버 시간을 사용해야 한다. | Expiry boundary test |
| MAPP-QR-006 | MUST | 인증되고 등록된 최초 유효 병원만 요청을 원자적으로 claim할 수 있어야 한다. | Concurrent scanner test |
| MAPP-QR-007 | MUST | 병원·Tenant·의료진 ID는 인증 Context에서 결정하고 Scan Body의 값으로 신뢰해서는 안 된다. | Spoofing test |
| MAPP-QR-008 | MUST | Claim 전 병원 화면에 환자 Identity, Study UID, 영상 또는 Source 정보가 노출되어서는 안 된다. | Preapproval privacy test |
| MAPP-QR-009 | MUST | 환자 승인 화면은 서버가 확인한 요청 병원·의료진·원본 병원·Study·목적·행위·유효시간을 표시해야 한다. | UI binding test |
| MAPP-QR-010 | MUST | QR 스캔만으로 Consent, Authorization, Transfer Grant 또는 영상 접근을 허용해서는 안 된다. | Invariant test |
| MAPP-QR-011 | MUST | QR 승인과 Consent 승인을 분리하고 정확히 일치하는 ACTIVE Consent/version을 검증해야 한다. | Consent mismatch test |
| MAPP-QR-012 | MUST | 환자 최종승인 후에도 현재 Authorization을 재평가하고 승인 Snapshot과 동일한 Grant만 최대 하나 발급해야 한다. | Snapshot/duplicate Grant tests |
| MAPP-QR-013 | MUST | Destination, Study, Action 또는 Consent가 승인 후 변경되면 Fail Closed하고 새 요청을 요구해야 한다. | Substitution tests |
| MAPP-QR-014 | MUST | QR 상태 `GRANT_ISSUED`와 실제 Viewer/PACS 전송 완료 상태를 구분해야 한다. | State/UI test |
| MAPP-QR-015 | MUST | 사용자는 요청을 승인·거절·취소할 수 있고 만료·충돌·Grant 실패를 명확히 확인할 수 있어야 한다. | State transition/UI tests |
| MAPP-QR-016 | MUST | Command API는 Idempotency-Key와 상태 version/ETag를 사용해 중복 승인·Grant 발급을 방지해야 한다. | Retry/concurrency tests |
| MAPP-QR-017 | MUST | QR 촬영·실시간 Relay가 가능함을 전제로 환자가 실제 병원·의료진·목적을 독립적으로 확인하도록 해야 한다. | Relay scenario test |
| MAPP-QR-018 | MUST | QR bitmap, raw reference, 카메라 Frame과 환자정보를 로그·분석 SDK·Crash Report에 기록해서는 안 된다. | Log/privacy test |

---

# 16. Application Lifecycle and Display Protection Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-LIFE-001 | MUST | 앱이 Background/Inactive로 이동하면 민감 화면을 즉시 Privacy Screen으로 대체해야 한다. | Lifecycle UI test |
| MAPP-LIFE-002 | MUST | 최대 60초 유예는 재인증 편의에만 적용하며 민감 화면 노출 유예로 사용해서는 안 된다. | Timing test |
| MAPP-LIFE-003 | MUST | Screenshot, 화면녹화, 최근 앱 미리보기와 비보안 디스플레이 노출을 플랫폼 가능 범위에서 제한해야 한다. | Capture tests |
| MAPP-LIFE-004 | MUST | Capture 제한을 완전한 유출방지로 주장하지 않고 카메라 촬영 등 잔여위험을 유지해야 한다. | Security copy review |
| MAPP-LIFE-005 | MUST | Process kill 후 다운로드 Staging과 상태 DB를 복구·정리하되 미검증 Vault 항목을 만들지 않아야 한다. | Process-death test |
| MAPP-LIFE-006 | MUST | Deep Link/App Link는 allowlist된 MediQ Origin과 명시된 route/version만 수용해야 한다. | Malicious link tests |

---

# 17. Lost Device, Revocation and Recovery Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-REC-001 | MUST | 사용자는 분실 기기를 `LOST` 또는 `REVOKED`로 표시할 수 있어야 한다. | Revocation API/UI test |
| MAPP-REC-002 | MUST | Revoke된 기기는 신규 API Session, Download Session, Lease 갱신 및 Capsule 발급을 받을 수 없어야 한다. | Post-revoke denial |
| MAPP-REC-003 | MUST | 기기 간 Device Key, Wrap Private Key 또는 기존 DEK를 이전해서는 안 된다. | Recovery path inspection |
| MAPP-REC-004 | MUST | 새 기기는 새 키와 Attestation으로 등록하고 현재 Consent·Authorization·Grant를 다시 검증해야 한다. | Replacement E2E test |
| MAPP-REC-005 | MUST | 재발급은 Source PACS에서 새 Capsule을 생성해야 하며 Permanent Cloud Copy나 Key Escrow를 사용해서는 안 된다. | Reissue path test |
| MAPP-REC-006 | MUST | 오프라인 분실 기기는 Lease 만료 전 즉시 차단할 수 없음을 숨기지 않아야 한다. | Risk/UX verification |

---

# 18. Audit, Logging and Privacy Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-AUD-001 | MUST | Device 등록·Export·다운로드·Vault 활성화·Viewer open/close·Lease·Revoke·QR 행위를 감사 가능하게 기록해야 한다. | Event coverage test |
| MAPP-AUD-002 | MUST | Audit에는 actor, tenant, action, resource reference, outcome, timestamp, correlation/session context가 포함되어야 한다. | Schema test |
| MAPP-AUD-003 | MUST | 서버 관찰 이벤트와 `CLIENT_REPORTED` 모바일 이벤트를 구분해야 한다. | Source-field test |
| MAPP-AUD-004 | MUST | 모바일 이벤트는 Device Proof, event ID deduplication, 순서 Gap 탐지를 지원해야 한다. | Tamper/replay tests |
| MAPP-AUD-005 | MUST | PHI, DICOM Payload, Pixel Buffer, Token, DPoP Proof, QR 원문, Key, Attestation 원문을 로그에 기록해서는 안 된다. | Automated log scan |
| MAPP-AUD-006 | MUST | 환자는 자신의 주요 Export·열람·QR 승인 결과를 이해 가능한 활동 기록으로 확인할 수 있어야 한다. | Activity UI test |
| MAPP-AUD-007 | SHOULD | 보안 실패 사유는 사용자가 행동할 수 있게 표현하되 공격자에게 존재·정책 세부정보를 노출하지 않아야 한다. | Error disclosure test |

---

# 19. Transport and API Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-API-001 | MUST | 모든 모바일 API는 HTTPS를 사용하고 인증서 검증 실패 시 연결을 거부해야 한다. | TLS/certificate tests |
| MAPP-API-002 | MUST | Token, DPoP Proof, Download Token, QR reference 또는 Lease Proof를 URL Query에 넣어서는 안 된다. | URL/log inspection |
| MAPP-API-003 | MUST | 서버는 Patient, Tenant, Device, Grant와 Resource 소유권을 요청 Body가 아닌 인증 Context와 DB 관계로 검증해야 한다. | Body-spoof tests |
| MAPP-API-004 | MUST | 다른 Patient/Device의 IDOR 요청은 권한을 거부하고 존재정보를 최소화해야 한다. | Cross-resource tests |
| MAPP-API-005 | MUST | 오류 응답은 공통 Error Envelope와 Correlation ID를 사용하고 비민감 정보만 제공해야 한다. | Error contract test |
| MAPP-API-006 | MUST | Mutating API는 Idempotency와 상태 version/`If-Match`를 적용해야 한다. | Retry/stale-state tests |
| MAPP-API-007 | SHOULD | 202/429/503 응답에는 정책상 적절한 `Retry-After`를 제공해야 한다. | HTTP contract test |
| MAPP-API-008 | MUST | OpenAPI 3.1 계약, 생성 Client, Mock, Lint 및 음성 Contract Test가 구현 Gate여야 한다. | CI evidence |

---

# 20. Performance and Resource Requirements

다음 값은 P1 Synthetic/Test Dataset의 초기 성능 목표이며 물리기기 시험으로 검증·조정해야 한다.

| ID | Priority | Requirement | Proposed acceptance target |
|---|---|---|---|
| MAPP-PERF-001 | SHOULD | 앱 Cold Start | 지원 기준기기 p95 3초 이내에 로그인/잠금 화면 표시 |
| MAPP-PERF-002 | SHOULD | 캐시된 Study/Vault 목록 | p95 1초 이내 표시 |
| MAPP-PERF-003 | SHOULD | 온라인 Study 목록 | 정상 Test Network에서 p95 3초 이내 첫 결과/명시적 로딩 상태 |
| MAPP-PERF-004 | SHOULD | Local Viewer 첫 프레임 | 지원 Test Capsule에서 인증 후 p95 2초 이내 |
| MAPP-PERF-005 | SHOULD | Viewer 상호작용 | 지원 데이터셋에서 목표 30fps, 장시간 정지 없이 점진적 표시 |
| MAPP-PERF-006 | MUST | 메모리 사용 | 전체 Study 평문 적재 금지; bounded buffer와 저메모리 복구 증거 |
| MAPP-PERF-007 | MUST | 다운로드 재개 | 중단 지점 이후 Range 재개; 완료 Chunk의 불필요한 전체 재다운로드 방지 |
| MAPP-PERF-008 | SHOULD | QR 생성/상태 갱신 | 정상 Test Network에서 생성 p95 2초, Polling 상태변화 5초 이내 표시 |
| MAPP-PERF-009 | MUST | 암호화 | 암호화를 비활성화하거나 평문 캐시로 성능 목표를 달성해서는 안 된다. |

성능 결과에는 기기, Android 버전, 데이터 크기, Transfer Syntax, 네트워크, 빌드 유형과 측정 방법을 기록해야 한다.

---

# 21. UX and Accessibility Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-UX-001 | MUST | Loading, Empty, Error, Offline, Expired, Revoked, Unsupported 상태를 구분해야 한다. | Screen-state test |
| MAPP-UX-002 | MUST | `VIEW`, `MOBILE_EXPORT`, `PACS_IMPORT`의 결과를 쉬운 문구로 구분해야 한다. | Content review |
| MAPP-UX-003 | MUST | 승인·삭제·기기폐기 등 중요 작업 직전에 대상과 결과를 표시해야 한다. | Confirmation UI test |
| MAPP-UX-004 | MUST | 네트워크 오류나 Timeout을 성공으로 표시해서는 안 된다. | Failure-path test |
| MAPP-UX-005 | MUST | 색상만으로 상태를 전달하지 않고 Text/Icon/Accessibility label을 제공해야 한다. | Accessibility test |
| MAPP-UX-006 | SHOULD | Screen Reader, 글자 확대, 키보드/스위치 접근 및 최소 터치영역을 지원해야 한다. | Accessibility matrix |
| MAPP-UX-007 | MUST | Offline/Lease 만료·분실기기·지원불가기기에서 사용 가능한 다음 행동을 안내해야 한다. | Recovery UX test |
| MAPP-UX-008 | MUST | 환자에게 암호화·기기보안·오프라인 제한을 정확하지만 과도하게 기술적이지 않은 문구로 설명해야 한다. | Usability review |

---

# 22. Error Handling and Fail-Closed Requirements

| ID | Priority | Requirement | Acceptance summary |
|---|---|---|---|
| MAPP-ERR-001 | MUST | 인증, Device Trust, Consent, Authorization, Grant, Lease 또는 무결성 결과가 UNKNOWN이면 보호 기능을 거부해야 한다. | Unknown-state matrix |
| MAPP-ERR-002 | MUST | Capsule 서명·Tag·Hash·길이·순서 검증 실패 시 파일을 활성화하거나 표시해서는 안 된다. | Corrupt corpus tests |
| MAPP-ERR-003 | MUST | Policy/API 장애 시 오래된 성공상태를 신규 권한으로 재사용해서는 안 된다. | Backend outage test |
| MAPP-ERR-004 | MUST | 오류 메시지는 안전한 사용자 행동과 Correlation ID를 제공하되 Secret·UID·내부 Endpoint를 노출하지 않아야 한다. | Error disclosure scan |
| MAPP-ERR-005 | MUST | 재시도 가능한 오류와 새 승인·재다운로드가 필요한 오류를 구분해야 한다. | UX/state test |

---

# 23. Data Lifecycle Requirements

| Data | Location | Lifecycle requirement |
|---|---|---|
| Source DICOM | Hospital PACS | Source of Record, MediQ/모바일이 대체하지 않음 |
| Temporary Cloud payload | MediQ temporary processing | 암호화, Tenant/Session/Study binding, TTL purge evidence |
| Capsule ciphertext | Mobile app-private Vault | Lease/Device 상태와 별도 lifecycle, backup 제외 |
| DEK | Capsule/session memory and wrapped form | 평문 장기 저장 금지, Device-bound wrap |
| Pixel buffer | Process memory | 필요한 범위·시간만 유지, 화면 종료/background 시 제거 |
| Metadata | Room/server DB | 최소화, Patient/Device binding, retention policy 적용 |
| Audit | Server evidence store | PHI 최소화, 변경 추적 가능, QR 원문 금지 |

---

# 24. Traceability to Existing Baseline

| Existing requirement | Refined by |
|---|---|
| REQ-MOB-001 Mobile Secure Vault | MAPP-VLT-001~010 |
| REQ-MOB-002 Secure Medical Capsule | MAPP-CAP-001~010 |
| REQ-MOB-003 Hardware-backed Key | MAPP-DEV-001~008 |
| REQ-MOB-004 Device Binding | MAPP-DEV-001~008, MAPP-EXP-003 |
| REQ-MOB-005 Biometric Unlock | MAPP-AUTH-006~008, MAPP-LVW-001 |
| REQ-MOB-006 MOBILE_EXPORT | MAPP-EXP-001~010 |
| REQ-MOB-007 Crypto-Shredding | MAPP-VLT-008, MAPP-REC-001~006 |
| REQ-MOB-VIEW-001 Patient Mobile Vault Viewer | MAPP-LVW-001~008 |
| REQ-MOB-010 Android-first | MAPP-PLT-001~004 |
| REQ-MOB-011 Device Security Admission | MAPP-DEV-001~008 |
| REQ-MOB-012 Performant Crypto-agile Capsule | MAPP-CAP-001~010, MAPP-PERF-* |
| REQ-MOB-013 Thirty-day Offline Lease | MAPP-OFF-001~006 |
| REQ-MOB-014 Background Privacy | MAPP-LIFE-001~002 |
| REQ-MOB-015 Screen Capture Restriction | MAPP-LIFE-003~004 |
| REQ-MOB-016 Lost/Replacement Device | MAPP-REC-001~006 |
| REQ-MOB-017 Key Lifecycle | MAPP-DEV-001~008, MAPP-CAP-005~009 |
| REQ-MOB-018 Capsule/Atomic Activation | MAPP-EXP-007~009, MAPP-CAP-*, MAPP-VLT-005 |
| REQ-MOB-019 Device-bound API | MAPP-AUTH-005, MAPP-API-* |
| SEC-MOB-008 QR Security | MAPP-QR-001~018 |

---

# 25. Acceptance and Definition of Done

모바일 애플리케이션은 다음 증거가 모두 있을 때만 해당 범위의 PASS를 주장할 수 있다.

## 25.1 Required test layers

- Domain/State Unit Test
- Compose UI and Navigation Test
- Android Keystore/Attestation Physical Device Test
- Capsule Known-answer and Backend↔Android Interoperability Test
- Malformed DICOM/Capsule Corpus Test
- Mobile API/OpenAPI Contract Test
- Download Resume/Process Death/Low Storage Test
- Offline Lease/Clock Manipulation Test
- Background/Capture/Backup Test
- QR normal, negative, relay and concurrency tests
- Cross-patient, cross-device, cross-tenant and wrong-destination Security Test
- Synthetic/Test Orthanc integration and P1 E2E
- Performance benchmark on declared support devices

## 25.2 Completion gate

```text
P0 prerequisite gates PASS
+
Android architecture and dependency rules PASS
+
Patient / Device binding PASS
+
Capsule crypto and interoperability PASS
+
Vault atomic storage and recovery PASS
+
Local Viewer security and performance PASS
+
Offline Lease and revocation PASS
+
QR Handoff and unique Grant binding PASS
+
Privacy / Audit / Log inspection PASS
+
Traceability evidence complete
=
MOBILE P1 DONE
```

`IMPLEMENTED != DONE`이며, 테스트하지 않은 요구사항은 PASS로 표시하지 않는다.

---

# 26. Open Decisions

| ID | Decision needed | Current position |
|---|---|---|
| MOB-OD-001 | Android min/target SDK | 구현 Ticket에서 최신 Stable·지원기기 조사 후 고정 |
| MOB-OD-002 | DICOM Parser/Renderer Library | License, 보안, Transfer Syntax, 성능 Spike 후 결정 |
| MOB-OD-003 | Production Identity Provider | Productionization |
| MOB-OD-004 | Exact QR/Grant TTL and rate limits | 현재 제안값을 사용성·위협 시험으로 검증 |
| MOB-OD-005 | Manual approval code fallback | QR v1 이후 접근성 후보 |
| MOB-OD-006 | Hospital scanner device attestation | 실시간 Relay 완화용 Post-MVP 후보 |
| MOB-OD-007 | PQC/Hybrid Wrap Profile | 표준·Android Backend 지원 검증 후 Registry 추가 |
| MOB-OD-008 | iOS scope and Secure Enclave profile | Android P1 완료 이후 |
| MOB-OD-009 | Diagnostic medical-device boundary | 실제 임상 사용 전 규제 검토 |

---

# 27. References

## Repository

- `PROJECT-CHARTER.md`
- `CAPSTONE-MVP-BOUNDARY.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `DOMAIN-MODEL.md`
- `DATA-MODEL.md`
- `SYSTEM-ARCHITECTURE.md`
- `DATA-FLOW.md`
- `THREAT-MODEL.md`
- `ACCEPTANCE-TESTS.md`
- `MOBILE-UI-UX-SPEC.md`
- `MOBILE-NAVIGATION-AND-STATE-MODEL.md`
- `MOBILE-APP-ARCHITECTURE.md`
- `SECURE-MEDICAL-CAPSULE-FORMAT.md`
- `MOBILE-API-CONTRACT.md`
- `architecture/qr/QR-HANDOFF-OVERVIEW.md`
- `architecture/qr/QR-SECURITY-ACCEPTANCE-TEST.md`

## External standards profile

- OAuth 2.0 Security Best Current Practice, RFC 9700
- OAuth 2.0 for Native Apps, RFC 8252
- PKCE, RFC 7636
- OAuth DPoP, RFC 9449
- HTTP Semantics, RFC 9110
- Android Keystore and Key Attestation documentation
- OWASP MASVS / MASTG
- DICOM PS3.18 Web Services
- OpenAPI Specification 3.1

---

# 28. Baseline Decision

```text
DOCUMENT:
MediQ Mobile Application Requirements Specification

CLASSIFICATION:
CAPSTONE-P1

ANDROID-FIRST:
YES

MOBILE VAULT:
DEFINED

LOCAL VIEWER:
DEFINED

QR HANDOFF:
DEFINED

SECURITY / PERFORMANCE / UX:
DEFINED

IMPLEMENTATION:
NOT IMPLEMENTED

TEST EXECUTION:
NOT EXECUTED

STATUS:
APPROVED P1 REQUIREMENTS BASELINE — IMPLEMENTATION NOT STARTED
```

---

# Synthetic Health Data Preview Requirements Amendment — 2026-09-26

## Scope

Android App은 실제 건강정보 기관 연결 없이 건강검진·일반 혈액검사·항체검사·진료·투약·예방접종 연계 UX를 보여주는 Optional P1 Preview를 포함할 수 있다.

포함:

- `MOB-HHP-001~008` Preview 화면
- Persistent `DEMO MODE` Disclosure
- 모의 본인확인·항목선택·모의 동의
- `TEST-*` Identity와 Synthetic Fixture
- Record별 `SYNTHETIC` Badge와 비진단 고지
- Preview 초기화와 DEMO Audit

제외:

- 실제 활용기관 지정심사·테스트베드·운영 API
- 실제 본인인증·법적 동의·환자 건강정보
- 실제 의료진 공유, PACS Import 또는 진료 판단
- 기관 Logo·인증 Badge·공식 연계 표현

## Mobile Requirements

| ID | Requirement | Verification |
|---|---|---|
| `MAPP-HHP-001` | 모든 Preview Destination에 고정 DEMO Banner를 표시해야 한다. | UI test |
| `MAPP-HHP-002` | Preview Navigation은 Mobile Vault·QR·Viewer State와 독립이어야 한다. | Navigation test |
| `MAPP-HHP-003` | Mock Provider 외 Provider가 선택되면 접근을 거부해야 한다. | Configuration test |
| `MAPP-HHP-004` | Marker가 유효한 Synthetic Fixture만 렌더링해야 한다. | Fixture test |
| `MAPP-HHP-005` | Mock Consent는 실제 Consent/Grant State를 변경하지 않아야 한다. | Domain test |
| `MAPP-HHP-006` | 공유·의료진 전달·PACS Import CTA를 제공하지 않아야 한다. | Negative UI test |
| `MAPP-HHP-007` | Reset은 Session과 합성 Cache를 제거해야 한다. | Functional test |
| `MAPP-HHP-008` | Screenshot과 발표 Viewport에서도 DEMO Banner가 유지되어야 한다. | Visual test |
| `MAPP-HHP-009` | 건강검진·일반 혈액검사·항체검사를 별도 Record Type과 Filter로 구분해야 한다. | UI/fixture test |
| `MAPP-HHP-010` | 검사 상세는 값·단위·출처 참고범위·합성 원문 판정·Fixture Version을 표시해야 한다. | UI test |
| `MAPP-HHP-011` | 앱이 검사값으로 정상·비정상·면역·질환 문구를 생성해서는 안 된다. | Negative content test |
| `MAPP-HHP-012` | 관련 영상 연결은 합성 Link만 사용하며 Share/PACS Import CTA를 제공하지 않아야 한다. | Navigation/security test |

Normative 세부사항은 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다. 현재 상태는 `DOCUMENTED — NOT IMPLEMENTED / NOT TESTED`다.

# Patient Experience Feature Pack Amendment — 2026-09-26

Mobile Application의 추가 Requirement는 `patient-experience` 문서군의 `REQ-PXE-*` 및 `SEC-PXE-*`를 따른다. 기능 1–7은 P1 후보, 기능 8–9는 POST-MVP다.

- 기존 77개 화면과 Navigation ID는 유지한다.
- `MOB-PXE-*`는 구현 전 검토용 논리 화면 ID이며 아직 전역 화면 수에 합산하지 않는다.
- 새 화면은 기존 잠금, Background 차폐, Screenshot 정책, Keystore/Vault, Offline Lease, 재인증 규칙을 그대로 적용한다.
- API·DB·Notification Provider·법적 위임 Workflow는 미구현 GAP다.

상세 연결은 `patient-experience/PATIENT-EXPERIENCE-TRACEABILITY.md`를 따른다.
