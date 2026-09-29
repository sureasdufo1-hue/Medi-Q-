# MediQ 프로젝트 점검 및 10월 5일 제출 실행 계획표

**작성·점검일:** 2026-09-28 (Asia/Seoul)

**제출 마감:** 2026-10-05 — 사용자 지정, 제출 시각 미확정

**계획 상태:** 개발 착수 — `MEDIQ-ENV-002` workspace, `MEDIQ-ENV-003` Compose config, `MEDIQ-ENV-004` PostgreSQL runtime은 각각 Ticket 범위 PASS; ENV-005~010과 Phase 0 제품 Gate는 미착수

**범위:** CAPSTONE-P0 우선, P1·POST-MVP·PRODUCTIONIZATION은 후속

**점검 기준 커밋:** `4308003d19d929df1828dd162a9c886045d605a3`

**관련 기록:** [기존 구현계획](IMPLEMENTATION-PLAN.md), [저장소 감사](REPOSITORY-BASELINE-AUDIT.md), [개발 현황 보고](MEDIQ-EXECUTIVE-STATUS-REPORT.md), [구현 기록 규칙](implementation/README.md)

**개발 착수 안내:** [P0 개발 착수 가이드](P0-DEVELOPER-BASELINE.md)에서 첫 환경 Ticket의 산출물·완료 기준, 미결정 계약과 시험 기록 작성법을 확인한다. 본 계획표는 일정·담당·진척 관리의 기준으로 유지한다.

## 1. 판단과 일정 전제

현재 문서·정적 HTML 목업·문서화 도구는 존재한다. API/Worker/Web 제품 코드, 프로젝트 Compose, Migration, DICOMweb Adapter, 제품 테스트는 없다. Docker Engine과 Node는 현재 실행 가능하다. 다음 작업은 재현 가능한 로컬 환경과 Synthetic DICOM의 실제 전송 경로를 만드는 것이다.

9월 28일부터 10월 5일까지 날짜 차이는 7일이다. 아래 계획은 그 기간에 P0 완료를 목표로 하는 압축 계획이며 완료 보장이 아니다. 팀원 수·개인별 가용 시간은 아직 확인되지 않았다. 역할별 병렬 작업을 가정하며, 담당자가 겹치거나 작업 시간이 부족하면 당일 재산정한다. 제출일은 유지하되 검증하지 못한 기능을 완료로 표시하지 않는다.

- A: Backend·Domain·DB·Security 담당. B: Infra·DICOM·통합시험 담당. C: Web·Viewer·시연 담당. 모두 **담당자 미배정**이며 3명 확보를 뜻하지 않는다.
- 9월 28일 착수 시 실명과 실제 가용 시간을 배정한다. 각 구현자는 자신의 테스트·문서화를 수행하고, 다른 담당자가 완료 증거를 검토한다.
- 10월 4일은 기능 동결·회귀시험, 10월 5일은 최종 재현·제출에 배정한다. 10월 5일에 신규 기능 개발을 배정하지 않는다.
- 공식 P0에는 PACS Import, 병원 및 Synthetic Patient Cloud Viewer, Download와 보안·증거 검증이 모두 남는다. 이 계획이 요구사항이나 완료조건을 축소하지 않는다.
- 화면 58개는 세분화된 **상태 ID**를 포함한다. 58개의 독립 React 페이지가 필요하다는 의미는 아니다. 업무 화면·컴포넌트를 공유하되 기존 상태·거부 경로와 추적성을 보존한다.

## 2. 9월 28일 현재 점검 결과

