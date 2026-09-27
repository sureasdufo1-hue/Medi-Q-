# MediQ Mobile Security Policy Baseline Change Report

**Project:** MediQ  
**Decision Date:** 2026-09-15  
**Baseline Version:** v1.2 P1 Mobile Security Policy Amendment  
**Status:** Approved Documentation Baseline / Implementation Not Started

## 1. Purpose

P1 Mobile Secure Vault의 미결정 정책값을 편의성 우선 MVP 기준으로 확정하고, 범위·제품·요구사항·보안·도메인·데이터·아키텍처·흐름·위협·시험·구현계획·ADR 간 추적성을 맞췄다.

## 2. Approved Decisions

- Android Native Secure Vault 우선, iOS Native Vault 후속
- Android StrongBox 선호, 검증된 TEE 허용
- Software/Unknown Key Security Level에서 Persistent Vault 거부
- AES-256-GCM, Capsule별 DEK, Hardware-backed Device Key 기반 Envelope Encryption
- 버전된 Crypto Suite와 복수 Wrap Slot을 통한 PQC/Hybrid 전환 준비
- NIST SP 800-57 계열에 따른 Key Lifecycle
- 30일 Offline Lease
- Background 즉시 Privacy Screen과 조건부 60초 재인증 유예
- Screenshot·녹화·미러링의 플랫폼 범위 내 기본 제한
- Cloud Key Escrow 없이 분실 기기 Revoke 및 Source PACS 재다운로드

## 3. Changed Documents

- `MOBILE-SECURITY-POLICY-BASELINE-UPDATE-PROMPT.md`
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
- `README.md`

## 4. Traceability

```text
REQ-MOB-010~017
  → SEC-MOB-010~017
  → THR-MOB-005~010
  → TC-MOB-010~017
  → MEDIQ-MOB-010~014
  → ADR-0007~0011
```

기존 `REQ-MOB-VIEW-001`, `REQ-MOB-008~009`와 `SEC/THR/TC-MOB-007~009`는 Local Viewer, Storage Isolation 및 Offline Copy 상위 요구사항으로 유지한다. `REQ-MOB-007`은 Crypto-Shredding 요구사항 ID로 유지한다.

## 5. Not Changed

- P0 A→B PACS Import Golden Path와 P0 Viewer 완료조건
- `OPENAPI.yaml`: P1 업무행위 Contract는 구현 Ticket 승인 전까지 Deferred
- PostgreSQL P0 17-table Schema와 Migration
- Runtime, Mobile App, Cryptographic Module 및 자동화 Test
- 실제 환자/실병원/상용 법률 적합성 범위

## 6. Verification

- 12개 Normative 문서 Version이 `v1.2 P1 Mobile Security Policy Amendment`로 일치함을 확인했다.
- Requirement, Security, Threat, Acceptance 및 Ticket 식별자 존재를 정적 검색으로 확인했다.
- 변경 문서의 Markdown Code Fence가 모두 짝수로 닫혔음을 확인했다.
- 모든 신규 Acceptance Test는 `NOT RUN`으로 유지했다.

## 7. References

- [NIST SP 800-57 Part 1 Rev. 5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)
- [NIST FIPS 203 — ML-KEM](https://csrc.nist.gov/pubs/fips/203/final)
- [NIST Cybersecurity White Paper — Crypto Agility](https://csrc.nist.gov/pubs/cswp/39/upd1/considerations-for-achieving-crypto-agility/final)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
- [Android Key Attestation](https://developer.android.com/privacy-and-security/security-key-attestation)
- [Android FLAG_SECURE Guidance](https://developer.android.com/security/fraud-prevention/activities)
- [Apple Secure Enclave Key Protection](https://developer.apple.com/documentation/Security/protecting-keys-with-the-secure-enclave)
- [Apple Background UI Protection](https://developer.apple.com/documentation/uikit/preparing-your-ui-to-run-in-the-background)
- [Apple Screen Capture State](https://developer.apple.com/documentation/uikit/uiscreen/iscaptured)

## 8. Status

문서 기준선 등록은 완료되었다. 구현과 시험 증거는 없으므로 Mobile Security Implementation 상태는 `PLANNED / NOT RUN`이며 보안 PASS로 간주하지 않는다.
