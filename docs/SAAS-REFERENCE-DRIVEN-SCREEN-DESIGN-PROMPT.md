# MediQ Reference-Driven SaaS 화면설계 구성 프롬프트

## 1. 역할

당신은 MediQ 의료영상 보안 SaaS의 화면설계를 구체화하는 전문 제품 설계팀이다.

다음 역할을 동시에 수행한다.

- Healthcare SaaS Product Designer
- Medical Imaging UX Designer
- PACS/RIS Workflow Analyst
- Enterprise SaaS Information Architect
- Multi-tenant Security UX Architect
- React Web Application Designer
- Design System Architect
- Accessibility Specialist
- DICOMweb Workflow Analyst
- Technical Writer
- QA Traceability Analyst

목표는 MediQ의 승인된 요구사항과 79개 SaaS Screen ID를 보존하면서, 공개 Reference에서 검증된 구조·상태·상호작용 패턴을 선택적으로 적용하여 구현 가능한 수준의 화면설계 패키지를 만드는 것이다.

외부 제품을 모방하거나 기존 제품 화면을 복제하지 않는다. Reference는 비규범 참고자료이며 MediQ 기준선을 변경하지 않는다.

실제 React 코드, Backend 코드, DB Migration, PACS 설정 또는 Figma 원본 파일은 이 작업에서 구현하지 않는다.

---

# 2. 작업 목표

현재 `SAAS-SCREEN-DESIGN-SPEC.md`에는 Hospital Portal, Synthetic Patient Web, QR Hospital Web, Admin Portal의 79개 화면과 기본 Wireframe이 정의되어 있다.

이번 작업은 다음을 수행한다.

1. 79개 Screen ID와 P0/P1/POST-MVP 분류를 유지한다.
2. `SAAS-UI-REFERENCE-RESEARCH.md`의 26개 Reference와 적용 판단을 화면별로 반영한다.
3. `SAAS-UI-REFERENCE-MATRIX.md`의 79/79 연결을 설계 근거로 사용한다.
4. 각 화면의 정보 구조, Layout, Component, 필드, CTA, 상태, 오류, 권한, API, Audit, 접근성, 반응형 동작을 구현 가능한 수준으로 구체화한다.
5. MediQ 고유 상태인 Consent·Authorization·Grant 분리, Mandatory Preflight, Result Unknown, Destination Verification, Integrity Gate, QR Claim과 환자 승인 분리를 시각적으로 명확히 한다.
6. 개발자가 화면을 구현하고 QA가 상태·거부 경로를 시험할 수 있는 추적성을 제공한다.

---

# 3. 필수 입력 문서

작업 전에 다음 문서를 읽는다.

## 3.1 Repository와 승인 기준선

- `AGENTS.md`
- `README.md`
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

## 3.2 Web·Viewer·DICOM 화면 기준

- `docs/P0-WEB-UI-UX-SPEC.md`
- `docs/SAAS-SCREEN-DESIGN-SPEC.md`
- `docs/DICOM-INTEROPERABILITY-PROFILE.md`
- `docs/TECH-STACK-DECISION.md`

## 3.3 QR와 Mobile 경계

- `docs/MOBILE-UI-UX-SPEC.md`
- `docs/MOBILE-NAVIGATION-AND-STATE-MODEL.md`
- `docs/MOBILE-SCREEN-DESIGN-SPEC.md`
- `docs/architecture/qr/QR-HANDOFF-OVERVIEW.md`
- `docs/architecture/qr/QR-REQUEST-STATE-MODEL.md`
- `docs/architecture/qr/QR-UI-UX-SPEC.md`
- `docs/architecture/qr/QR-THREAT-MODEL.md`

## 3.4 Reference Research

- `docs/SAAS-UI-REFERENCE-RESEARCH.md`
- `docs/SAAS-UI-REFERENCE-MATRIX.md`

문서 간 충돌 시 Reference가 아니라 승인된 Scope, Requirements, Security, Domain, Architecture, OpenAPI, Acceptance 기준을 우선한다.

---

# 4. 산출물

다음 문서를 작성하거나 개정한다.

## 4.1 주 산출물

`docs/SAAS-SCREEN-DESIGN-SPEC.md`

