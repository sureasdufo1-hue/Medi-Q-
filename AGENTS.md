# MediQ Repository Agent Governance

이 문서는 MediQ Repository에서 AI Coding Agent가 코드를 수정할 때 따라야 하는 최상위 실행 규정이다.

## 1. 작업 원칙

모든 작업은 다음 순서를 따른다.

```text
Inspect first
→ approved Ticket 확인
→ Ticket 구현 기록 생성·확인
→ baseline 보존
→ smallest correct change
→ security invariant 강제
→ required tests 실행
→ 구현 보고서·테스트 증거 동기화
→ evidence 없이 PASS 주장 금지
→ 변경사항 정확히 보고
```

프로젝트의 최상위 성공조건은 변경하지 않는다.

> Synthetic/Test DICOM이 Hospital A Test Orthanc에서 MediQ의 Patient Mapping·Consent·Authorization·Scoped Transfer Grant 검증을 통과하여 Hospital B Test Orthanc에 STOW-RS로 전달되고, Destination Verification·Integrity·Provenance·Audit까지 PASS해야 한다.

## 1.1 권고안 기반 정책 결정 및 기록

사용자의 상시 지침(2026-09-30, 재확인 2026-10-01 및 2026-10-02)에 따라 프로젝트 범위 내 미결 정책은 매번 별도 승인을 기다리지 않고 근거에 기반한 권고안을 선택하여 진행한다. 정책이나 사전 승인이 필요한 작업을 만나면 먼저 권고안 초안(채택안·대안·근거·영향·범위·잔여 위험)을 작성하고, 구현 전에 관련 Acceptance 조건과 검증 방법을 문서화한다. 그 다음 승인된 범위 안에서 권고안을 기준으로 작업을 진행하며, 매 단계마다 같은 승인을 다시 요청하지 않는다. 문서 변경만으로 충분하지 않은 구현 Ticket은 별도 구현 기록·실제 시험 증거도 함께 작성한다.

각 결정 기록에는 최소 다음을 포함한다.

- 결정 ID, 날짜, 적용 상태 및 근거/권한
- 채택한 권고안과 고려한 대안
- 선택 이유, 적용 범위, 보안·데이터·운영 영향
- 갱신한 normative 문서, 구현 Ticket, 검증 증거

Acceptance에는 성공·실패·거부 경로, 보안 불변조건, 시험 데이터/환경 및 완료 판정 범위를 적는다. 권고안이 현재 승인 범위 안에서 적용 불가능하거나 제품 범위를 넓히거나, 명시적 보안 불변조건을 약화하거나, PHI·실제 운영 자격증명을 요구하거나, 외부 운영환경에 의미 있는 변경을 일으키면 현재 안전 기준을 유지하고 해당 부분은 실행 전에 사용자 선택을 요청한다. 사용자가 별도로 명시한 승인 Gate는 그대로 따른다.

이 상시 지침은 승인된 제품 범위를 넓히거나, 명시적 보안 불변조건을 약화하거나, 실제 환자정보·운영 자격증명 사용 및 외부 운영환경 변경을 허용하지 않는다. 그런 경계에 걸리면 안전한 현재 기준선을 유지하고 제한 사유와 권고안을 기록한다. 사용자의 구체적 후속 지시는 이 기본 권고안보다 우선한다.

## 2. 작업 시작 전 필수 확인

1. 저장소 상태와 기존 변경사항을 확인한다.
2. 다음 승인 기준 문서를 읽고 작업 범위를 결정한다.
   - `docs/PROJECT-CHARTER.md`
   - `docs/CAPSTONE-MVP-BOUNDARY.md`
   - `docs/PRODUCT-BASELINE.md`
   - `docs/REQUIREMENTS.md`
   - `docs/SECURITY-REQUIREMENTS.md`
   - `docs/DOMAIN-MODEL.md`
   - `docs/DATA-MODEL.md`
   - `docs/ERD.md`
   - `docs/SYSTEM-ARCHITECTURE.md`
   - `docs/TECH-STACK-DECISION.md`
   - `docs/P0-WEB-UI-UX-SPEC.md`
   - `docs/SAAS-SCREEN-DESIGN-SPEC.md`
   - `docs/hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md`
   - `docs/hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md`
   - `docs/DICOM-INTEROPERABILITY-PROFILE.md`
   - `docs/MOBILE-UI-UX-SPEC.md`
   - `docs/MOBILE-NAVIGATION-AND-STATE-MODEL.md`
   - `docs/MOBILE-APP-ARCHITECTURE.md`
   - `docs/SECURE-MEDICAL-CAPSULE-FORMAT.md`
   - `docs/MOBILE-API-CONTRACT.md`
   - `docs/MOBILE-APPLICATION-REQUIREMENTS.md`
   - `docs/MOBILE-SCREEN-DESIGN-SPEC.md`
   - `docs/architecture/qr/QR-HANDOFF-OVERVIEW.md`
   - `docs/DATA-FLOW.md`
   - `docs/OPENAPI.yaml`
   - `docs/THREAT-MODEL.md`
   - `docs/ACCEPTANCE-TESTS.md`
   - `docs/IMPLEMENTATION-PLAN.md`
   - `docs/implementation/README.md`
   - `docs/POLICY-DECISION-LOG.md` — 미결 정책, 채택 권고안 및 대안·근거 확인
