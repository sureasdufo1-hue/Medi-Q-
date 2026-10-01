# MediQ 개발 현황 및 제출 계획 보고서

**보고일:** 2026-10-02

**제출 마감:** 2026-10-05 (사용자 지정, 시각 미확정)

**현재 단계:** DB schema/RLS/least-privilege와 IAM·Consent·Grant 등 여러 내부 업무 sub-gate가 scoped Acceptance를 통과했다. `MEDIQ-INT-001`은 hash 및 operation-bound `SOURCE_CAPTURE/PENDING` 저장 기초까지 추가 검증됐다. 전체 PACS Import coordinator, authorized source capture, 목적지 전송·검증, Viewer/Download 및 A→B 제품 E2E는 미완료.

**현재 판정:** `CAPSTONE TECHNICAL READINESS = BLOCKED`

**최신 진행 갱신 (2026-10-02):** API regression은 33 files/571 tests, hash builder 12/12, source-evidence repository 6/6, API typecheck, Drizzle migration check, migration runner 6/6, DICOM Port contract 및 DB-008 full clean/reset/reapply와 DB-002~007 regressions가 통과했다. DB-008 확인치는 18 product tables, migration ledger 22, catalog `18|50|17|40`; DB test 중 임시 12-column SELECT/INSERT 권한을 회수하고 persistent runtime privilege 209개로 복원했다. 이 검증은 `SOURCE_CAPTURE/PENDING`의 내부 저장 기초만 PASS하며, PACS에서 권한을 확인해 영상을 가져와 저장했다는 증거는 아니다. 아직 실제 product STOW를 실행하지 않았다.

**진행률 추정:** P0 전체 약 **45%**, 기반/준비도 약 **65%**, 종단간 A→MediQ→B 영상 교환 약 **25~30%**로 추정한다. 이는 일정 예측용 정성 추정치이며 Acceptance case 수로 계산한 객관적 완료율은 아니다. 환경·DB·보안 업무의 여러 토대는 있으나 가장 중요한 실제 보호된 전송·목적지 검증·Viewer/E2E Gate가 열려 있어 전체 기술 준비도는 계속 `BLOCKED`다.

**현재 남은 핵심 차단점:** Authorized source QIDO/WADO capture와 operation-time 재인가/Consent/Grant/PatientMapping binding, atomic Audit·Provenance 통합, complete Mandatory Preflight/coordinator, product no-STOW 및 Hospital B unchanged 거부 증거, 실제 STOW와 destination verification/integrity completion gate, Viewer/Download 및 전체 `AT-SEC-012`/`AT-E2E-003`가 미완료다. 이때까지 PACS와 네트워크를 통한 제품 전송 성공을 주장할 수 없다.

**최신 Ticket 갱신 (2026-10-01):** `MEDIQ-CON-006`은 권고안·보안 경계·5 Acceptance를 먼저 기록한 뒤 pure P0 action policy 범위에서 scoped PASS했다. API regression 20 files/373 tests, typecheck 및 patch whitespace 검사를 통과했다. `MOBILE_EXPORT` mixed Consent evidence, invalid/duplicate actions, mismatched/P1/extra scopes는 deny되며 DB/API/Grant/PACS 변경은 없다. 이전 `MEDIQ-CON-005` checkpoint에서 signed synthetic OIDC/JWKS HTTP→PostgreSQL/RLS withdrawal, atomic Audit, replay/concurrency/rollback, exact 126 grants 및 local ledger=16을 검증했다. 이 두 Ticket은 legal consent/identity, Grant issuance/enforcement, HTTP BOLA, remote recall 또는 제품 A→MediQ→B E2E를 입증하지 않는다. 전체 P0 및 기술 준비 판정은 계속 BLOCKED다.

**추가 Ticket 갱신 (2026-09-30):** `MEDIQ-CON-001` 불변 synthetic P0 Consent domain은 36 focused tests 및 API 269/269에서 scoped PASS다. Consent 승인/철회 workflow, 법적 효력, DB persistence/version concurrency, Authorization/Grant 및 보호 API는 여전히 미완료다.

**이전 Ticket 갱신 (2026-10-01, CON-002 checkpoint):** `MEDIQ-CON-002` synthetic PENDING persistence/versioning은 `TC-CON-002-DB-001~007` 범위에서 PASS다. 당시 API regression 20 files/355 tests와 typecheck, DB-008 scratch plus DB-002~007 regression, concurrent version allocation, Tenant RLS, atomic rollback 및 temporary privilege 120→100 복원을 검증했다. 영구 Consent grant/API/migration은 추가하지 않았다. 이는 Consent의 환자 승인·법적 효력이나 영상 Authorization이 아니다; 최신 CON-005/006 판정을 위에서 따른다.

**PAT-004 최신 갱신 (2026-09-30):** 권고안 `PAT-004-DEC-001`과 Acceptance를 먼저 문서화한 뒤 mocked persistence-to-domain Acceptance 7/7, 전체 API regression 17 files / 330 tests를 통과했다. `MEDIQ-PAT-004`는 Ticket 범위에서 PASS지만 live PostgreSQL/RLS, 목적지 조회·인가, HTTP API, `AT-SEC-012` PACS no-STOW는 미실행이다. PatientMapping/PACS 전체 요구사항은 여전히 PARTIAL이며 기술 시연 E2E는 BLOCKED다.

## 이전 스냅샷 — 2026-10-01

