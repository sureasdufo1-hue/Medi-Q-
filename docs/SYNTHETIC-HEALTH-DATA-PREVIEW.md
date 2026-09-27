# MediQ Synthetic Health Data Preview Specification

**Project:** MediQ  
**Document ID:** MEDIQ-HHP-001  
**Document:** `SYNTHETIC-HEALTH-DATA-PREVIEW.md`  
**Version:** 1.1.0 — Synthetic Checkup, Lab & Antibody Amendment  
**Classification:** CAPSTONE-P1 PROTOTYPE / PRODUCTIONIZATION PREVIEW  
**Status:** APPROVED PROTOTYPE BASELINE — DOCUMENTED, NOT IMPLEMENTED / NOT TESTED  
**Owner:** MediQ Product, Mobile, Architecture, Security & QA  
**Last Updated:** 2026-09-26

---

# 1. Decision Summary

MediQ는 학교 Capstone 시연에서 환자가 건강검진·일반 혈액검사·항체검사·진료·투약·예방접종 기록을 연계하는 향후 사용자 경험을 보여줄 수 있다.

현재 MediQ는 건강정보 고속도로 활용기관 지정심사, 테스트베드 승인 또는 운영 API 연계를 완료하지 않았다. 따라서 Preview는 다음 경계를 강제한다.

```text
CAPSTONE-P1 PROTOTYPE
= Synthetic/Test Identity
+ Mock Provider
+ Synthetic FHIR-shaped Fixture
+ Simulated Authentication and Consent
+ Persistent DEMO MODE Disclosure
+ No Real External Health Data Call

PRODUCTIONIZATION
= Institution Designation Review
+ Testbed Onboarding
+ Official API Contract and Credential
+ Real Identity Proofing
+ Legally Valid Consent
+ Privacy/Security/Interoperability Validation
```

Preview는 실제 지정심사 승인, 실제 건강정보 고속도로 연결, 공식 FHIR 적합성 또는 실제 환자정보 수신을 주장하지 않는다.

---

# 2. Product Position

## 2.1 Included

- Android Patient App의 `건강정보 연동 데모` 진입점
- `DEMO MODE`가 고정 표시된 안내·범위 선택·모의 동의·결과 화면
- 건강검진, 일반 혈액검사, 항체검사, 진료이력, 투약이력, 예방접종의 Synthetic Fixture
- 검사명·검사일·결과값·단위·출처 제공 참고범위·출처 제공 판정의 환자 친화 표시
- 같은 날짜의 합성 의료영상과 검사정보를 편의상 묶어 보는 `Related Records` 표현
- `TEST-*` Patient Reference만 사용하는 결정론적 시나리오
- `HealthDataProvider` Port와 `MockHealthDataProvider` 논리 설계
- 합성 데이터 출처·생성시각·시나리오 버전 표시
- Preview 사용·동의·초기화 Audit Event
- 실제 연계에 필요한 후속 Gate와 미완료 상태 표시

## 2.2 Excluded

- 건강정보 고속도로 활용기관 지정심사 완료 주장
- 건강정보 고속도로·국민건강보험공단·심사평가원·질병관리청 운영 API 호출
- 실제 본인인증, 실제 동의, 실제 환자정보 또는 운영 Credential
- 기관 로고·인증마크 또는 공식 파트너처럼 보이는 표현
- 실제 의료진 공유, 진료 의사결정, 건강상태 평가 또는 진단
- 운영 FHIR Server, Full EMR/PHR 또는 Full FHIR Platform
- P0 의료영상 Exchange 완료조건 변경

## 2.3 Classification

| 항목 | 분류 |
|---|---|
| Preview UI·Synthetic Fixture·Mock Provider | `CAPSTONE-P1 PROTOTYPE` |
| P0 의료영상 Exchange | 변경 없음 |
| 실제 지정심사·테스트베드·공식 API | `PRODUCTIONIZATION` |
| 실제 환자정보 수신·저장·의료진 공유 | `PRODUCTIONIZATION` |
| Full FHIR Platform | `OUT-OF-SCOPE` |