3. 명시된 `MEDIQ-*` Ticket 또는 작업 범위를 확인한다.
4. 의존성, 영향받는 Tenant 경계, 관련 Acceptance Test를 확인한다.
5. 코드·설정·Migration·API·Schema·테스트를 변경하는 작업이면 `docs/implementation/<TICKET>/` 기록을 생성하거나 기존 기록을 연다.

상태가 불명확하면 첫 작업은 `MEDIQ-ENV-001 Repository Baseline Audit`이다.

## 3. 범위 및 변경 규칙

- P0 E2E와 P0 Security Validation이 P1 Mobile Secure Vault보다 우선한다.
- 승인된 문서와 충돌하는 기능을 임의로 추가하지 않는다.
- 가장 작은 올바른 변경만 구현한다.
- API는 데이터베이스 CRUD가 아니라 승인된 업무 행위를 노출한다.
- Domain Model과 OpenAPI Contract를 우회하는 임의의 endpoint를 만들지 않는다.
- 요구사항은 `CAPSTONE-P0`, `CAPSTONE-P1`, `POST-MVP`, `PRODUCTIONIZATION`, `OUT-OF-SCOPE` 중 하나로 분류한다.
- 분류되지 않은 요구사항은 구현하지 않는다.
- Legacy Highpass 코드는 참고·재사용 후보일 뿐 normative source가 아니다. Migration Gate를 통과한 경우에만 재사용한다.

## 4. 보안 불변조건

기본 정책은 `DENY BY DEFAULT`, 실패 정책은 `FAIL CLOSED`다.

- Consent와 Authorization은 별개의 검증이다.
- 유효한 Consent와 유효한 Authorization 없이는 영상 접근을 허용하지 않는다.
- Transfer Grant는 Tenant, Patient, Study/Series/Instance, Action, 만료범위를 모두 제한해야 한다.
- `VIEW`, `DOWNLOAD`, `PACS_IMPORT` 권한을 서로 혼동하거나 자동 승격하지 않는다.
- 모든 보호된 영상 접근은 Tenant Isolation 검증을 통과해야 한다.
- Hospital-local Patient ID와 MediQ Patient Reference를 분리한다.
- Invalid Patient Mapping이면 접근과 STOW를 모두 거부한다.
- Wrong Destination이면 STOW를 실행하지 않는다.
- DICOM Payload에 장기 Credential, Password, DEK, KEK를 포함하지 않는다.
- Secret, 실제 PACS Credential, 실제 환자정보, 운영 DICOM을 커밋하지 않는다.
- 로그에는 최소한의 비민감 진단 정보만 남기고 Payload와 Secret을 기록하지 않는다.
- Hospital PACS는 의료영상의 Source of Record이며 MediQ Cloud를 Permanent PACS나 장기 Archive로 구현하지 않는다.
- Browser 또는 Mobile Client가 Hospital PACS endpoint를 직접 호출하거나 PACS credential을 수신하게 하지 않는다.
- Cloud Viewer는 Backend Authorization Gateway와 short-lived Viewer Session을 거쳐 WADO-RS 데이터를 온디맨드로 전달한다.
- Viewer URL, Viewer Session ID 또는 DICOM UID는 단독 접근권한이 아니다.
- Cloud의 Temporary DICOM 객체는 Tenant/Session/Study에 binding하고 TTL 만료 후 purge evidence를 남긴다.
- 환자 Cloud Viewer는 P0 Synthetic/Test 범위이며, Mobile Vault에 저장된 영상의 환자 열람은 P1이다.

## 5. PACS 및 DICOM 규칙

- Hospital A/B는 Test Orthanc 또는 명시된 Test PACS만 사용한다.
- Source 조회는 DICOMweb(QIDO-RS/WADO-RS)을 사용한다.
- Viewer의 “스트리밍”은 video streaming이 아니라 WADO-RS 기반 Study/Series/Instance/Frame 온디맨드·점진적 전달로 구현한다.
- Destination Import는 STOW-RS를 사용한다.
- PACS Import 전 Mandatory Preflight를 실행한다.
- Preflight에는 destination, tenant, patient mapping, grant action/scope, consent, authorization, expiry, integrity/provenance가 포함된다.
- Preflight 실패 시 절대로 STOW-RS를 호출하지 않는다.
- Source Retrieval → Imaging Package → Destination Transfer → Destination Verification 순서를 보존한다.
- Destination Verification 실패 시 Exchange를 `COMPLETED`로 표시하지 않는다.
- Integrity 실패 시 `COMPLETED`로 표시하지 않는다.
- Retry는 idempotency와 중복 전송 방지를 고려한다.

## 6. 상태·감사·추적성

- Exchange Session 상태를 임의로 건너뛰거나 성공으로 위조하지 않는다.
- Consent, Authorization Decision, Transfer Grant, Viewer/Download/Import, Preflight, Verification 결과를 추적 가능하게 기록한다.
- Audit Event에는 actor, tenant, action, resource, outcome, timestamp, correlation/session context를 포함한다.
- Provenance는 source, package, destination 흐름을 연결해야 한다.
- 완료 보고에는 요구사항·코드·테스트 간 traceability를 명시한다.