| 영역 | 관찰된 사실 | 판정 / 다음 조치 |
|---|---|---|
| Git | 점검 시작 시 작업 트리 clean. 로컬 HEAD·origin/main·`git ls-remote` 원격 main이 모두 `4308003…` | 기준 커밋 확인. GitHub 보호 규칙·복구 시험까지 검증한 것은 아님 |
| 기준 문서 | 현재 AGENTS.md가 열거한 필수 기준 문서 29/29 존재. 승인·제안·참고 상태가 혼재 | 등록 확인. 전체 내용의 무충돌 또는 구현 준비 완료를 뜻하지 않음 |
| 도구 | Docker Client/Server 29.8.0, Compose v5.5.1, Node v24.18.0, npm 11.16.0 실행 확인 | 도구 사용 가능. 프로젝트 환경 구축은 별도 |
| 제품 구현 | API/Worker/Web에는 README와 npm workspace manifest, root lockfile, Postgres/Orthanc Compose 선언 존재. Infra/Tests는 README 단계 | 구조·Compose config만 검사. 제품 코드·container 실행·Migration·CI·제품 테스트 미구현 |
| 기존 산출물 | HTML 목업·합성 JSON/PNG·문서화 스크립트와 해당 기록 존재 | 제품 E2E 구현 증거와 별도로 집계 |
| 영상 Fixture | 자료집의 합성 CT/MRI PNG는 DICOM 적합성 시험용이 아님 | 실제 Synthetic DICOM Fixture·생성/반입 절차·Manifest 필요 |
| P0 API | `OPENAPI.yaml`에 18개 operationId. Consent read/reject, Viewer metadata, 장기 전송 상태·복구 등에 GAP | 연관 코드 작성 전에 계약·상태·테스트를 함께 확정 |
| 완료 증거 | 제품 Unit/Contract/Orthanc/Security/E2E 실행 기록 없음 | 제품 PASS 주장 불가. 과거 감사의 0/10은 요약 역량 10개 기준이며 전체 테스트 수가 아님 |
| 상태 보고 | 과거 보고서에는 commit 없음·옛 Docker 버전이 기록됨 | 이번 현재 상태 주석과 보고서로 갱신. 과거 관찰은 이력으로 보존 |
| 작업 식별자 | ENV-002, DB-001, AUD-001 등의 의미 충돌 | 아래 정리 목록을 기준으로 착수 기록에 정확한 범위를 명시 |

계획 위험은 **매우 높음**이다. 현재 확인한 것은 미구현·계약 공백이며, 구현된 제품의 취약점을 발견했다는 의미는 아니다. 도구 설치 여부만으로 환경·보안·E2E를 PASS 처리하지 않는다.

## 3. 일별 계획표

각 날짜는 KST 기준 목표일이다. 이전 단계의 필수 Gate가 실패하면 후속 완료일을 자동으로 유지하지 않고 남은 작업과 제출 상태를 다시 판단한다. 제품 테스트는 마지막 날에 몰아서 하지 않고 매일 해당 코드와 함께 작성·실행한다.

| 날짜 | 핵심 목표 | A — Backend/보안 | B — Infra/DICOM | C — Web/시연 | 당일 종료 기준 |
|---|---|---|---|---|---|
| **9/28 월** | 착수 기준·환경 | Ticket 충돌 정리, 계약 GAP 우선순위, API scaffold·test issuer/JWT 경계 설계 | 버전 고정, Compose·PostgreSQL·Orthanc A/B, Synthetic CT Fixture 준비 | P0 업무 흐름·화면 상태 매핑, Web scaffold, API 연결 목록 | 담당·가용 시간 확정; clean setup 명령, A/B/DB health 및 seed smoke 증거. 미달이면 9/29 최우선 |
| **9/29 화** | 기술위험 조기 확인 | 최소 Migration·Tenant/Patient seed, 인증 Context, 필요한 계약 개정 | 실제 QIDO/WADO/STOW 기술 Spike, Instance 집합·무결성 비교 방식 검증 | OHIF metadata/session 연동 Spike, 승인된 계약 기반 로그인·Context Shell | DICOM 기술 경로 재현; Consent read/reject·Viewer·전송 복구 계약의 차단 결정 정리. Spike는 제품 E2E PASS가 아님 |
| **9/30 수** | 보안 업무 흐름 | Mapping·Exchange·Consent 요청/승인/철회·Authorization·Grant, Audit writer | Scope별 DICOM Adapter 연결, 잘못된 Tenant/Mapping/Destination의 호출 차단 시험 | 병원 요청 화면·Synthetic Patient 동의 화면·상태 조회 연결 | 정상 권한 발급 + 동의 없음/철회/잘못된 범위·환자·Tenant 거부를 API로 검증 |
| **10/1 목** | **첫 PACS Import E2E** | Preflight·작업 상태·Idempotency·완료 Gate, 감사·출처 연결 | A→MediQ→B 실제 전송, 목적지 재조회·Integrity, 응답 손실 시 재확인 | 전송 확인·진행·실패·결과 불명·완료 표시 | `AT-E2E-003` 및 잘못된 목적지/Mapping 거부 증거. STOW 응답만으로 완료 금지 |
| **10/2 금** | Viewer·Download | ViewerSession·권한 재검증, Download scope·취소·감사, 임시 객체 수명 관리 | Series/Instance/Frame·중단/Timeout, no-store·TTL/purge, TLS·인증서 시험 | 병원·환자 Cloud Viewer, Download, 만료·철회 UI | Viewer/Download 정상 흐름과 VIEW-only 권한 상승 거부; Browser→PACS 직접 호출 0건 |
| **10/3 토** | P0 통합·보안 회귀 | 남은 승인 P0 모델·API·상태 검증, 오류·로그 최소화 | Unit/Contract/Adapter/Integration/Security/E2E, partial STOW·재시작·중복·자원 한계 시험 | 새로고침 복구·오류 경로·접근성, 병원/환자 시연 리허설 | 전체 P0 시험 결과표, 실패·NOT RUN 목록, 재현 명령과 수정 우선순위 |
| **10/4 일** | **기능 동결·제출본 확정** | 치명적 결함 수정 후 영향 범위 재시험, 구현 보고서 정리 | 깨끗한 환경에서 설치·seed·전체 Gate 재실행, 증거 패키지 | 발표·시연 영상·화면 표시와 실제 구현 상태 대조 | P0 PASS 또는 미완료 판정 확정; 재현 가능한 제출 후보와 잔여 위험 명시 |
| **10/5 월** | **최종 재현·제출** | 최종 커밋 기준과 제출 범위 확인 | 동일 후보의 시작·핵심 시연 재확인 | 자료·영상·실행 안내·알려진 한계 확인 후 제출 | 제출 시각 확인, 제출본·증거·미완료 목록 일치. 실제 제출은 사용자 지정 채널·권한에 따라 수행 |