- 기존 79개 Screen ID를 유지한다.
- 기존 내용을 삭제하거나 별도 ID 체계로 복제하지 말고 상세 설계를 보강한다.
- 문서 Version을 증가시키되 승인 상태를 임의로 `APPROVED`로 변경하지 않는다.
- 실제 구현이 없으면 `Implementation: NOT IMPLEMENTED`, 시험이 없으면 `Test Status: NOT RUN`을 유지한다.

## 4.2 보조 산출물

`docs/SAAS-UI-DESIGN-SYSTEM.md`

- Color, Typography, Spacing, Grid, Elevation, Icon, Status, Form, Table, Dialog, Banner, Viewer Overlay token을 정의한다.
- 특정 외부 제품의 색상·icon·layout을 복제하지 않는다.

`docs/SAAS-UI-WIREFRAME-PACK.md`

- 핵심 P0/P1 화면의 Desktop·반응형 Wireframe을 Markdown, ASCII 또는 Mermaid로 제공한다.
- 최소한 Hospital Dashboard, Exchange Detail, Study List, Consent Status, Grant, Cloud Viewer, Preflight, Transfer Progress, Verification, Integrity, Audit, QR Waiting, Admin Connector 화면을 포함한다.

필요하면 다음 보조표를 작성한다.

`docs/SAAS-UI-SCREEN-TRACEABILITY-MATRIX.md`

- Screen → Requirement → Security → API → Audit → Acceptance → Reference를 연결한다.

## 4.3 변경 금지

이 작업만으로 다음 문서를 수정하지 않는다.

- Scope와 Product Baseline
- Requirements와 Security Requirements
- Domain/Data/ERD
- System Architecture와 Data Flow
- OpenAPI
- Threat Model과 Acceptance Tests

화면설계 중 계약 공백이나 충돌을 발견하면 승인 문서를 조용히 수정하지 말고 `GAP / OPEN DECISION / CHANGE REQUEST`로 기록한다.

---

# 5. 제품·보안 불변조건

모든 화면은 다음 조건을 보존한다.

1. Hospital PACS가 의료영상의 Source of Record다.
2. MediQ Cloud는 Permanent PACS나 장기 DICOM Archive가 아니다.
3. Browser는 PACS endpoint, PACS credential 또는 long-lived imaging credential을 받지 않는다.
4. Source 조회는 MediQ Backend가 승인 후 QIDO-RS/WADO-RS로 수행한다.
5. Cloud Viewer는 short-lived Viewer Session으로만 접근한다.
6. Destination Import는 Mandatory Preflight 후 Backend가 STOW-RS로 수행한다.
7. Destination Verification, Integrity, Provenance, Audit가 충족되기 전 `COMPLETED`를 표시하지 않는다.
8. Consent와 Authorization은 서로 다른 검증이다.
9. Transfer Grant는 Tenant, Patient, Study, Action, Recipient, Expiry에 binding된다.
10. `VIEW`, `DOWNLOAD`, `PACS_IMPORT`, `MOBILE_EXPORT` 권한을 혼동하거나 자동 승격하지 않는다.
11. Tenant/Hospital/Actor Context는 서버가 검증하며 UI 선택으로 권한을 만들지 않는다.
12. DICOM UID, Session ID, Viewer URL 또는 QR payload는 단독 접근권한이 아니다.
13. QR Scan은 Claim이며 Consent, 환자 최종 승인, Grant 발급 또는 PACS Import 완료가 아니다.
14. 승인 전 Hospital QR 화면에 환자명, Study UID, source hospital, thumbnail 또는 영상정보를 표시하지 않는다.
15. 기본 정책은 `DENY BY DEFAULT`, 실패 정책은 `FAIL CLOSED`다.
16. P0 화면은 Synthetic/Test/De-identified DICOM만 사용한다.
17. Browser cache, Service Worker, IndexedDB, localStorage에 DICOM/Pixel을 장기 저장하지 않는다.
18. Token, key, credential, raw QR, raw DICOM, 실제 PHI, 내부 endpoint와 stack trace를 화면·로그·analytics에 남기지 않는다.

---

# 6. Reference 적용 원칙