---

# 3. Mandatory Disclosure

모든 Preview 화면은 다음 의미를 전달하는 고정 Banner를 가져야 한다.

> **건강정보 연계 데모 — DEMO MODE**  
> 이 화면은 합성 데이터와 Mock API를 사용하는 Capstone 시연입니다. 실제 기관 지정심사 또는 운영 API 연계가 완료된 상태가 아닙니다.

규칙:

- Banner는 첫 화면, 동의 화면, 결과 목록, 상세 화면과 오류 화면에서 제거할 수 없다.
- 작은 각주만으로 Disclosure를 대체하지 않는다.
- `승인 완료`, `공식 연동`, `운영 연결`, `실제 건강검진 결과`라는 표현을 사용하지 않는다.
- 상태는 `모의 연계`, `합성 데이터`, `지정심사 필요`, `운영 연계 미실시`로 표현한다.
- 실제 기관 로고, 인증마크, 파트너 Badge를 사용하지 않는다.

---

# 4. User Flow

```text
Patient opens Health Data Preview
  → DEMO MODE disclosure
  → Select synthetic data categories and period
  → Review simulated use purpose and retention
  → Confirm mock consent
  → MockHealthDataProvider returns deterministic fixture
  → Validate TEST identity + sourceMode + fixture version
  → Show synthetic health record list/detail
  → Record demo audit event
  → Patient resets preview data
```

어떤 단계에서도 실제 외부 기관으로 요청을 보내지 않는다.

---

# 5. Screen Baseline

| Screen ID | 화면 | 필수 상태·표시 |
|---|---|---|
| `MOB-HHP-001` | 건강정보 연동 데모 소개 | DEMO MODE, 실제 연계 미실시, 기능 설명 |
| `MOB-HHP-002` | 모의 연결 및 본인확인 | `모의 본인인증`, TEST Patient 표시 |
| `MOB-HHP-003` | 데이터 항목·기간 선택 | 검진·혈액검사·항체검사·진료·투약·예방접종, 합성 범위 |
| `MOB-HHP-004` | 모의 활용동의 | 목적·항목·기간·초기화, 법적 동의 아님 |
| `MOB-HHP-005` | 합성 건강기록 목록 | 건강검진·검사결과 Card, 각 Card에 `SYNTHETIC` Source Badge |
| `MOB-HHP-006` | 합성 건강기록 상세 | 값·단위·출처 제공 참고범위·원문 판정·Fixture Version·비진단 고지 |
| `MOB-HHP-007` | Preview 초기화 | 로컬/Mock Session 삭제 확인 |
| `MOB-HHP-008` | 오류·미지원 | 외부 연계 시도 없음, 재시도·초기화 |

## 5.1 Recommended Copy

```text
연결 상태: 모의 연계 환경
데이터 출처: 시연용 합성 데이터
본인확인: 모의 본인확인 완료
동의 상태: 시연용 선택 완료
실제 서비스 요건: 활용기관 지정심사 및 테스트베드 검증 필요
```

## 5.2 Forbidden Copy

```text
건강정보 고속도로 연동 완료
지정심사 승인
공식 인증 완료
국민건강보험공단에서 수신한 내 기록
실제 건강검진 결과
```

---

# 6. Architecture Boundary

```text
Android Patient App
  → Health Data Preview Use Case
  → HealthDataProvider Port
      ├── MockHealthDataProvider [CAPSTONE-P1, allowed]
      └── HealthHighwayDataProvider [PRODUCTIONIZATION, absent/disabled]
  → Synthetic Fixture Validator
  → Preview View Model
  → Demo Audit Event
```

Architecture rules:

