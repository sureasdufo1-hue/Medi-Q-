# MediQ 개발 현황 및 제출 계획 보고서

**보고일:** 2026-09-28

**제출 마감:** 2026-10-05 (사용자 지정, 시각 미확정)

**현재 단계:** P0 로컬 DB 환경 구성 / PostgreSQL 검증 완료, Orthanc·제품 서비스 미실행

**현재 판정:** `CAPSTONE TECHNICAL READINESS = BLOCKED`

## 현재 상황

MediQ는 환자 동의를 바탕으로 병원 A의 영상을 병원 B가 열람·다운로드·PACS 반입하도록 중계하는 시스템이다. 목표와 보안 기준, 화면 목업은 준비되어 있다. npm workspace와 PostgreSQL/Test Orthanc Compose 구성을 만들었고 PostgreSQL은 healthcheck·재시작·내부망 인증 연결을 검증했다. Orthanc, DB schema/migration, 제품 코드·제품 테스트는 아직 없어 실제 의료영상 교환 검증은 시작 전이다.

| 영역 | 9월 28일 확인 결과 |
|---|---|
| Git | 기준 커밋 `4308003` 존재, 원격 main 일치. 점검 시작 시 clean |
| 개발 도구 | Docker Engine·Compose·Node·npm 실행 가능 |
| 문서·목업 | 필수 문서 존재, 정적 목업·문서화 스크립트 기록 존재 |
| 환경·제품 구현 | Node/npm workspace·Compose config, PostgreSQL 18.6 running/healthy. Orthanc 미기동, Migration·API/Worker/Web 제품 코드 없음 |
| P0 검증 | 제품 테스트·실제 A→MediQ→B 전송 증거 없음 |
| 계획 차단점 | Ticket 의미 중복, Consent/Viewer/전송 상태 API 공백, 일부 시험 참조 오류 |

## 10월 5일까지의 실행 계획

| 일정 | 핵심 산출물·완료 기준 |
|---|---|
| 9/28 | 담당·가용 시간 배정, Ticket 정리, Test Orthanc A/B·PostgreSQL·Synthetic CT 환경 구성 |
| 9/29 | QIDO/WADO/STOW·무결성 기술 Spike, 핵심 API 계약·버전 결정 |
| 9/30 | Patient Mapping·Exchange·Consent·Authorization·Grant 및 거부 경로 검증 |
| 10/1 | 보안 검증 포함 첫 PACS Import E2E, 목적지 확인·Integrity·Provenance·Audit |
| 10/2 | 병원·Synthetic Patient Cloud Viewer, Download, 권한·만료/철회 검증 |
| 10/3 | P0 전체 통합·보안·장애·복구 시험과 시연 리허설 |
| 10/4 | 기능 동결, 결함 수정·재시험, 깨끗한 환경 재현·제출 후보 확정 |
| 10/5 | 동일 제출 후보의 최종 재현, 자료·증거·한계 확인 및 제출 |

팀원 수·가용 시간은 미확정이며 위 일정은 역할별 병렬 작업을 전제로 한 압축 목표다. 현 상태에서 전체 P0를 7일 안에 검증해야 하므로 일정 위험이 매우 높다. 10월 1일 핵심 E2E, 10월 3일 전체 시험을 중간 점검점으로 삼고 실패/미실행 항목을 매일 보고한다.

## 완료 판정과 우선순위

P0는 Viewer·Download·PACS Import와 관련 보안·증거 Gate를 실제로 통과해야 완료다. STOW 성공 응답 또는 목업 화면만으로 완료를 주장하지 않는다. 미달 시 제출물에 검증된 기능·미검증·미구현·계획을 구분하고 P0 PASS 표기를 보류한다.

Mobile Vault·QR·RAG·환자/병원 편의 확장·클라우드 배포는 후속으로 유지한다. 첫 실행은 상세 계획의 `MEDIQ-ENV-002~010` 환경 묶음이며, Compose 자체는 `MEDIQ-ENV-003`이다. 코드·설정 작업은 Ticket별 구현 보고서와 실제 테스트 증거를 같은 작업에서 남긴다.

**상세 근거:** [실행 계획표](P0-EXECUTION-SCHEDULE.md) · [현재 감사 상태](REPOSITORY-BASELINE-AUDIT.md) · [구현 기록](implementation/README.md)