## 6.1 적용 순서

각 화면은 다음 순서로 설계한다.

```text
MediQ Requirement·Security·State·API 확인
→ SAAS-UI-REFERENCE-MATRIX의 Primary/Secondary Reference 확인
→ 적용 가능한 하위 Pattern 선택
→ 금지 요소 제거
→ MediQ 고유 상태와 문구로 변형
→ 화면별 Reference Decision 기록
```

## 6.2 Reference Decision

각 화면에 다음 중 하나를 기록한다.

- `ADOPT`: 구조를 직접 참고할 수 있음
- `ADAPT`: MediQ 업무·보안에 맞춘 변형 필수
- `STUDY ONLY`: 개념만 참고
- `NO SUITABLE PUBLIC REFERENCE`: MediQ 고유 설계 필요

## 6.3 금지사항

- Reference 제품의 screenshot, logo, icon, 문구, 색상 조합 또는 고유 layout을 그대로 복제하지 않는다.
- 외부 제품의 기능을 MediQ Requirement로 자동 추가하지 않는다.
- 외부 제품의 법적 동의, 보존기간, 인증 방식 또는 운영 SLA를 MediQ 정책으로 자동 적용하지 않는다.
- Reference URL이나 화면을 실제 보안 검증 증거로 사용하지 않는다.
- 저작권이 불명확한 이미지를 저장소에 복제하지 않는다.

---

# 7. Portal과 사용자 경계

최소 다음 Shell을 분리한다.

## 7.1 Hospital Portal

- 로그인과 Context
- Dashboard와 Exchange
- Source PACS Study 탐색
- Consent·Authorization·Grant 상태
- Cloud Viewer
- DICOM Download
- PACS Import와 전송
- Audit·Provenance
- P1 QR Hospital Web

## 7.2 Synthetic Patient Web

- 요청 확인
- Consent 검토·승인·철회
- 승인된 Cloud Viewer
- QR Handoff의 병원·행위·목적 확인

## 7.3 Platform Administration

- Tenant와 Hospital
- 사용자·역할
- Connector와 DICOMweb capability
- Certificate·mTLS
- Private connectivity
- Policy·TTL·Rate Limit
- Temporary object·Purge evidence
- Queue·Worker·Incident

Admin Portal은 POST-MVP/PRODUCTIONIZATION이며 P0 `HOSPITAL_USER`에게 표시하지 않는다.

---

# 8. 화면 범위

다음 79개 Screen ID를 모두 유지하고 누락 여부를 검사한다.

| 화면군 | Screen | 수 | 대표 Reference 방향 |
|---|---|---:|---|
| 로그인·Context | SAAS-SCR-001~006 | 6 | Azure context, Auth0 organization |
| Dashboard·Exchange | SAAS-SCR-010~016 | 7 | ADF monitor, Step Functions |
| Study 탐색 | SAAS-SCR-020~026 | 7 | OHIF Study List, Orthanc Explorer 2 |
| Consent·Grant | SAAS-SCR-030~039 | 10 | Entra consent review, Epic Share Everywhere |
| Cloud Viewer | SAAS-SCR-040~047 | 8 | OHIF, Cornerstone, DICOMweb viewer integration |
| Download | SAAS-SCR-050~053 | 4 | Job progress·expiry·failure patterns |
| PACS Import | SAAS-SCR-060~070 | 11 | Step execution, pipeline monitor, lineage |
| QR Hospital Web | SAAS-QR-001~010 | 10 | Device flow, number matching, linked device |
| Audit·Provenance | SAAS-SCR-080~085 | 6 | GitHub Audit, CloudTrail, Purview lineage |
| Tenant·Hospital 관리 | SAAS-ADM-001~010 | 10 | Connector health, tunnel health, PKI, service health |
| 합계 |  | 79 |  |

Screen ID를 합치거나 삭제해서 수를 줄이지 않는다. 동일 Layout을 공유할 수는 있지만 각 Screen의 진입조건, 상태, 행동과 완료조건은 독립적으로 명세한다.

---

# 9. 화면별 필수 설계 형식

각 Screen은 다음 형식으로 작성한다.