- `MockHealthDataProvider`만 Capstone Build에서 활성화한다.
- 실제 Provider 구현체, 운영 Base URL, Client Credential, 인증서 또는 Secret을 포함하지 않는다.
- Release/Production Profile에서 Mock Provider를 실데이터 Provider로 가장하지 않는다.
- Preview는 DICOMweb QIDO/WADO/STOW, Viewer Session, Mobile Capsule 경로와 분리한다.
- Preview 실패가 P0 E2E 또는 P1 Mobile Vault 동작을 차단해서는 안 된다.
- 실제 Provider 연계 시 Mobile이 기관 API를 직접 호출하지 않고 MediQ Backend Connector를 사용한다.
- 실제 API Path는 별도 승인된 OpenAPI·Domain·Data·Security·Acceptance 변경 전까지 정의된 것으로 간주하지 않는다.

---

# 7. Logical State Model

```text
UNAVAILABLE
  → DEMO_READY
  → MOCK_IDENTITY_CONFIRMED
  → DEMO_SCOPE_SELECTED
  → DEMO_CONSENTED
  → SYNTHETIC_DATA_AVAILABLE
  → RESET
```

허용하지 않는 Capstone 상태:

```text
INSTITUTION_APPROVED
TESTBED_CONNECTED
PRODUCTION_CONNECTED
REAL_DATA_AVAILABLE
```

Capstone UI와 Audit는 위 금지 상태를 생성하거나 표시해서는 안 된다.

---

# 8. Synthetic Fixture Contract

최소 Fixture Envelope:

```json
{
  "schemaVersion": "mediq.health-preview.v1",
  "scenarioId": "HHP-DEMO-001",
  "sourceMode": "SYNTHETIC",
  "providerMode": "MOCK",
  "patientReference": "TEST-PATIENT-001",
  "generatedAt": "2026-09-26T00:00:00Z",
  "recordType": "HEALTH_CHECKUP",
  "record": {
    "examDate": "2026-08-10",
    "bloodPressure": "118/76",
    "fastingGlucoseMgDl": 92,
    "bmi": 22.4
  },
  "disclaimer": "CAPSTONE DEMO DATA — NOT A REAL MEDICAL RECORD"
}
```

## 8.1 Synthetic Checkup, Lab and Antibody Record Types

Preview Fixture는 다음 세 유형을 명시적으로 구분한다.

| `recordType` | 의미 | FHIR 참고 형태 | 필수 표시 |
|---|---|---|---|
| `HEALTH_CHECKUP` | 합성 건강검진 요약 | 건강검진 Core Data 참고 | 검진일, 항목, 값·단위, 합성 출처 |
| `LAB_OBSERVATION` | 합성 일반 혈액·진단검사 | `Observation (Lab)` 참고 | 검사명/코드, 채취·결과일, 값·단위, 출처 참고범위 |
| `ANTIBODY_OBSERVATION` | 합성 항원·항체검사 | `Observation (Lab)` 참고 | 검사명/코드, 값 또는 원문 결과, 단위, 출처 원문 판정 |

예시:

```json
{
  "schemaVersion": "mediq.health-preview.v1.1",
  "scenarioId": "HHP-DEMO-LAB-001",
  "sourceMode": "SYNTHETIC",
  "providerMode": "MOCK",
  "patientReference": "TEST-PATIENT-001",
  "recordType": "ANTIBODY_OBSERVATION",
  "record": {
    "testCodeSystem": "MEDIQ-DEMO-LAB",
    "testCode": "DEMO-ANTI-HBS",
    "testDisplay": "B형간염 표면항체 검사 (합성)",
    "observedAt": "2026-08-14T09:30:00+09:00",
    "value": 128.4,
    "unit": "mIU/mL",
    "referenceRangeText": "합성 제공기관 참고범위: 10 이상",
    "sourceInterpretationText": "합성 원문 판정: 반응성",
    "sourceOrganizationDisplay": "TEST 대학병원",
    "relatedRecordRefs": ["TEST-IMAGING-CHEST-CT-001"]
  },
  "disclaimer": "SYNTHETIC DEMO — NOT A REAL LAB RESULT OR MEDICAL INTERPRETATION"
}
```

