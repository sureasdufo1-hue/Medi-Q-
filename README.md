# MediQ

> **프로젝트 종료 — 2026-10-08 / FAILED: 일정·전체 P0 제품 완성 목표 미달.**
> 신규 MediQ 개발은 종료하고 선별 기록을 하이패스로 계승합니다. 아래의 구현·PASS·다음 단계 설명은 종료 전 이력입니다.
> [종료·실패 회고](docs/PROJECT-CLOSURE-2026-10-08.md) · [하이패스 계승 기록](<C:/Users/user/Documents/New project/docs/inherited/mediq/README.md>)

Patient-Controlled Medical Imaging Mobility SaaS

MediQ는 Synthetic/Test DICOM 환경에서 환자의 요청 또는 동의를 기반으로 의료영상을 기관 간 조회·다운로드·PACS Import할 수 있도록 하는 캡스톤 Technical MVP입니다.

Hospital PACS는 의료영상의 Source of Record이며, MediQ Cloud에는 영구 PACS나 장기 영상 Archive를 구축하지 않습니다. 승인된 병원 또는 Synthetic Patient의 Cloud Viewer 요청은 MediQ Authorization Gateway를 거쳐 Source PACS의 DICOMweb 데이터를 온디맨드로 전달합니다. 환자 기기에 Export된 영상의 Mobile Vault 열람은 P1입니다.

## 현재 단계

**최신 실행 갱신 (2026-10-01):** `MEDIQ-CON-002`는 권고안과 Acceptance를 먼저 기록한 뒤 scoped PASS했다. `MEDIQ-CON-003`도 `CON-003-DEC-001`, `SEC-CONSENT-005`, API Acceptance 9건을 먼저 기록했고, 현재는 destination-Hospital USER가 `PENDING` Consent를 요청하는 경로를 구현 중이다. 환자 승인·법적 효력·Grant·영상 접근은 미구현이며 제품 P0는 BLOCKED다. 이후 정책 결정도 `PDEC-001`에 따라 권고안·대안·근거·영향·Acceptance를 문서에 먼저 기록하고 정해진 범위에서 진행한다.

**최신 실행 갱신 (2026-09-30):** DB-001~008/GATE-IMP-02, ORG-001~003, DB-009 database privilege/RLS gates 및 PAT-001 runtime repository는 각 승인 범위에서 PASS다. PAT-002-DEC-002도 synthetic same-Hospital internal read-only runtime Acceptance에서 PASS했다: exact 8-column SELECT, verified active USER/Hospital, wrong-Hospital pre-query denial, Tenant C RLS, write denial, pool reset. API regression은 15 files / 305 tests다. PAT-002는 HTTP route, write/admin, workforce role, identity proof 또는 image authorization을 구현하지 않아 Ticket status는 PARTIAL이다. AUT-005는 exact 41-column Study evidence reader를 검증했으며 child binding 부재로 SERIES/INSTANCE는 deny한다. DB-009 overall은 HTTP safe-error, BOLA와 broader business Authorization/Preflight가 남아 PARTIAL이다. 실행한 DB-008 절차는 disposable scratch clean/reset/reapply와 DB-002~007 persistent development DB migration/regression을 모두 수행한다. 현재 local `mediq` migration ledger는 12, runtime column privileges 70이며 `patient_mappings`, `patient_refs`, `actors`는 0행이다. 이 절차를 scratch-only로 간주하지 않는다. Tenant GUC의 same-role 임의 SQL 변경 가능성과 same-Hospital workforce role 부재는 synthetic-P0 잔여 위험으로 기록한다. 권고안·채택 결정은 [정책 결정 로그](docs/POLICY-DECISION-LOG.md), Acceptance와 [구현 기록](docs/implementation/README.md)을 참조한다.

**추가 실행 갱신 (2026-09-30):** `MEDIQ-CON-001` 불변 synthetic P0 ConsentArtifact domain은 8개 Acceptance group/36 focused tests 및 전체 API 269/269에서 PASS다. 이는 Consent 승인·철회·법적 효력, persistence/version allocator, Authorization/Grant 또는 보호 API를 구현·승인하지 않는다.

- Phase: Capstone Technical MVP
- 우선순위: P0 End-to-End 구현
- 데이터: Synthetic / Test / De-identified 데이터만 사용
- Production 배포 및 실제 환자 데이터: 현재 범위 밖

**제출 마감: 2026-10-05.** ENV-002~010 환경 기준선이 Ticket별 범위에서 통과했고, `MEDIQ-DB-001` migration framework도 empty product schema·최소권한·반복 적용 범위에서 검증했습니다. Health-only API·PostgreSQL·Hospital A/B Test Orthanc가 healthy이며, 합성 CT manifest는 A의 Study/Series/3 Instances와 일치하고 B는 비어 있습니다. API는 아직 operational health 전용입니다. 17개 product schema와 grants, Consent/Authorization/Grant, WADO, MediQ 경유 A→B 전송 및 전체 P0 Acceptance는 미완료입니다. 일별 작업은 [프로젝트 점검 및 10월 5일 실행 계획표](docs/P0-EXECUTION-SCHEDULE.md)를 따릅니다. 팀 가용 시간은 미확정이며, P0 완료는 실제 Acceptance 증거로 판정합니다.