```text
Screen ID / 이름 / Phase:
목적:
Primary Actor:
Secondary Actor:
Portal / Route:
Entry Point:
Exit / Next Screen:
Preconditions:
Server-authoritative State:
Required Permission / Grant Scope:
Information Hierarchy:
Layout Regions:
Components:
Displayed Fields:
Primary CTA:
Secondary CTA:
Disabled/Hidden Rules:
Confirmation:
Loading:
Empty:
Success:
Denied:
Expired:
Revoked:
Conflict:
PACS Unavailable:
Integrity Failed:
Result Unknown:
Error Message:
Recovery Action:
API / Contract Status:
Audit Event:
Security Controls:
Privacy Minimization:
Accessibility:
Keyboard / Focus:
Responsive Behavior:
Reference IDs:
Reference Decision:
Applied Pattern:
Rejected Pattern:
Requirement / Security / Acceptance Trace:
Open Gap:
```

값이 존재하지 않으면 생략하지 말고 `NOT APPLICABLE`, `API GAP`, `OPEN DECISION`, `POST-MVP` 중 하나로 표시한다.

---

# 10. 공통 Layout 계약

## 10.1 Hospital Desktop Shell

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Synthetic/Test Banner                                               │
├──────────────┬───────────────────────────────────────┬───────────────┤
│ MediQ        │ Breadcrumb / Page title               │ Tenant        │
│              │                                       │ Hospital      │
│ Side Nav     │ Main Workspace                        │ Actor / Help  │
│              │                                       │               │
│              │                                       │               │
├──────────────┴───────────────────────────────────────┴───────────────┤
│ Safe status / Correlation ID / Session expiry                        │
└──────────────────────────────────────────────────────────────────────┘
```

- 현재 Tenant, Hospital, Actor와 Test 환경을 항상 확인할 수 있어야 한다.
- Context 전환은 별도 확인 후 수행하며 이전 Context의 query/cache/selection을 제거한다.
- Sidebar 항목은 권한과 Phase에 따라 숨기되 URL 직접 접근도 Backend가 거부한다.

## 10.2 Cloud Viewer Shell

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Test Banner | Source | Study alias | Session remaining | Close       │
├──────────────┬───────────────────────────────────────┬───────────────┤
│ Series       │ Viewer Viewport                       │ Session/Frame │
│ thumbnails   │                                       │ status        │
├──────────────┴───────────────────────────────────────┴───────────────┤
│ W/L | Zoom | Pan | Stack | Reset | Fullscreen                         │
└──────────────────────────────────────────────────────────────────────┘
```

- Viewer는 dark workspace를 사용할 수 있으나 Hospital/Admin navigation과 context는 일관되게 유지한다.
- Download와 PACS Import는 Viewer toolbar의 암묵적 기능으로 제공하지 않는다.
- Session expiry, Consent/Grant revoke, frame error를 서로 다른 overlay로 표현한다.

## 10.3 Patient Approval Shell

- 제공 병원, 요청 병원, Study의 최소 식별정보, action, purpose, expiry, Consent version을 위계적으로 표시한다.
- `나중에`, `거절`, `동의`, `최종 승인`의 의미를 구분한다.
- Consent 승인을 Grant 발급 또는 전송 완료로 표현하지 않는다.

## 10.4 Admin Shell

- Hospital Portal과 visual/navigation boundary를 분리한다.
- 현재 Tenant와 관리 권한을 고정 표시한다.
- Credential 원문이나 private key 표시 UI를 만들지 않는다.

---

# 11. 필수 공통 Component

다음 Component를 Design System에서 정의하고 사용 화면을 연결한다.

- `EnvironmentBanner`
- `VerifiedContextHeader`
- `ContextSwitcher`
- `ScopeBadge`
- `GrantActionBadge`
- `ServerStateBadge`
- `ConsentStatusCard`
- `AuthorizationDecisionCard`
- `TransferGrantCard`
- `ExchangeTimeline`
- `StudyTable`
- `SeriesNavigator`
- `ViewerSessionHeader`
- `ViewerToolbar`
- `SessionCountdown`
- `PreflightChecklist`
- `TransferStepper`
- `ResultUnknownPanel`
- `DestinationVerificationCard`
- `IntegrityEvidenceCard`
- `ProvenanceGraph`
- `AuditEventTable`
- `CorrelationErrorPanel`
- `QRScannerPanel`
- `PairingReference`
- `PatientApprovalWaitingPanel`
- `DangerousActionDialog`
- `ConnectorHealthCard`
- `CertificateExpiryCard`
- `IncidentImpactPanel`
- `EmptyState`
- `AccessDeniedState`
- `PacsUnavailableState`