표시 규칙:

- `referenceRangeText`와 `sourceInterpretationText`는 Fixture의 합성 제공기관 원문으로 표시한다.
- MediQ가 수치로부터 `정상`, `비정상`, `면역 있음`, `질병 의심`을 계산하거나 재작성해서는 안 된다.
- 항체검사 이름이 같아도 검사법·단위·참고범위가 다를 수 있으므로 값만 합쳐 비교하지 않는다.
- 의료영상과 검사는 `relatedRecordRefs` 또는 같은 합성 Encounter/날짜를 근거로 함께 표시할 수 있지만 인과관계·진단 관계를 암시하지 않는다.
- 실제 서울대학교병원, 대학병원, 건강정보 고속도로에서 수신한 것처럼 표현하지 않고 `TEST 대학병원`, `Mock Provider`, `SYNTHETIC`을 사용한다.
- Canonical Fixture는 `docs/assets/synthetic-health-data/mediq-health-preview-fixture-v1.1.json`에 둔다.

Fixture rules:

- `patientReference`는 반드시 `TEST-*` 형식이어야 한다.
- `sourceMode`는 `SYNTHETIC`, `providerMode`는 `MOCK`으로 고정한다.
- 실제 주민등록번호, 실제 병원 환자번호, 실제 의료기관 OID 또는 실제 건강기록을 포함하지 않는다.
- 값은 진단 또는 치료 권고를 유도하지 않는 중립적 시나리오로 구성한다.
- Fixture가 FHIR 구조를 참고할 수는 있으나 공식 FHIR 적합성이나 건강정보 고속도로 API 호환을 주장하지 않는다.
- Fixture Version과 Hash를 검증하여 발표 환경의 재현성을 확보한다.

Preview 단계에서는 신규 PostgreSQL Table 또는 장기 Cloud Health Record Store를 만들지 않는다. Fixture는 App Asset 또는 Test-only Backend Fixture로만 제공한다.

---

# 9. Requirements

| ID | Requirement | Classification |
|---|---|---|
| `REQ-HHP-001` | Preview는 P0와 분리된 P1 Prototype이어야 한다. | CAPSTONE-P1 |
| `REQ-HHP-002` | 모든 화면에 영구적인 DEMO MODE Disclosure를 표시해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-003` | `TEST-*` Identity와 Synthetic Fixture만 허용해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-004` | 실제 기관 API·인증·Credential 호출을 수행해서는 안 된다. | CAPSTONE-P1 |
| `REQ-HHP-005` | Mock Consent는 법적 동의와 명확히 구분해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-006` | 모든 Record는 Source Mode와 Fixture Version을 표시해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-007` | Preview Data를 즉시 초기화할 수 있어야 한다. | CAPSTONE-P1 |
| `REQ-HHP-008` | 실제 승인·공식 연계로 오인시키는 문구·Badge·Logo를 금지해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-009` | Preview 실패는 P0 및 Mobile Vault를 차단해서는 안 된다. | CAPSTONE-P1 |
| `REQ-HHP-010` | 실제 연계는 별도 Productionization Gate를 통과해야 한다. | PRODUCTIONIZATION |
| `REQ-HHP-011` | Preview는 건강검진, 일반 혈액검사와 항체검사를 구분된 Synthetic Record Type으로 제공해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-012` | 검사결과는 검사명·코드·일시·값·단위·출처 제공 참고범위·출처 표시를 지원해야 한다. | CAPSTONE-P1 |
| `REQ-HHP-013` | MediQ는 검사값으로 정상·비정상·면역·질병 여부를 새로 추론하거나 진단 문구를 생성해서는 안 된다. | CAPSTONE-P1 |
| `REQ-HHP-014` | 합성 영상과 검사정보의 관련 표시는 명시된 Fixture Link만 사용하고 진단·인과관계를 암시하지 않아야 한다. | CAPSTONE-P1 |
| `REQ-HHP-015` | 실제 Provider 전환 시 기관별 항목·코드·단위·최신성 차이를 보존하고 누락값을 추정하지 않아야 한다. | PRODUCTIONIZATION |