**최신 진행 갱신 (2026-10-01):** DB-001~008 schema, DB-009 least-privilege/RLS, ORG-001~003 seed, PAT-001~004 scoped slices, IAM-001/002, AUT-001~005, CON-001~006는 각각 한정 Acceptance를 통과했다. `MEDIQ-CON-006` pure policy는 P0 Consent action allowlist와 exact Action/Grant Scope mapping을 검증했다; prior `MEDIQ-CON-005` evidence는 signed OIDC/JWKS HTTP→PostgreSQL/RLS withdrawal을 입증한다. local `mediq` migration ledger는 16, runtime column inventory는 126이다. DB-008 clean/reset/reapply는 disposable DB, DB-002~007 migration/regression은 persistent development DB에서 실행했으며 후자는 pending migration을 적용했고 테스트 fixture는 rollback됐다. 이 좁은 Acceptance들은 legal identity/consent, Grant issuance/enforcement, HTTP BOLA, Viewer/Download, WADO/STOW payload, PACS Import no-STOW 또는 제품 A→B transfer의 PASS를 뜻하지 않는다. DB-009 overall 및 P0 readiness는 각각 PARTIAL/BLOCKED다. 권고안과 근거는 [정책 결정 로그](POLICY-DECISION-LOG.md)에 기록한다.

MediQ는 환자 동의 범위 안에서 병원 A의 영상을 병원 B가 열람·다운로드·PACS 반입하도록 중계하는 시스템이다. PostgreSQL/Test Orthanc A/B readiness와 합성 CT fixture 및 DB/RLS 기초를 검증했다. PatientMapping·Exchange·Consent synthetic technical API slice가 일부 구현됐으나 Consent API는 real identity/legal consent나 Grant를 부여하지 않는다. HTTP object/action Authorization 전체, Integrity/Provenance enforcement, WADO/STOW payload, Viewer/Download/PACS import와 MediQ 경유 A→B product transfer는 아직 완료·검증되지 않았다.

| 영역 | 현재 상태 (2026-10-01) |
|---|---|
| Git | 기준 커밋 `e954033` 기준으로 시작; ENV-005~008 및 상태문서 작업분은 현재 작업트리에 있고 아직 커밋되지 않음 |
| 개발 도구 | Docker Engine·Compose·Node·npm 실행 가능 |
| 문서·목업 | 필수 문서 존재, 정적 목업·문서화 스크립트 기록 존재 |
| 환경·제품 구현 | PostgreSQL 18.6, Hospital A/B Orthanc core 1.13.0, health-only API `healthy`; synthetic CT fixture/manifest, A QIDO 1/1/3 UID match, B empty 확인; ENV-008 config/role boundary와 ENV-009/010 PASS. Schema·authorization 내부 adapter 일부는 구현됐으나 product business API/Worker/Web flow 없음 |
| 현재 개발 DB | Latest DB-008+regression run: local `mediq` migration ledger 16; runtime column privileges 126. DB-002~007 regression applies pending migrations to persistent development DB; it is not reset by disposable scratch cleanup |
| P0 검증 | 제품 테스트·실제 A→MediQ→B 전송 증거 없음 |
| 남은 차단점 | Product API/Worker·schema/migration·WADO·A→B 제품 경로, Consent/Viewer/전송 상태 API 공백, 일부 시험 참조 오류 |

## 10월 5일까지의 실행 계획

| 일정 | 핵심 산출물·완료 기준 |
|---|---|
| 9/28 | 담당·가용 시간 배정, Ticket 정리, Test Orthanc A/B·PostgreSQL·Synthetic CT 환경 구성 |
| 9/29 | Hospital A/B readiness 완료; Synthetic CT fixture와 QIDO/WADO/STOW 기술 검증 진행 |
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

**이전 Ticket:** `MEDIQ-PAT-003`는 권고안 `PAT-003-DEC-001`과 Acceptance를 먼저 문서화한 뒤 pure-domain destination mapping validator를 구현했다. Exact Patient/Hospital binding, 단일 후보, `VALID`+`validatedAt`, missing/ambiguous/mismatch/unverified/revoked/malformed deny와 외부 호출 부재를 18개 focused tests로 확인했고 당시 API regression은 16 files / 323 tests였다. Ticket은 PARTIAL: authorized destination retrieval, HTTP route, PACS Preflight 및 STOW no-call은 미검증이다. `MEDIQ-EXC-002`의 live repository/RLS는 이후 DEC-002 scratch-only Acceptance로 통과했으나 business Authorization/API 및 permanent runtime privilege는 여전히 차단이다. DB-009 overall은 API safe errors와 business Authorization 부재로 PARTIAL이며 제품 경로는 차단 상태다.

**최근 Ticket:** `MEDIQ-PAT-004`는 권고안 `PAT-004-DEC-001`을 먼저 기록하고 mocked persistence-to-domain 거부 경계를 7/7, API regression 17 files / 330 tests로 통과했다. Ticket 자체는 이 mock-only scope에서 PASS다. 목적지 권한 조회, 실제 DB/RLS, HTTP 응답 및 PACS no-STOW는 검증되지 않았으며 다음 단계도 별도 권고안과 전제조건 검토 뒤 진행한다.

**현재 Ticket:** `MEDIQ-EXC-002`는 `EXC-002-DEC-002`와 Acceptance를 먼저 기록한 뒤 실제 PostgreSQL Repository create/read, Source/Destination Tenant RLS, unrelated/no-context 거부, rollback 및 pool cleanup을 disposable scratch에서 3회 통과했다. 임시 11-column SELECT/INSERT 권한은 매회 회수되어 persistent privilege baseline 70개로 복원됐다. DB-008 reset/reapply와 DB-002~007 regressions도 통과했다. 이는 Session 업무 Authorization, API, 영구 runtime privilege 또는 전체 Exchange E2E를 검증하지 않으며 `GATE-IMP-04`는 NOT EXECUTED다.