각 Component는 목적, props/data source, 허용 상태, 금지 상태, keyboard/focus, responsive behavior, audit 여부와 사용 Screen을 명세한다.

---

# 12. 상태 표현 규칙

## 12.1 공통 상태

- `INITIAL`
- `LOADING`
- `CONTENT`
- `EMPTY`
- `OFFLINE`
- `RETRYABLE_ERROR`
- `NON_RETRYABLE_ERROR`
- `AUTH_REQUIRED`
- `ACCESS_DENIED`
- `EXPIRED`
- `REVOKED`
- `CONFLICT`
- `PACS_UNAVAILABLE`
- `INTEGRITY_FAILED`
- `RESULT_UNKNOWN`

색상만으로 상태를 전달하지 않는다. Icon, label, 설명과 다음 행동을 함께 제공한다.

## 12.2 의료영상 교환 상태

```text
Exchange
├─ Consent State
├─ Authorization Decision
├─ Transfer Grant State
├─ Imaging Retrieval State
├─ STOW State
├─ Destination Verification State
├─ Integrity State
├─ Provenance State
└─ Audit Evidence State
```

하나의 progress bar로 모든 상태를 합치지 않는다.

## 12.3 PACS Import 진행

```text
Preflight
→ Source Retrieval
→ Package Preparation
→ Destination STOW
→ Destination Verification
→ Integrity Verification
→ Provenance and Audit
→ Completed
```

- 서버가 제공한 실제 단계만 표시한다.
- byte 또는 instance count 근거가 없으면 가짜 percent를 표시하지 않는다.
- timeout이나 응답 유실은 `RESULT_UNKNOWN`으로 표시하고 destination verification 전 전체 재시도를 제공하지 않는다.

## 12.4 QR 진행

```text
QR CREATED
→ SCANNED LOCALLY
→ CLAIMED BY HOSPITAL
→ PATIENT REVIEW
→ CONSENT ACTIVE
→ FINAL APPROVAL
→ GRANT ISSUING
→ GRANT ISSUED
→ VIEW 또는 PACS IMPORT 준비
```

`SCANNED`, `CLAIMED`, `APPROVED`, `GRANT_ISSUED`, `TRANSFER_COMPLETED`를 서로 다른 문구와 상태로 표시한다.

---

# 13. 핵심 화면 상세화 우선순위

## 13.1 P0 필수 상세 Wireframe

다음 화면은 Desktop wireframe, responsive 변형, 모든 상태와 CTA를 상세히 작성한다.

- SAAS-SCR-003 역할·병원 Context
- SAAS-SCR-010 Hospital Dashboard
- SAAS-SCR-012 Exchange 상세
- SAAS-SCR-015 Exchange Timeline
- SAAS-SCR-023 Study 목록
- SAAS-SCR-024 Study 상세
- SAAS-SCR-030 Consent 요청
- SAAS-SCR-031 Consent 상태
- SAAS-SCR-032 Patient Consent 확인
- SAAS-SCR-033 Patient Consent 승인
- SAAS-SCR-036 Transfer Grant 발급
- SAAS-SCR-037 Transfer Grant 상태
- SAAS-SCR-042 Cloud DICOM Viewer
- SAAS-SCR-045 Viewer Session 만료
- SAAS-SCR-050 Download 확인
- SAAS-SCR-051 Download 진행
- SAAS-SCR-062 Mandatory Preflight
- SAAS-SCR-063 PACS Import 최종 확인
- SAAS-SCR-065 전송 진행
- SAAS-SCR-066 부분 성공·재시도 대기
- SAAS-SCR-067 Destination Verification
- SAAS-SCR-068 Integrity 결과
- SAAS-SCR-069 PACS Import 완료
- SAAS-SCR-070 전송 실패·거부
- SAAS-SCR-080 Audit Timeline
- SAAS-SCR-081 Provenance 상세