---

# 10. Security Requirements

| ID | Control |
|---|---|
| `SEC-HHP-001` | Capstone Build는 allowlisted Mock Provider 외 Provider를 Fail Closed한다. |
| `SEC-HHP-002` | 운영 건강정보 기관 Hostname, Credential, Token, 인증서 또는 Secret을 Repository와 Build에 포함하지 않는다. |
| `SEC-HHP-003` | `TEST-*`, `SYNTHETIC`, `MOCK` Marker 누락 시 Record 표시를 거부한다. |
| `SEC-HHP-004` | Preview Payload를 Analytics, Crash Report 또는 민감 로그에 기록하지 않는다. |
| `SEC-HHP-005` | 실제 Consent·DICOM Grant와 Mock Consent를 결합하거나 승격하지 않는다. |
| `SEC-HHP-006` | Preview Record는 실제 의료진 공유, PACS Import 또는 진료 Workflow에 사용할 수 없다. |
| `SEC-HHP-007` | Preview 초기화 시 Session과 합성 Record Cache를 제거한다. |
| `SEC-HHP-008` | Audit Event는 `DEMO_` Prefix와 `source_mode=SYNTHETIC`을 포함한다. |
| `SEC-HHP-009` | UI Automation과 Screenshot에도 DEMO MODE 표시가 유지되어야 한다. |
| `SEC-HHP-010` | 실제 Provider 구현은 지정심사·법률·보안·OpenAPI 승인 전 활성화할 수 없다. |
| `SEC-HHP-011` | Lab/Antibody Fixture는 실제 환자번호, 실제 기관 OID, 실검사 원문 또는 운영 기관명을 포함하지 않는다. |
| `SEC-HHP-012` | 합성 검사결과를 실제 Consent·Grant·의료진 공유·PACS Import 경로에 전달하지 않는다. |
| `SEC-HHP-013` | 결과값·참고범위·원문 판정은 Analytics, Notification, URL 또는 비민감 로그에 포함하지 않는다. |

---

# 11. Threats and Controls

| Threat ID | Threat | Required Control |
|---|---|---|
| `THR-HHP-001` | 관람자가 실제 지정심사·운영 연계로 오인 | Persistent Banner, 금지 문구 검사, 발표 Disclosure |
| `THR-HHP-002` | Synthetic Record를 실제 환자 기록으로 오인 | Record Badge, TEST Identity, 비진단 고지 |
| `THR-HHP-003` | 잘못된 환경설정으로 운영 Host 호출 | Provider Allowlist, no credential, network deny test |
| `THR-HHP-004` | Mock Consent가 실제 Consent/Grant로 승격 | 별도 State/Action/Audit Namespace |
| `THR-HHP-005` | Fixture에 실제 PHI 혼입 | Fixture lint, allowlisted values, review |
| `THR-HHP-006` | Preview 데이터가 의료진·PACS Workflow로 전달 | share/import action 미제공, route isolation |
| `THR-HHP-007` | 합성 항체검사를 실제 면역·질환 판정으로 오인 | Record별 SYNTHETIC, 출처 원문 표시, 비진단 고지, MediQ 해석 금지 |
| `THR-HHP-008` | 서로 다른 검사법·단위·참고범위를 직접 비교 | 검사별 단위·출처 참고범위 보존, 자동 병합·추정 금지 |
| `THR-HHP-009` | 실제 대학병원 연동으로 오인 | TEST 기관명, 실제 Logo/OID 금지, 운영 연계 미실시 고정 표시 |

---

# 12. Acceptance Tests