## 문서 시작점

정책 선택은 [정책 결정 로그](docs/POLICY-DECISION-LOG.md)에서 채택 권고안, 대안, 근거와 적용 범위를 확인합니다.

개발 착수 시 [P0 개발 착수 가이드](docs/P0-DEVELOPER-BASELINE.md)에서 필수 구현 기준·첫 환경 Ticket·계약 공백·시험 증거 작성법을 확인합니다. 날짜별 작업과 진척은 [실행 계획표](docs/P0-EXECUTION-SCHEDULE.md)에서 관리합니다.

1. [프로젝트 차터](docs/PROJECT-CHARTER.md)
2. [MVP 경계](docs/CAPSTONE-MVP-BOUNDARY.md)
3. [제품 기준선](docs/PRODUCT-BASELINE.md)
4. [요구사항](docs/REQUIREMENTS.md)
5. [보안 요구사항](docs/SECURITY-REQUIREMENTS.md)
6. [도메인 모델](docs/DOMAIN-MODEL.md)
7. [시스템 아키텍처](docs/SYSTEM-ARCHITECTURE.md)
8. [인수 테스트](docs/ACCEPTANCE-TESTS.md)
9. [구현 계획](docs/IMPLEMENTATION-PLAN.md)
10. [Viewer Architecture 개정 프롬프트](docs/VIEWER-ARCHITECTURE-BASELINE-UPDATE-PROMPT.md)
11. [Mobile Security Policy 개정 프롬프트](docs/MOBILE-SECURITY-POLICY-BASELINE-UPDATE-PROMPT.md)
12. [Mobile Security Policy 개정 보고서](docs/MOBILE-SECURITY-POLICY-BASELINE-CHANGE-REPORT.md)
13. [Azure 배포 권고안](docs/AZURE-DEPLOYMENT-RECOMMENDATIONS.md)
14. [기술 스택 의사결정서](docs/TECH-STACK-DECISION.md)
15. [P0 Web UI/UX 명세](docs/P0-WEB-UI-UX-SPEC.md)
16. [DICOM 상호운용성 프로파일](docs/DICOM-INTEROPERABILITY-PROFILE.md)
17. [P1 Mobile Secure Vault UI/UX 명세](docs/MOBILE-UI-UX-SPEC.md)
18. [P1 Mobile Navigation 및 보안 상태 모델](docs/MOBILE-NAVIGATION-AND-STATE-MODEL.md)
19. [P1 Android Application Architecture](docs/MOBILE-APP-ARCHITECTURE.md)
20. [P1 Secure Medical Capsule Format](docs/SECURE-MEDICAL-CAPSULE-FORMAT.md)
21. [P1 Mobile API Contract](docs/MOBILE-API-CONTRACT.md)
22. [P1 Mobile Application 요구사항 정의서](docs/MOBILE-APPLICATION-REQUIREMENTS.md)
23. [P1 QR Handoff 통합 설계](docs/architecture/qr/QR-HANDOFF-OVERVIEW.md)
24. [P1 Mobile 화면설계서](docs/MOBILE-SCREEN-DESIGN-SPEC.md)
25. [SaaS Web Application 화면설계서](docs/SAAS-SCREEN-DESIGN-SPEC.md)
26. [SaaS UI/UX Reference 조사](docs/SAAS-UI-REFERENCE-RESEARCH.md)
27. [SaaS UI/UX Reference Matrix](docs/SAAS-UI-REFERENCE-MATRIX.md)
28. [Reference 기반 SaaS 화면설계 구성 프롬프트](docs/SAAS-REFERENCE-DRIVEN-SCREEN-DESIGN-PROMPT.md)
29. [SaaS UI Design System](docs/SAAS-UI-DESIGN-SYSTEM.md)
30. [SaaS UI 상세 Wireframe Pack](docs/SAAS-UI-WIREFRAME-PACK.md)
31. [SaaS UI Screen Traceability Matrix](docs/SAAS-UI-SCREEN-TRACEABILITY-MATRIX.md)
32. [구현 기록 및 테스트 증거](docs/implementation/README.md)
33. [합성 CT·MRI 이미지 샘플](docs/assets/synthetic-medical-images/README.md)
34. [합성 건강정보 연계 Preview 기준](docs/SYNTHETIC-HEALTH-DATA-PREVIEW.md)
35. [환자 경험 기능 1–9 문서군](docs/patient-experience/README.md)
36. [환자 경험 기능 로드맵](docs/patient-experience/PATIENT-EXPERIENCE-FEATURE-ROADMAP.md)
37. [환자 경험 기능 추적성](docs/patient-experience/PATIENT-EXPERIENCE-TRACEABILITY.md)
38. [환자 경험·건강 Timeline·AI 질문자료 인터랙티브 HTML 목업](docs/mockups/mediq-patient-experience-mockup.html)
39. [합성 건강검진·혈액·항체검사 Fixture](docs/assets/synthetic-health-data/README.md)
40. [환자 편의 확장 명세](docs/patient-experience/PATIENT-CONVENIENCE-EXPANSION-SPEC.md)
41. [외부 LLM 질문자료 안전 명세](docs/patient-experience/EXTERNAL-LLM-QUESTION-PACK-SPEC.md)
42. [합성 환자 설명·질문 준비 RAG 문서군](docs/ai/README.md)
43. [합성 RAG 지식팩 Fixture](docs/assets/synthetic-rag/README.md)
44. [병원 임상업무 편의 기능 P1 명세](docs/hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-P1-SPEC.md)
45. [병원 임상업무 편의 기능 추적성](docs/hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md)