## 13.2 P1 QR 상세 Wireframe

- SAAS-QR-001 Scanner 시작
- SAAS-QR-003 QR 검증
- SAAS-QR-004 Claim 요청
- SAAS-QR-005 환자 승인 대기
- SAAS-QR-007 중복 Claim·충돌
- SAAS-QR-008 VIEW Grant 준비
- SAAS-QR-009 PACS_IMPORT Grant 준비
- SAAS-QR-010 Grant 실패

## 13.3 POST-MVP/PRODUCTIONIZATION 상세 Wireframe

- SAAS-ADM-001 Tenant 목록·상세
- SAAS-ADM-002 Hospital 등록·상태
- SAAS-ADM-004 PACS Connector 등록
- SAAS-ADM-005 DICOMweb Endpoint
- SAAS-ADM-006 인증서·mTLS
- SAAS-ADM-007 Private Connectivity
- SAAS-ADM-009 Temporary Object·Purge
- SAAS-ADM-010 Queue·Worker 상태

Phase를 유지하고 Admin 화면을 P0 구현 범위로 승격하지 않는다.

---

# 14. 정보 최소화 규칙

화면별로 반드시 `필요한 정보`, `숨길 정보`, `Audit에 남길 정보`를 구분한다.

기본 원칙:

- 환자명보다 Synthetic alias 또는 MediQ Patient Reference를 우선한다.
- Hospital-local Patient ID는 필요한 actor에게만 최소 표시한다.
- Study UID, Series UID, SOP Instance UID는 기본 UI와 URL에서 숨긴다.
- PACS endpoint, credential, token, key, QR 원문은 표시하지 않는다.
- Audit에는 actor, tenant, action, resource reference, outcome, timestamp, correlation/session context만 기록한다.
- 오류 화면에는 안전한 category, retryability, correlation ID, 지원 경로만 표시한다.
- 관리자 화면에도 secret 원문, private key, raw DICOM, object URL을 표시하지 않는다.

---

# 15. API와 UI 계약

각 Screen은 `OPENAPI.yaml`과 대조하여 다음 중 하나로 표시한다.

- `EXISTING CONTRACT`
- `PARTIAL CONTRACT`
- `API GAP`
- `EXTERNAL OIDC/BROWSER API`
- `POST-MVP CONTRACT REQUIRED`

UI가 API에 없는 기능을 임의로 가정하지 않는다.

특히 다음 Gap을 검토한다.

- Exchange pagination/list
- Consent detail·reject
- Viewer metadata discovery
- Durable PACS Import operation/status
- Result Unknown/reconciliation
- Context profile/switch
- Tenant/Hospital/Connector administration
- Audit global search/export
- 운영자용 health/incident

각 Gap에는 필요한 업무 행위, 요청·응답의 최소 필드, 권한, 상태, 오류와 연계 Screen을 제안하되 OpenAPI를 수정하지 않는다.

---

# 16. 접근성과 반응형

## 16.1 접근성

- WCAG 2.2 AA를 목표로 한다.
- 모든 기능은 keyboard로 접근 가능해야 한다.
- Modal은 focus trap과 focus return을 제공한다.
- 상태 변경은 적절한 `aria-live`로 전달한다.
- Data table은 caption, header association과 keyboard navigation을 제공한다.
- Viewer tool은 icon뿐 아니라 text label, tooltip, shortcut 도움말을 제공한다.
- Countdown은 매초 과도하게 읽지 않도록 의미 있는 시점에만 알린다.
- 위험 작업 dialog는 취소를 기본 focus로 고려한다.
- 색상 외에 label, icon, pattern을 사용한다.

## 16.2 반응형

- Hospital Portal은 Desktop/Workstation 우선이다.
- 1440px 이상, 1024~1439px, 768~1023px, 767px 이하의 동작을 정의한다.
- Viewer는 작은 화면에서 side panel을 drawer로 전환한다.
- 복잡한 table은 중요 열 고정, detail drawer 또는 card 변환 규칙을 명시한다.
- Patient Web은 mobile browser에서도 승인 summary와 CTA가 잘리지 않아야 한다.
- Admin의 복잡한 설정은 작은 화면에서 read-only 또는 제한될 수 있으나 정책을 명시한다.

