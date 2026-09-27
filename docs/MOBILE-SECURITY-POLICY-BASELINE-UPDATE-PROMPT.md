# MediQ Mobile Security Policy Baseline 개정 프롬프트

## 1. 역할

당신은 MediQ의 Product Owner, Mobile Security Architect, DICOM Security Engineer 및 Repository Governance Agent다. 기존 승인 문서의 P0 성공조건과 보안 불변조건을 보존하면서 P1 Mobile Secure Vault의 MVP 정책값을 공식 기준으로 등록한다.

## 2. 개정 목적

기존 문서에는 Mobile Secure Vault, Device Binding, Hardware-backed Key 및 Offline Copy가 P1로 정의되어 있으나 지원 플랫폼, 허용 기기, 오프라인 기간, Background 잠금, 화면 캡처 및 분실 복구 정책값이 확정되어 있지 않다. 아래 승인 결정을 모든 관련 문서에 일관되게 반영한다.

## 3. 승인된 정책 결정

1. P1 Mobile MVP의 Native Secure Vault는 Android를 우선 구현한다. iOS Native Vault는 후속 단계로 이관하되, iOS 사용 경로는 적용 가능한 Identity/Test 범위에서 반응형 Cloud Viewer로 유지한다.
2. Android `STRONGBOX`는 선호 등급이고 `TRUSTED_ENVIRONMENT`(TEE)는 MVP 허용 등급이다. `SOFTWARE` 또는 `UNKNOWN`만 확인되는 기기에는 Persistent Mobile Vault를 허용하지 않고 Cloud Viewer로 유도한다. 보안 등급을 조용히 하향해서는 안 된다.
3. Payload 암호화는 검증된 표준 암호와 Envelope Encryption을 사용한다. 기본 Suite는 AES-256-GCM, Capsule별 무작위 DEK, OS Hardware-backed Key로 보호되는 Device KEK, 버전된 Crypto Suite 및 복수 Key Wrap Slot 구조다. 평문은 승인된 Viewer의 메모리에만 존재하고 사용 후 제거한다.
4. PQC 전환은 대용량 DICOM Payload 재암호화가 아니라 DEK Wrap/Key Establishment 계층 교체로 수행한다. ML-KEM 계열을 수용할 수 있는 알고리즘 식별자와 Hybrid/복수 Wrap 구조를 두며 자체 암호를 만들지 않는다.
5. 키 생명주기는 NIST SP 800-57 계열 원칙에 따라 생성, 등록, 활성화, 사용, 회전, 폐기, 만료, 파기 및 감사를 추적한다.
6. Offline Lease 기본값은 마지막 성공한 온라인 정책 검증 또는 발급 시점부터 30일이다. 연결 가능 시 자동 갱신하며 만료 후에는 온라인 재검증 전까지 복호화를 거부한다. 오프라인 분실 기기에는 즉시 revoke를 강제할 수 없다는 잔여 위험을 명시한다.
7. 앱이 Background/Inactive 상태로 전환되면 의료영상 화면을 즉시 가리고 렌더링을 중단하며 복호화된 Pixel Buffer를 제거한다. 60초 이내 복귀이고 기기가 계속 잠금 해제 상태이면 재인증을 생략할 수 있다. 60초 초과, OS 잠금, 계정·기기 상태 변경 또는 보안 이벤트 발생 시에는 생체인증 또는 Device Credential을 다시 요구한다.
8. Mobile Viewer의 Screenshot, 화면녹화, 미러링 및 비보안 디스플레이 출력은 플랫폼이 제공하는 범위에서 기본 제한한다. Android는 `FLAG_SECURE` 계열 보호를 적용한다. iOS는 녹화·미러링 감지 시 화면을 가리고 App Switcher Snapshot을 제거하되 일반 Screenshot의 사전 완전 차단을 보장한다고 표현하지 않는다. 외부 카메라 촬영 방지는 보장하지 않는다.
9. 분실 또는 기기 교체 시 Vault Key를 Cloud에 Escrow하거나 다른 기기로 복구하지 않는다. 기존 Device Binding과 갱신을 취소하고 새 기기 등록 후 Source PACS에서 다시 내려받아 새 Device Key로 암호화한다. 기존 Consent와 `study:mobile-export` Grant가 유효하면 재발급할 수 있고, 무효·만료 상태이면 새 승인을 요구한다.
10. MediQ Cloud는 Mobile Vault 복구를 위한 원본 장기 저장소, Permanent PACS 또는 Device Private Key 보관소가 아니다.

## 4. 범위 및 우선순위

- 모든 신규 Mobile Native 정책은 `CAPSTONE-P1`이다.
- P0 Cloud Viewer, A→B PACS Import Golden Path 및 P0 Security Validation을 지연시키거나 완료조건을 변경하지 않는다.
- 실제 환자·운영 병원·상용 법률 적합성을 완료했다고 주장하지 않는다.
- P1 API Contract와 DB Migration은 구현 Ticket에서 별도 승인하기 전까지 만들지 않는다.

## 5. 필수 개정 문서

- `CAPSTONE-MVP-BOUNDARY.md`
- `PRODUCT-BASELINE.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `DOMAIN-MODEL.md`
- `DATA-MODEL.md`
- `ERD.md`
- `SYSTEM-ARCHITECTURE.md`
- `DATA-FLOW.md`
- `THREAT-MODEL.md`
- `ACCEPTANCE-TESTS.md`
- `IMPLEMENTATION-PLAN.md`
- `DECISIONS.md`

문서 버전은 `v1.2 P1 Mobile Security Policy Amendment`로 표시하고 2026-09-15 결정으로 기록한다.

## 6. 추적성 요구사항

각 정책은 Requirement → Security Requirement → Threat → Acceptance Test → Planned Ticket으로 추적되어야 한다. 최소한 다음 거부 경로를 계획한다.

- Software/Unknown Key Security Level에서 Persistent Vault 생성 거부
- 다른 기기로 복사한 Capsule 복호화 거부
- 30일 Offline Lease 만료 후 오프라인 복호화 거부
- Background 60초 초과 또는 OS 잠금 후 무인증 복귀 거부
- 화면녹화·미러링 감지 시 영상 노출 거부
- 분실·Revoke된 기기의 온라인 갱신 거부
- 만료·철회된 Consent/Grant를 이용한 새 기기 재발급 거부
- 키 삭제 후 Capsule 복호화 거부

## 7. 금지되는 해석

- `StrongBox 필수`로 해석하여 Android TEE 기기를 일괄 차단하지 않는다.
- Software-backed Key로 조용히 Fallback하지 않는다.
- 30일 Lease가 Consent, Authorization 또는 Grant를 대체한다고 해석하지 않는다.
- Background 60초 유예 동안 민감 화면을 노출하지 않는다.
- Screenshot 차단을 완전한 유출 방지 또는 외부 카메라 방지로 주장하지 않는다.
- 분실 복구를 위한 Cloud 원본 보존, Device Private Key Escrow 또는 Capsule 평문 백업을 만들지 않는다.
- PQC를 Payload 대칭암호의 대체재로 사용하거나 자체 암호 프로토콜을 만들지 않는다.

## 8. 완료 조건

문서 간 정책값과 용어가 일치하고, P0/P1 경계가 보존되며, 실제 구현과 자동화된 시험이 없는 항목은 `PLANNED / NOT RUN`으로 유지해야 한다. 문서 개정만으로 구현 완료 또는 보안 PASS를 선언해서는 안 된다.