## 초기 디렉터리

```text
docs/              프로젝트 기준 문서와 설계 문서
services/          MediQ 애플리케이션 서비스
  api/             API 및 도메인 애플리케이션
  worker/          DICOM 교환·전송 작업 처리
web/               Web Viewer 및 사용자 화면
infra/             Docker, Orthanc, 로컬 개발 인프라
tests/             통합·보안·E2E 테스트
scripts/           개발 및 검증 자동화 스크립트
data/              로컬 테스트 데이터 위치 (Git 미추적)
```

API, Worker, Web은 root의 npm Workspaces로 관리한다. 현재 package manifest는 저장소 구조와 ESM 경계만 선언하며 애플리케이션 코드·의존성·실행 스크립트는 후속 Ticket에서 추가한다.

## 개발 원칙

- P0 E2E를 P1 Mobile Secure Vault보다 우선한다.
- 실제 환자·병원 운영 데이터와 Credential을 저장하지 않는다.
- DICOM/DICOMweb 표준과 Orthanc Test 환경을 우선 활용한다.
- Consent, Authorization, Tenant Isolation, Audit, Integrity를 초기 설계에 포함한다.
- Legacy Highpass는 참고·재사용 후보일 뿐 Normative Architecture Source가 아니다.
- Hospital PACS를 Browser/Mobile Client에 직접 노출하지 않는다.
- Cloud 영상 Copy는 메모리 또는 TTL 기반 Temporary Processing으로 제한한다.
- `study:view`, `study:download`, `study:pacs-transfer`, `study:mobile-export` 권한을 분리한다.

## 구현 작업과 문서화

MediQ의 코드·설정·Migration·API·Schema·테스트 변경은 `MEDIQ-*` Ticket 단위로 구현과 문서화를 함께 수행합니다.

```text
Ticket
  → 구현 기록 생성
  → 코드·설정 변경
  → 테스트 실행
  → 테스트 증거 기록
  → 관련 기준 문서 동기화
  → 상태 판정
```

새 Ticket 기록 생성:

```powershell
./scripts/new-implementation-record.ps1 `
  -Ticket MEDIQ-XXX-001 `
  -Title "Short implementation title" `
  -Classification CAPSTONE-P0
```

생성되는 기본 문서:

- `docs/implementation/<TICKET>/IMPLEMENTATION-REPORT.md`
- `docs/implementation/<TICKET>/TEST-EVIDENCE.md`

코드가 존재하는 것만으로 완료하지 않습니다. 구현 보고서, 실제 테스트 명령과 결과, 요구사항·보안·Acceptance 추적성이 함께 있어야 Ticket을 `PASS`로 판정할 수 있습니다.

## 시작 전 체크

- [x] Git 기준 커밋 확인 (`e954033`, 2026-09-29 ENV-005 시작 기준)
- [x] 필수 기준 문서 등록 확인 (29/29, 계약 공백·충돌은 실행 계획표 참조)
- [x] 제출 마감일 확정 (2026-10-05, 시각 미확정)
- [ ] 담당자·개인별 가용 시간 배정
- [ ] 충돌 Ticket ID와 P0 API·Acceptance 참조 정리
- [x] PostgreSQL 및 Hospital A Test Orthanc 기동·health 확인
- [x] Hospital B Test Orthanc 기동·health 확인 (ENV-006)
- [x] Synthetic CT DICOM Dataset·manifest 생성 및 Hospital A fixture seed (ENV-007; 제품 전송 아님)
- [x] 로컬 테스트 환경변수 설정 완료 (`.env`는 Git ignore; ENV-005에서 secret 비노출 확인)
- [ ] 선정 스택의 실제 설치·버전 고정·상호운용 검증
- [ ] 첫 번째 보안 검증 포함 PACS Import 수직 슬라이스 실행