---

# 17. Design System 요구사항

다음 token을 이름과 용도로 정의한다. 실제 Hex 값은 접근성 contrast를 검증한 뒤 확정한다.

## 17.1 Semantic Color

- Background / Surface / Elevated Surface
- Primary / Secondary
- Info / Success / Warning / Danger
- Denied / Expired / Revoked / Unknown / Integrity Failed
- Viewer Background / Viewer Overlay
- Synthetic/Test Banner

## 17.2 Typography

- Page title
- Section title
- Body
- Label
- Table
- Monospace reference/correlation
- Viewer overlay

## 17.3 Spacing과 Grid

- 4px 또는 8px 기반 spacing scale 중 하나를 선택하고 이유를 기록한다.
- Desktop shell, detail page, table, form, viewer의 grid를 정의한다.
- 최대 line length와 dense clinical table density를 정의한다.

## 17.4 Component State

모든 interactive component에 다음 상태를 정의한다.

- Default
- Hover
- Focus Visible
- Active
- Selected
- Disabled
- Loading
- Error
- Read-only

외부 제품과 동일한 token 이름, palette 또는 icon mapping을 복제하지 않는다.

---

# 18. 필수 비교·추적 표

## 18.1 Screen Design Coverage

| Screen ID | Phase | Actor | Layout | Components | States | API | Security | Reference | Wireframe | Status |
|---|---|---|---|---|---|---|---|---|---|---|

## 18.2 Reference Application Decision

| Screen ID | Reference ID | ADOPT/ADAPT/STUDY | 적용 요소 | 제외 요소 | MediQ 변경 |
|---|---|---|---|---|---|

## 18.3 Component Usage

| Component | Screens | Data Source | State Owner | Sensitive Data | Accessibility | Test |
|---|---|---|---|---|---|---|

## 18.4 State and Error Matrix

| Screen | Loading | Empty | Denied | Expired | Revoked | Conflict | PACS Unavailable | Integrity Failed | Result Unknown |
|---|---|---|---|---|---|---|---|---|---|

## 18.5 Traceability

| Screen | Requirement | Security Requirement | Threat | API | Audit Event | Acceptance Test | Gap |
|---|---|---|---|---|---|---|---|

---

# 19. 금지되는 화면 Pattern

다음 Pattern은 설계하지 않는다.

- Browser가 PACS에 직접 연결하는 Worklist 또는 Viewer
- PACS URL·Credential을 Client 설정 화면에 전달
- Cloud Permanent PACS 또는 장기 Archive를 전제로 한 메뉴
- 일반 환자 전체검색
- UI Role 선택만으로 권한이 생기는 Context Switcher
- Consent·Authorization·Grant를 하나의 `승인됨` badge로 합침
- VIEW Grant에서 Download/PACS Import CTA 활성화
- STOW 2xx 직후 완료 화면 표시
- Destination Verification 없는 성공 화면
- Integrity `FAILED` 또는 `PENDING`을 완료로 표시
- QR Scan 직후 환자·Study·Thumbnail 공개
- QR payload를 Access Token으로 사용
- 가짜 progress percent
- timeout을 자동 success 또는 failure로 표시
- blind `Retry All` 또는 중복 STOW 가능 버튼
- Browser storage에 DICOM/Pixel 저장
- 실제 환자정보가 포함된 screenshot·fixture
- 외부 제품의 화면·icon·문구 복제

---

# 20. 검증 방법

문서 작성 후 최소 다음을 검사한다.

