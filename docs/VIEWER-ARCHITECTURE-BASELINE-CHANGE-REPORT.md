# MediQ Viewer Architecture Baseline Change Report

**Change Date:** 2026-09-15  
**Change Objective:** MediQ Viewer and Storage Architecture Baseline Alignment  
**Status:** PASS — documentation baseline only

## Documents Reviewed and Changed

- `PROJECT-CHARTER.md`
- `CAPSTONE-MVP-BOUNDARY.md`
- `PRODUCT-BASELINE.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `DOMAIN-MODEL.md`
- `DATA-FLOW.md`
- `DATA-MODEL.md`
- `ERD.md`
- `SYSTEM-ARCHITECTURE.md`
- `OPENAPI.yaml` / `OPENAPI.md`
- `THREAT-MODEL.md`
- `ACCEPTANCE-TESTS.md`
- `IMPLEMENTATION-PLAN.md`
- `REPOSITORY-BASELINE-AUDIT.md`
- Repository `README.md` / `AGENTS.md`
- `DECISIONS.md`

## Core Decisions Applied

- Hospital PACS = Source of Record
- MediQ Cloud = No Permanent PACS / No Long-Term Imaging Archive
- MediQ Cloud = Authorized Viewer Gateway + Temporary Exchange Broker
- Hospital User Cloud Viewer = CAPSTONE-P0
- Synthetic Patient Cloud Viewer = CAPSTONE-P0
- Cloud Viewer = Source PACS WADO-RS On-Demand/Progressive Delivery
- Patient Mobile Viewer = CAPSTONE-P1 Mobile Secure Vault Local Copy
- PACS endpoint/credential = Backend-only
- ViewerSession = short-lived, actor/tenant/patient/study/grant-bound
- Temporary cache = encrypted, TTL-bounded, purge-audited

## Clarification Gaps Resolved

1. Patient Cloud Viewer의 P0 Actor 범위
2. “Streaming”과 DICOMweb On-Demand Retrieval의 용어 구분
3. Short-lived ViewerSession lifecycle
4. Browser/PACS 직접 연결 금지
5. Temporary Cache TTL와 purge evidence
6. Source PACS unavailable 시 Fail-Closed 동작
7. Cloud Viewer와 Mobile Vault Viewer의 서로 다른 Payload source
8. OpenAPI의 Instance/Frame retrieval 계약과 traceability

**Unresolved baseline conflicts:** 0 identified in the amended sections.

## Traceability Added

```text
REQ-VIEW / REQ-DATA / REQ-MOB
→ SEC-VIEW / SEC-CACHE / SEC-MOB
→ THR-VIEW / THR-MOB
→ OPENAPI Viewer Operations
→ TC-VIEW / TC-DATA / TC-MOB
→ MEDIQ-VIEW / MEDIQ-DATA / MEDIQ-SEC / MEDIQ-MOB Tickets
```

**Traceability status:** PASS at documentation level.

## Validation Evidence

- 모든 개정 대상 문서에서 `Source of Record`, Permanent Cloud PACS 금지, Mobile P1 경계 확인
- 모든 normative document version을 `v1.1 Viewer Architecture Amendment` 또는 동등한 amended baseline으로 정렬
- `OPENAPI.yaml` YAML parsing PASS
- OpenAPI local component reference resolution PASS
- OpenAPI 설명본의 embedded YAML을 `OPENAPI.yaml`과 동기화
- Repository audit의 `CAPSTONE TECHNICAL READINESS = BLOCKED` 유지
- 구현 및 runtime 테스트 PASS 상태를 새로 부여하지 않음

## Implementation Status

문서 개정만 수행했으므로 실제 구현 상태는 변경되지 않았다.

```text
VIEWER IMPLEMENTATION: MISSING
DICOMWEB INTEGRATION: MISSING
TEMPORARY CACHE: MISSING
MOBILE VAULT VIEWER: P1 NOT STARTED
CAPSTONE TECHNICAL READINESS: BLOCKED
NEXT RECOMMENDED TICKET: MEDIQ-ENV-002
```

## Remaining Design Decisions

- ViewerSession 기본 TTL과 최대 연장 횟수
- Temporary Cache TTL, 최대 크기 및 purge SLA
- 지원할 WADO-RS transfer syntax와 rendered frame media type
- Viewer UI/Rendering 기술 선택
- Source PACS Connector의 network deployment 방식
- P1 Mobile screenshot/screen-recording 정책
- 이미 Export된 offline mobile copy의 revoke/expiry 세부정책

이 결정들은 후속 Ticket에서 확정하며, 현재 문서 개정의 완료를 차단하지 않는다.

## Final Decision

```text
CHANGE OBJECTIVE: COMPLETE
EXISTING FILES CHANGED: 19
CHANGE REPORT ADDED: 1
BASELINE CONFLICTS REMAINING: 0 IDENTIFIED
TRACEABILITY UPDATED: PASS
OPENAPI YAML VALIDATION: PASS
IMPLEMENTATION STATUS CHANGED: NO
RUNTIME TESTS EXECUTED: NO
STATUS: PASS — DOCUMENTATION BASELINE ONLY
```
