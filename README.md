# MediQ

Patient-Controlled Medical Imaging Mobility SaaS

MediQ는 Synthetic/Test DICOM 환경에서 환자의 요청 또는 동의를 기반으로 의료영상을 기관 간 조회·다운로드·PACS Import할 수 있도록 하는 캡스톤 Technical MVP입니다.

Hospital PACS는 의료영상의 Source of Record이며, MediQ Cloud에는 영구 PACS나 장기 영상 Archive를 구축하지 않습니다. 승인된 병원 또는 Synthetic Patient의 Cloud Viewer 요청은 MediQ Authorization Gateway를 거쳐 Source PACS의 DICOMweb 데이터를 온디맨드로 전달합니다. 환자 기기에 Export된 영상의 Mobile Vault 열람은 P1입니다.

## 현재 단계

- Phase: Capstone Technical MVP
- 우선순위: P0 End-to-End 구현
- 데이터: Synthetic / Test / De-identified 데이터만 사용
- Production 배포 및 실제 환자 데이터: 현재 범위 밖

## 문서 시작점

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

- [ ] 문서 기준선 승인
- [ ] Docker 및 Test Orthanc 실행 확인
- [ ] Synthetic DICOM Dataset 준비
- [ ] 로컬 환경변수 설정 (`.env.example` 참고)
- [ ] API/Web/Worker 기술 스택 확정
- [ ] 첫 번째 P0 수직 슬라이스 정의