9월 29일 기술 Spike는 격리된 Synthetic/Test 도구에서만 수행한다. 아직 보안 업무 흐름이 없는 기술 Spike를 사용자용 API로 노출하거나 P0 완료로 계산하지 않는다. 첫 제품 전송부터 전체 Mapping·Consent·Authorization·Grant·Preflight 검증을 거친다.

## 4. 작업 묶음·의존성·완료 증거

`PLAN-*`는 이 계획표의 행 식별자이며 새로운 구현 Ticket이 아니다. 구현 기록은 실제 `MEDIQ-*`별로 분리한다. 아래 상태는 작성 시점 상태다.

| 행 | 우선순위 / 목표 | 연결 Ticket·기준 | 선행조건 | 완료 시 남길 증거 | 현재 상태 |
|---|---|---|---|---|---|
| PLAN-00 | 즉시 / 9/28 | `MEDIQ-ENV-001` 현재 점검과 일정·Ticket 정리 | 저장소 읽기 | 점검 명령, 최신 상태, 충돌 목록·가용 시간 | 점검·계획 작성됨; 담당 배정·ID 정리 남음 |
| PLAN-01 | P0 / 9/28 | `MEDIQ-ENV-002~010` 구조·Compose·DB·A/B·seed·config·health·smoke | PLAN-00의 해당 ID 의미 확인 | 고정 버전/lockfile, config 검증, A/B/DB health, 재현 가능한 seed·safe reset 안내 | IN PROGRESS — ENV-002·003 config scoped PASS; ENV-004~010 NOT STARTED |
| PLAN-02 | P0 / 9/29 | `MEDIQ-DCM-001~005`, `MEDIQ-PACS-005~006`, `MEDIQ-INT-001~003`의 조기 Spike | A/B와 Fixture 준비 | SOP Class·Transfer Syntax·UID/count/hash Manifest, multipart·전송·목적지 증거 | NOT STARTED |
| PLAN-03 | P0 / 9/29~30 | `MEDIQ-DB-001~008`, `MEDIQ-ORG-001~003`, `MEDIQ-PAT-001~004` | DB 실행·데이터 계약 | 승인 17-table 기준 Migration, PK/FK/UNIQUE/CHECK/index·Tenant·Mapping 시험 | NOT STARTED |
| PLAN-04 | P0 / 9/29~30 | `MEDIQ-IAM-001~003`, `MEDIQ-AUT-001~004`, `MEDIQ-EXC-001~006`, `MEDIQ-CON-001~008`, `MEDIQ-GRT-001~007` | 최소 스키마·인증/Consent 계약 | Unit/Contract·정상/거부 시험, 위조 Tenant·잘못된 자원·만료/철회 차단 | NOT STARTED |
| PLAN-05 | P0 / 9/30~10/1 | `MEDIQ-IMG-001~003`, `MEDIQ-PACS-001~008`, `MEDIQ-INT-001~004`, `MEDIQ-PROV-001~003`, `MEDIQ-AUD-001~005`, `MEDIQ-TEST-003` | PLAN-02~04와 전송 상태 계약 | Preflight→STOW→목적지 확인→Integrity→Provenance/Audit 전체 증거, `AT-E2E-003` | NOT STARTED |
| PLAN-06 | P0 / 10/2 | `MEDIQ-VIEW-001~010`, `MEDIQ-DWN-001~005`, `MEDIQ-DATA-018`, `MEDIQ-SEC-018`, `MEDIQ-TEST-001~002` | 보안 업무 흐름·Gateway metadata 계약 | 병원/환자 Viewer·Download, session 만료/철회·no-store·TTL/purge·scope 분리 | NOT STARTED |
| PLAN-07 | P0 / 9/28~10/3 | `P0-WEB-UI-UX-SPEC.md` WEB-01~14 및 SaaS의 P0 상태를 해당 API/기능 Ticket에 연결 | 각 화면의 승인 계약·Backend Gate | 실제 API 연결·서버 결과에 따른 UI·브라우저 시험·키보드/오류 경로 | 정적 참고 목업만 존재 |
| PLAN-08 | P0 / 매일, 10/3 집계 | `MEDIQ-SEC-001~015`, `MEDIQ-SEC-018`, `MEDIQ-TEST-001~007` 및 Viewer/Storage 추가 시험 | 시험 대상 코드·환경 | no-consent·invalid-grant·cross-tenant·wrong-destination·invalid-mapping, 무결성·장애·복구 시험 | NOT RUN |
| PLAN-09 | P0 / 10/4~5 | `MEDIQ-REL-001~007` | 전체 필수 시험 결과 수집 | 설치 안내, 고정 버전, Fixture 재현, 결과표·로그 요약·알려진 한계·시연·후보 커밋 | NOT STARTED |