## 7. 테스트와 완료 기준

테스트 전에는 PASS를 선언하지 않는다.

최소 검증 범위:

- Unit/Domain Test
- Contract/API Test
- DICOMweb Adapter Test
- Integration Test with Test Orthanc A/B
- Security Test: no consent, invalid grant, cross-tenant, wrong destination, invalid mapping
- E2E Acceptance Test: Hospital A → MediQ → Hospital B
- Integrity, Provenance, Audit 검증

성공·실패·거부 경로를 모두 테스트한다. 테스트를 실행할 수 없으면 실행하지 못한 이유와 미검증 위험을 명시하고 PASS라고 보고하지 않는다.

## 8. 데이터 및 환경 경계

- `TEST-*`, Synthetic Patient, Synthetic Hospital, Sample/De-identified DICOM만 사용한다.
- 실제 환자 개인정보, 주민등록번호, 운영 환자번호, 실제 진료기록, 실제 병원 Credential을 사용하지 않는다.
- 로컬 환경변수는 `.env.example`을 기준으로 설정하고 `.env`는 커밋하지 않는다.
- 테스트 데이터와 런타임 산출물은 Git에 포함하지 않는다.

## 9. 구현과 문서화의 단일 작업 규칙

코드·설정·Migration·API·Schema·테스트를 생성하거나 변경하는 작업은 구현과 문서화를 하나의 Ticket 작업으로 수행한다.

필수 작업 단위:

```text
Ticket 확인
→ docs/implementation/<TICKET>/ 기록 생성 또는 열기
→ 요구사항·보안·Acceptance Traceability 기록
→ 코드/설정 변경
→ 필요한 명령과 테스트 실행
→ TEST-EVIDENCE.md에 실제 명령·결과 기록
→ IMPLEMENTATION-REPORT.md에 구현 내용·미구현 범위·위험 기록
→ 관련 승인 문서 동기화
→ Ticket 상태 판정
```

각 구현 Ticket은 최소 다음 두 파일을 가진다.

- `docs/implementation/<TICKET>/IMPLEMENTATION-REPORT.md`
- `docs/implementation/<TICKET>/TEST-EVIDENCE.md`

필요한 경우 중요한 설계 선택은 별도 ADR로 작성하고 구현 보고서에서 링크한다.

규칙:

- 코드 변경만 있고 구현 보고서가 없으면 작업이 완료되지 않았다.
- 테스트를 실행했지만 `TEST-EVIDENCE.md`에 명령·결과가 없으면 증거로 인정하지 않는다.
- 테스트를 실행할 수 없으면 이유, 미검증 범위, 위험을 두 문서에 모두 기록하고 상태를 `PARTIAL` 또는 `BLOCKED`로 판정한다.
- 보고서에는 실제 환자정보, DICOM Payload, Secret, Token, PACS Credential 또는 민감 로그를 첨부하지 않는다.
- 구현 기록은 승인 기준선을 대체하지 않는다. 범위·API·Domain·Security 변경은 관련 승인 문서를 별도로 갱신한다.
- 문서 오탈자 수정, 읽기 전용 분석, 질의응답처럼 구현을 변경하지 않는 작업은 Ticket별 구현 기록 의무에서 제외할 수 있다.
- 하나의 작업이 여러 Ticket을 실제 구현하면 Ticket별 기록을 분리한다.

새 기록은 다음 스크립트로 생성할 수 있다.

```powershell
./scripts/new-implementation-record.ps1 `
  -Ticket MEDIQ-XXX-001 `
  -Title "Short implementation title" `
  -Classification CAPSTONE-P0
```

`docs/implementation/README.md`의 현황표도 같은 작업에서 갱신한다.

## 10. 문서 변경 규칙

구현이 승인 문서와 불일치하면 코드를 조용히 우선하지 않는다.

- 범위 변경은 `CAPSTONE-MVP-BOUNDARY.md`의 Scope Decision을 먼저 갱신한다.
- API 변경은 `OPENAPI.yaml`과 관련 요구사항·Acceptance Test를 함께 갱신한다.
- Domain/Data/ERD 변경은 관련 문서와 Migration 계획을 함께 갱신한다.
- 보안 통제 변경은 `SECURITY-REQUIREMENTS.md`와 `THREAT-MODEL.md`를 함께 검토한다.
- 문서와 구현이 모두 갱신되기 전에는 완료로 표시하지 않는다.

## 11. 변경 보고 형식

작업 종료 시 다음을 정확히 보고한다.

```text
Ticket:
Scope:
Changed:
Not changed:
Security impact:
Tests executed:
Tests not executed:
Evidence:
Implementation record:
Remaining risks:
Status: PASS / PARTIAL / BLOCKED
```

`IMPLEMENTED != DONE`이다. 구현만 완료된 경우 완료라고 주장하지 않으며, 요구사항·보안·테스트 증거가 있어야 `PASS`로 표시한다.