1. `SAAS-SCREEN-DESIGN-SPEC.md`와 결과 문서의 고유 Screen ID가 79개인지 확인한다.
2. 기존 79개 ID 중 누락·추가·변경된 ID가 없는지 비교한다.
3. 모든 Screen이 Primary 또는 Secondary Reference, 혹은 `NO SUITABLE PUBLIC REFERENCE`를 갖는지 확인한다.
4. 모든 P0 화면에 Phase, Actor, State, API, Security, Audit, Acceptance trace가 있는지 확인한다.
5. 직접 PACS, 일반 환자검색, QR 선노출, 권한 자동승격, STOW 즉시 완료 Pattern이 없는지 검색한다.
6. `RESULT_UNKNOWN`, Destination Verification, Integrity Gate, QR Claim 분리 설계가 존재하는지 확인한다.
7. API GAP을 구현된 계약처럼 표현하지 않았는지 확인한다.
8. 외부 screenshot이나 저작권 불명확한 이미지를 저장하지 않았는지 확인한다.
9. 실제 구현·테스트가 없으면 `IMPLEMENTED`, `PASS`라고 표시하지 않았는지 확인한다.

검증 결과는 문서 말미에 숫자와 누락 목록으로 기록한다.

---

# 21. Open Decisions

최소 다음 항목을 유지하고 설계 영향과 권고안을 제시한다.

- Hospital 주 화면 해상도와 dual-monitor 사용
- Touch monitor·tablet 지원
- Dark Viewer와 Light Administration UI 분리
- 의료진 역할별 Dashboard 차이
- 병원 Workflow의 QR scanner 위치
- Transfer 상태 Polling/SSE/Operation resource
- PACS Import 평균·P95 처리시간
- Audit 검색·Export 권한
- Provenance Graph 상세 수준
- 운영자와 Hospital User 오류 메시지 분리
- 한국어 기본과 영어 표준용어 병기
- 의료영상 metadata 최소 표시 범위
- Patient Web step-up authentication 시점
- Viewer Session countdown 경고 시점
- Result Unknown의 운영자 escalation 경로

결정되지 않은 항목을 임의로 확정하지 않는다. P0 구현에 필요한 기본값을 제안할 수 있으나 `PROPOSED VALUE`로 표시한다.

---

# 22. 완료 조건

다음을 모두 충족해야 문서 작업을 `PASS`로 보고할 수 있다.

- 79개 Screen ID가 모두 보존되었다.
- 각 화면의 목적, actor, guard, layout, component, CTA, state, error, API, security, audit, accessibility, responsive, reference와 traceability가 정의되었다.
- 핵심 P0 화면과 QR/Admin 대표 화면의 Wireframe이 제공되었다.
- Reference 적용·변형·제외 근거가 화면별로 기록되었다.
- Design System과 공통 Component 계약이 작성되었다.
- MediQ 고유 completion gate와 fail-closed 상태가 시각적으로 구분되었다.
- API/Role/Policy Gap이 별도로 기록되었다.
- 기준 문서와 충돌하는 새 기능을 추가하지 않았다.
- 실제 구현·테스트가 없는 상태를 정확히 `NOT IMPLEMENTED / NOT RUN`으로 표시했다.

---

# 23. 최종 보고 형식

```text
PHASE RESULT

Previous:
79개 SaaS 화면과 Reference Research는 존재하지만 Reference 기반 상세 Layout·Component·상태·Design System 적용 설계가 부족함

Target:
79개 화면 전체에 Reference 판단, 구현 가능한 UI 계약, Wireframe, Design System과 추적성을 제공

Achieved:
PASS / PARTIAL / BLOCKED
```

다음을 보고한다.

1. 기존 Screen 수
2. 결과 Screen 수
3. 누락 Screen
4. 추가 Screen
5. P0/P1/POST-MVP 분류 변화 여부
6. 상세화한 Wireframe 수
7. 정의한 공통 Component 수
8. 연결한 Reference 수
9. ADOPT/ADAPT/STUDY ONLY/NO REFERENCE 수
10. API GAP 수
11. Security Gap 수
12. Open Decision 수
13. 수정한 문서
14. 수정하지 않은 승인 기준 문서
15. 구현·테스트 상태
16. Remaining Risk

Repository 작업 보고는 다음 형식을 추가로 따른다.

```text
Ticket:
Scope:
Changed:
Not changed:
Security impact:
Tests executed:
Tests not executed:
Evidence:
Remaining risks:
Status: PASS / PARTIAL / BLOCKED
```

문서 설계 완료는 UI 구현 완료 또는 의료·보안·접근성 인증 완료를 의미하지 않는다.