Audit writer와 Correlation ID는 PLAN-04부터 함께 구현한다. 무결성·출처·감사는 전송 완료 판정의 필수 요소이며 마감 직전에 붙이는 부가기능으로 취급하지 않는다. CI는 초기 test runner와 함께 구성하고 작성한 테스트를 누적 실행한다. Scaffold·CI·Web 세부작업이 기존 Ticket 범위를 넘으면 등록 후 구현한다.

## 5. 착수 전에 정리할 충돌과 결정

상세 정의가 있는 `IMPLEMENTATION-PLAN.md` §9~22의 P0 Ticket 의미를 이번 일정의 기본 식별 기준으로 삼는다. 다른 문서의 번호를 조용히 재사용하지 않는다. 아래 항목은 **발견·정리 계획**이며 이 문서 작성만으로 원문 전체의 충돌이 해소된 것은 아니다.

| 항목 | 발견 내용 | 처리 작업 / 기한 |
|---|---|---|
| Ticket ENV-002 | 구현계획에서는 저장소 정렬, 과거 감사에서는 전체 환경 구축 | 9/28: 환경 묶음을 ENV-002~010으로 구분. Compose는 ENV-003, DB는 ENV-004, PACS A/B는 ENV-005/006 |
| Ticket DB-001·AUD-001 | P0 Migration/Audit writer와 후속 RLS/Hash Chain에 같은 ID 사용 | 9/28: P0 최초 정의를 보존. 후속 후보에 충돌 없는 ID를 배정하고 Azure 문서·계획의 참조를 함께 수정 |
| 과거 감사의 묶음 ID | DATA-001/DOMAIN-001/ACCESS-001/TRUST-001, 광의 SEC-001/TEST-001이 상세 계획과 다름 | 9/28: 실제 세부 Ticket으로 매핑. `MEDIQ-TEST-001`은 Viewer E2E이며 전체 시험 Ticket이 아님 |
| DICOM-001 | 기술 문서에서는 Spike, 과거 감사에서는 넓은 Adapter·Preflight 작업 | 9/28~29: Spike 범위와 DCM/PACS Ticket 관계를 명시하고 중복 완료 계산 금지 |
| Acceptance 참조 | SaaS Matrix의 SCR-068은 Integrity에 AT-SEC-020을 연결하지만 Acceptance 원문은 AT-SEC-018이 Integrity, AT-SEC-020이 민감 로그 | 9/29: P0 관련 행부터 실제 시험 제목·요구사항과 대조. ID가 존재한다는 검사만으로 추적성 PASS 금지 |
| Consent·UI API | 상세 GET·거절·목록·Context의 계약 공백 | 9/29: 기존 승인 행위로 충족 가능한지 먼저 판정. 필요한 API는 OpenAPI·요구사항·상태·Acceptance를 함께 개정 후 구현 |
| 전송·복구 | OpenAPI는 완료 결과 응답 중심, 화면은 durable status·RESULT_UNKNOWN·reconcile 요구 | 9/29: 상태 저장·Idempotency·결과 조회·재시작 복구 계약 결정. 필요한 테이블은 Domain/Data/ERD 변경 절차 선행 |
| Viewer·브라우저 인증 | metadata Gateway, Session 전달, BFF cookie vs memory token 등 Open Decision | 9/29: Test Identity와 승인 스택 기준으로 최소 경로 Spike, 토큰·PACS credential 노출 없는 방식 결정 |
| 버전·Fixture | Framework와 Orthanc/plugin exact version·통합 미검증 | 9/28~29: 설치 가능한 호환 버전을 공식 배포 정보로 확인·고정하고 결정서와 다른 선택은 근거 기록 |
| 성능·Integrity | Timeout/size/concurrency 제안값, 원본·목적지 비교 방식 검증 전 | 9/29 첫 증거, 10/3 경계시험. Part 10 재직렬화·Transfer Syntax 차이를 살피고 불일치를 성공으로 덮지 않음 |

