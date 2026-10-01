# MEDIQ-PAT-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-003` |
| 제목 | Synthetic destination PatientMapping domain validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 상태 | `PARTIAL` — Domain-only Acceptance passed; product integration remains pending |

## 1. 목표

서버에서 해석된 PatientReference·Destination Hospital binding과 합성 PatientMapping 후보를 비교하는 순수 Domain validator를 구현한다. 정확히 한 개의 binding 일치 mapping만 `VALID`로 판정하며, mapping 판정은 전체 PACS Import 인가로 오인되지 않게 한다.

## 2. 범위

### 포함

- 순수·결정적 목적지 mapping 판정 함수
- missing, multiple/ambiguous, binding mismatch, UNVERIFIED, REVOKED, invalid input/object의 fail-closed 결과
- `VALID`와 존재하는 `validatedAt`을 함께 요구
- 성공 시 내부 mapping reference만 반환하고 `localPatientId`는 결과에서 제외
- Acceptance, policy decision 및 구현·테스트 증거 동기화

### 제외

- DB 조회/권한, cross-Hospital reader, mapping write/validation workflow
- HTTP route/OpenAPI/AppModule wiring, Consent/Authorization/Grant evaluation
- PACS Import, Mandatory Preflight, Orthanc/STOW-RS 또는 external side effect

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `REQ-PAT-003/004` | 목적지 mapping binding 및 invalid mapping deny | `TC-PAT-003-DOM-001~008` |
| 보안 | `SEC-IAM-007~009`, `THR-018` | fail-closed mapping eligibility; broader PACS denial is still pending | Domain tests; `AT-SEC-012` not run |
| API·도메인 | `PAT-003-DEC-001`, `INV-PAT-004~007` | Pure domain only; exact server-resolved binding | `patient-mapping-validation.test.mjs` |
| Acceptance | `AT-FUNC-003`, `AT-SEC-012` | Domain-only pass separated from future PACS no-STOW gate | `TEST-EVIDENCE.md` |

## 4. 구현 결과

`validateDestinationPatientMapping`은 입력/context 형식, 후보 개수, mapping의 `patientRefId`·`hospitalId`, 상태 및 `validatedAt`을 검사한다. 모든 잘못된 입력, 비일치 또는 미검증 상태는 고정 reason의 `DENY`로 끝나며 예외를 외부로 전파하지 않는다. 성공 결과는 `{ kind: "VALID", mappingId }`만 포함하고, mapping 판정이 Import 권한이 아니라는 주석과 문서 경계를 둔다.

Focused Acceptance 17개와 API 전체 회귀 322개가 통과했다. 이 코드는 Domain 전용이며 저장소 조회·HTTP·DB·Audit·PACS 호출이 없다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `services/api/src/patient/domain/patient-mapping-validation.ts` | Pure destination mapping validator |
| `tests/api/patient-mapping-validation.test.mjs` | Positive/negative domain Acceptance |
| `docs/POLICY-DECISION-LOG.md` 및 관련 기준 문서 | PAT-003 recommendation/decision and Acceptance boundary |
| `docs/implementation/README.md` | Ticket status index |

## 6. 영향 분석

### Architecture

- Pure Domain evaluator만 추가하며 HTTP module/provider에 연결하지 않는다.

### API·Data

- No database query, schema, privilege or persistent data change.

### Security·Privacy

- Synthetic fixture only. Tenant authority is not created or inferred.
- Mapping decision is not Consent/Authorization/Grant and has no Audit/PACS/Orthanc/STOW side effect.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: Domain validator Acceptance 18/18 및 API regression 323/323 PASS; 전체 PatientMapping/PACS 기능은 `PARTIAL`

## 8. 변경하지 않은 사항

- Destination runtime retrieval, PACS Import denial/no-STOW, API exposure, local Patient ID return, identity proof and all real patient data remain outside this Ticket.

## 9. 결정 및 예외

- Adopted under `PAT-003-DEC-001` in `docs/POLICY-DECISION-LOG.md` per standing recommendation-first instruction.

## 10. 잔여 위험과 후속 작업

- 현재 결과는 caller가 실제로 권한 있는 server-resolved mapping을 제공하는지 확인하지 않는다. 실제 목적지 retrieval/authentication, Preflight binding 및 PACS no-STOW는 후속 integration Gate에서 검증해야 한다.
- 현행 unique constraint는 같은 Hospital/PatientReference 중복행을 차단하므로 DB상 복수 후보는 통상적인 fixture로 만들 수 없다. Domain validator는 복수 후보 입력을 거부하며, repository 오류·HTTP 응답·PACS side effect는 별도 시험 대상이다.

## 11. 최종 판정

```text
Ticket: MEDIQ-PAT-003
Scope: Synthetic pure-domain destination mapping validation
Changed: Fail-closed exact Patient/Hospital binding, candidate cardinality, approved status and validation evidence checks; policy/requirements/Acceptance/implementation records
Not changed: DB reader/grants, mapping writes, HTTP/OpenAPI, Consent/Authorization/Grant, PACS Import/Preflight/Orthanc/STOW
Security impact: Eligibility only; does not authorize PACS Import; success result excludes Local Patient ID
Tests executed: `npm run build:api`; focused 18 tests; `npm run test:api` (16 files / 323 tests)
Tests not executed: DB, HTTP/BOLA, destination runtime retrieval, `AT-SEC-012` PACS no-STOW, DICOM/PACS E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md and `PAT-003-DEC-001`
Remaining risks: No wired caller proves destination mapping source/authority; no product PACS denial path exists
Status: PARTIAL
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-30 | `PARTIAL` | Domain-only validator와 18 focused/323 regression tests 통과; DB/API/PACS integration은 후속 게이트 |