| Test ID | Scenario | Expected | Status |
|---|---|---|---|
| `TC-HHP-001` | 모든 Preview 화면 | DEMO MODE와 실제 연계 미완료 문구 표시 | NOT RUN |
| `TC-HHP-002` | 정상 Preview Flow | Synthetic Fixture 목록·상세 표시 | NOT RUN |
| `TC-HHP-003` | `sourceMode` 또는 `providerMode` 변조 | Fail Closed, Record 미표시 | NOT RUN |
| `TC-HHP-004` | 실제 형태 Patient ID Fixture | Fixture 거부 | NOT RUN |
| `TC-HHP-005` | Capstone Build Network 관찰 | 실제 건강정보 기관으로 outbound call 없음 | NOT RUN |
| `TC-HHP-006` | Mock Consent 완료 | 실제 Consent/Grant 상태에 변화 없음 | NOT RUN |
| `TC-HHP-007` | Preview 초기화 | Session·Cache 제거, DEMO Reset Audit | NOT RUN |
| `TC-HHP-008` | 공유·PACS Import 시도 | Action 미제공 또는 명시적 DENY | NOT RUN |
| `TC-HHP-009` | Screenshot·발표 모드 | DEMO MODE 표시가 잘리지 않음 | NOT RUN |
| `TC-HHP-010` | P0 E2E 실행 | Preview 미구현·실패와 무관하게 P0 실행 가능 | NOT RUN |
| `TC-HHP-011` | 건강검진·일반혈액·항체 Fixture 목록 | 세 유형을 구분하고 모든 Card에 SYNTHETIC 표시 | NOT RUN |
| `TC-HHP-012` | 항체검사 상세 | 값·단위·출처 참고범위·합성 원문 판정·비진단 고지 표시 | NOT RUN |
| `TC-HHP-013` | 참고범위·단위 누락 Fixture | 값을 추정하지 않고 `제공되지 않음` 표시 | NOT RUN |
| `TC-HHP-014` | 합성 영상·검사 관련 보기 | 명시된 Link만 표시하고 진단·인과 문구 없음 | NOT RUN |
| `TC-HHP-015` | 검사 공유·PACS Import·실제 기관 Route 시도 | Action 부재 또는 명시적 DENY, 외부 호출 없음 | NOT RUN |

---

# 13. Implementation Tickets

| Ticket | Classification | Description | Dependency | Status |
|---|---|---|---|---|
| `MEDIQ-HHP-001` | CAPSTONE-P1 | Android Preview 화면과 고정 Disclosure | P0 UI baseline | PROPOSED |
| `MEDIQ-HHP-002` | CAPSTONE-P1 | `HealthDataProvider` Port와 Mock Provider | HHP-001 | PROPOSED |
| `MEDIQ-HHP-003` | CAPSTONE-P1 | Versioned Synthetic Fixture와 Validator | HHP-002 | PROPOSED |
| `MEDIQ-HHP-004` | CAPSTONE-P1 | Demo Audit·Reset·Negative Test | HHP-001~003 | PROPOSED |
| `MEDIQ-HHP-005` | CAPSTONE-P1 | UI/Accessibility/No-network Acceptance | HHP-004 | PROPOSED |
| `MEDIQ-HHP-006` | CAPSTONE-P1 | 건강검진·혈액·항체 합성 Fixture와 Patient Web HTML 시연 | HHP-001~003 | PARTIAL — HTML/Fixture only |
| `MEDIQ-HHP-PROD-001` | PRODUCTIONIZATION | 지정심사·테스트베드·법률·공식 API Discovery | Institution decision | PROPOSED |

`PROPOSED`는 구현 승인 또는 완료를 의미하지 않는다. P0 Golden Path와 P0 Security Validation이 우선이다.

---

# 14. Completion Boundary

문서 기준선 완료와 기능 완료를 구분한다.

```text
DOCUMENTED
= Scope + UX + Architecture + Security + Acceptance defined

IMPLEMENTED
= Approved Ticket + UI + Mock Provider + Fixture + Audit code exists

DONE
= TC-HHP-001~015 executed with evidence

PRODUCTION CONNECTED
= Not available in Capstone
```

현재 상태는 `DOCUMENTED — NOT IMPLEMENTED / NOT TESTED`다.