계약 결정과 독립적인 로컬 환경 구축·Synthetic Fixture 준비는 병렬 진행할 수 있다. 미승인 API, 상태 전이 또는 보안 우회로 계약 공백을 임시 해결하지 않는다.

## 6. 일정 점검 Gate와 지연 대응

| 점검 시점 | 질문·통과 기준 | 미달 시 조치 |
|---|---|---|
| 9/28 종료 | 담당/가용 시간, A/B/DB·seed가 재현되는가? | 환경·버전·Fixture 문제에 우선 배정. 독립 UI 정적 작업 이외의 제품 통합 완료일 재산정 |
| 9/29 종료 | 실제 DICOM 기술 경로와 핵심 계약 결정이 끝났는가? | 전송·무결성 또는 Viewer 차단점을 최우선 해결. 불가하면 10/5 전체 P0 완료 위험을 즉시 보고 |
| **10/1 종료** | 보안 검증 포함 A→MediQ→B가 실제 완료되는가? | 전체 P0 일정 위험을 재평가. 남은 역량을 핵심 결함에 집중하고 부분 제출 가능성을 보고. 일정상 요구사항을 자동 면제하지 않음 |
| **10/3 종료** | 모든 P0 기능·보안·장애 시험의 실제 결과가 있는가? | 10/4는 실패 수정·재시험에만 사용. 미실행/실패 항목과 영향 범위를 제출본에 명시 |
| 10/4 종료 | 깨끗한 환경에서 같은 결과가 재현되는가? | 재현 실패 원인과 실행 가능한 범위를 기록. P0 PASS 표기 보류 |
| 10/5 제출 전 | 제출본과 증거의 commit/config/fixture가 같은가? | 서로 다른 버전의 화면·영상·테스트 증거를 한 완료본으로 묶지 않음 |

부분 제출은 일정상 산출물 전달 방식이며 P0 완료 승인과 다르다. 제출 상태는 `검증된 기능`, `구현됐으나 미검증`, `미구현`, `계획·목업`으로 구분한다. 핵심 경로가 동작해도 필수 Gate가 남으면 P0 PASS를 주장하지 않는다. 실행 실패는 FAIL, 환경 때문에 시험 불가이면 BLOCKED로 기록하고, 전체 결과 설명에 실패/미실행 항목을 남긴다.

## 7. 10월 5일 제출 체크리스트

| 산출물 | 담당 역할 | 완료 판정 |
|---|---|---|
| 실행 코드·환경 설정·고정 의존성 | A+B+C | 제출 후보 커밋과 실제 시험 대상 일치 |
| 실행·초기화·합성 데이터 준비 안내 | B | 새 환경에서 재현. 실제 환자 데이터·Secret·런타임 DICOM을 Git에 넣지 않음 |
| 병원 요청→환자 승인→전송 시연 | A+C | UI 결과와 실제 Backend·Hospital B 증거 일치 |
| 병원·환자 Cloud Viewer 및 Download | A+B+C | 해당 권한·세션·만료/철회·직접 접근 거부 시험 포함 |
| 보안·Integrity·Provenance·Audit 결과표 | A+B | 실제 명령·종료 코드·예상/실제 결과·commit/config/fixture·NOT RUN 사유 기록 |
| Ticket별 구현 보고서·시험 증거 | 각 구현자 | `implementation/<TICKET>/IMPLEMENTATION-REPORT.md`, `TEST-EVIDENCE.md`와 색인 동기화 |
| 발표 자료·시연 영상·알려진 한계 | C, 전체 검토 | 합성 데이터 고지, 제품/목업 구분, P0/P1 상태와 실제 결과 일치 |
| 제출 시각·형식·채널 | 프로젝트 책임자, 미배정 | 10/5 전 확인. 본 계획이 업로드·메일 발송 완료를 의미하지 않음 |

`AT-E2E-001~003`, 관련 `AT-SEC-*`, `AT-E2E-004~007`, `AT-DICOM-*`, `AT-AUD-*`, `AT-PROV-001`, `TC-VIEW-004~009`, `TC-SEC-VIEW-001~003`, `TC-DATA-004/005`, `TC-SCOPE-004`를 기본 확인 집합으로 사용한다. 최종 판정은 [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md)의 전체 적용 P0 Gate와 [DICOM 프로파일](DICOM-INTEROPERABILITY-PROFILE.md)을 기준으로 한다. 이 목록만으로 필수 시험을 줄이지 않는다.

## 8. 제출 이후 순서

| 순서 | 작업 | 진입 조건 |
|---|---|---|
| 1 | 남은 P0 실패·NOT RUN 해소 | 제출본의 실제 결과에 따라 먼저 수행 |
| 2 | P1 Android Secure Vault·Capsule·Mobile API | P0 E2E 및 보안 PASS, 기기·암호 상호운용 Gate |
| 3 | QR Handoff | Mobile/Backend 계약, Claim·환자 승인·Grant 분리 시험 |
| 4 | 환자·병원 편의 기능, 합성 건강정보·질문 준비 RAG | 해당 P1 의존성과 개별 Acceptance 충족 |
| 5 | Azure 또는 AWS 배포 프로파일 | 로컬 P0 PASS 후 별도 선택·비용·배포·연결 ADR; 현재 AWS 권고안은 승인 기준을 자동 대체하지 않음 |
| 6 | 실제 병원·건강정보 제공기관 연계 | PRODUCTIONIZATION Gate 및 해당 외부 협의 |

기존 P1 문서·목업은 참고자료로 보존한다. 10월 5일 일정에 새 P1 기능 구현을 배정하지 않는다.

## 9. 운영 방식과 이번 점검의 증거

매일 시작 시 담당·오늘 Gate·차단사항을 갱신하고, 종료 시 아래 형식으로 기록한다. 진행률은 문서 수나 작성한 코드 줄 수로 계산하지 않는다. 확정된 Acceptance 집합의 PASS/FAIL/NOT RUN 개수와 근거를 보고한다.

| 날짜 | Ticket/담당 | 구현 결과 | 실행 명령·결과 링크 | 미실행·실패·위험 | 다음 작업 |
|---|---|---|---|---|---|
| 2026-09-28 | MEDIQ-ENV-001 점검 / 계획 문서 작업 | 현재 점검과 제출 계획 등록 | 본 절과 Repository Audit 현재 상태 | 제품 코드·계약 정리·팀 가용 시간 미확정 | ENV-002~010 및 계약 차단점 정리 |
| 2026-09-28 | MEDIQ-ENV-002 | API·Worker·Web npm workspace와 lockfile 정렬 | [구현 보고서](implementation/MEDIQ-ENV-002/IMPLEMENTATION-REPORT.md) · [시험 증거](implementation/MEDIQ-ENV-002/TEST-EVIDENCE.md) | 서비스 코드·Compose·DB·PACS 미구현, 전체 Phase 0 미검증 | ENV-003 Docker Compose baseline |
| 2026-09-28 | MEDIQ-ENV-003 | Postgres/Orthanc Compose 정의 및 loopback·network·volume config 검사 | [구현 보고서](implementation/MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md) · [시험 증거](implementation/MEDIQ-ENV-003/TEST-EVIDENCE.md) | container startup·health·PACS capability 미검증; 기존 Docker 서비스는 건드리지 않음 | ENV-004 PostgreSQL container startup/health |
| 2026-09-28 | MEDIQ-ENV-004 | Postgres 18.6 기동·healthcheck·restart·내부 network 인증 연결 검증; internal DB의 동작하지 않는 host port 선언 제거 | [구현 보고서](implementation/MEDIQ-ENV-004/IMPLEMENTATION-REPORT.md) · [시험 증거](implementation/MEDIQ-ENV-004/TEST-EVIDENCE.md) | Schema/Migration·host-run API profile·Orthanc DICOMweb·제품 시험 미실행 | ENV-005 Hospital A Test Orthanc |

이번 읽기 전용 점검에서 다음을 실제 실행했다. 프로젝트 Runtime을 생성하거나 환자자료·PACS 운영 Endpoint에 접근하지 않았다.

```powershell
git status --short --branch
git log -1 --format="%h %s"
git rev-parse HEAD origin/main
git ls-remote --heads origin main
Get-ChildItem services,web,infra,tests -Recurse -File
git ls-files '*AGENTS.md' '*package*.json' '*lock*' '*compose*' '*.ts' '*.sql' '*.kt' '.github/*'
docker version --format '{{json .}}'
docker compose version
node --version
npm --version
docker ps -a --filter label=com.docker.compose.project=mediq --format '{{.Names}}|{{.Status}}'
```

Git·버전·파일 조회 명령은 실행 성공했다. `mediq` Compose label 조회는 결과 0건이며, 다른 이름으로 실행 중인 별도 환경까지 없다고 단정하지 않는다. 문서의 링크·Ticket·Acceptance 참조는 읽기 전용으로 대조했다. 전체 문서의 형식·의미 검증, Dependency 설치, 제품 Unit/Contract/Integration/Security/E2E는 이번 작업에서 실행하지 않았다.

이번 작업은 점검·계획 문서 작성이므로 별도 구현 Ticket 기록 의무의 예외에 해당한다. 실제 코드·설정·API·Schema 변경에 착수하면 해당 Ticket별 두 기록 파일을 먼저 생성한다. 문서 검사 결과는 제품 시험 결과와 분리한다.

## 10. 문서 검증 및 변경 보고

2026-09-28 문서 검증 결과:

- `git diff --check`: 종료 코드 0. 신규 파일은 별도로 후행 공백 검사 통과.
- 변경 문서 5개에서 상대 로컬 링크 59개 확인, 깨진 대상 0개. Anchor 의미·외부 링크 검증은 제외.
- §4의 Ticket 범위를 확장해 127개 고유 ID를 기존 구현계획과 대조, 누락 0개. 이는 ID 존재 검사이며 Ticket 간 의미 충돌 해소 또는 완료를 뜻하지 않는다.
- 9/28 월요일부터 10/5 월요일까지 일별 표의 날짜·요일과 사용자 지정 마감일 대조 통과.
- 핵심 시험 제목 대조에서 기존 SaaS 추적표의 Integrity 참조 오류를 확인하여 §5에 후속 작업으로 등록.

```text
Ticket: MEDIQ-ENV-001 후속 읽기 전용 점검 + 사용자 요청 실행 계획 문서
Scope: 2026-10-05 제출을 위한 현재 상태·일별 작업·의존성·완료 증거
Changed: 실행 계획표 신규, README·구현계획·감사 현재 주석·개발 현황 보고 동기화
Not changed: 제품 코드·설정·API·Schema·승인 P0 완료조건; commit/push 미수행
Security impact: 보안 불변조건 유지, 검증 전 PASS 및 사용자용 보안 우회 금지
Tests executed: Git/파일/도구 점검, 문서 공백·링크·날짜·Ticket 참조 검사
Tests not executed: 제품 Unit/Contract/Integration/Security/E2E — 구현·환경 부재
Evidence: 본 문서 §2·§9·§10과 Repository Audit §0
Implementation record: 문서·점검 작업 예외 적용; 코드 착수부터 Ticket별 기록 필수
Remaining risks: 팀 가용 시간 미확정, 계약·ID 정리 필요, 7일 내 전체 P0 일정 위험 매우 높음
Status: PASS — 요청된 점검·계획 문서 범위 / 제품 P0 Readiness: BLOCKED
```
