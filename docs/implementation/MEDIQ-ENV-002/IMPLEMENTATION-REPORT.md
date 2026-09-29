# MEDIQ-ENV-002 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-002` |
| 제목 | Repository structure alignment |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-28` |
| 상태 | `PASS` — Ticket scope only |

## 1. 목표

기존 저장소 경계를 기준으로 API, Worker, Web을 npm 11 Workspaces에서 식별 가능한 private ESM 패키지로 연결하고, Node.js 24/npm 11 기준 및 재현 가능한 lockfile을 둔다. 이는 저장소 구조 작업이며 실행 가능한 제품 서비스 구현을 의미하지 않는다.

## 2. 범위

### 포함

- Root `package.json`과 npm workspace lockfile
- `services/api`, `services/worker`, `web` 각각의 최소 package manifest
- 기존 경로·책임 경계를 설명하는 저장소 안내 갱신
- workspace 해석 및 무의존성 `npm ci` 검증

### 제외

- NestJS/Fastify, React/Vite, OHIF 또는 기타 런타임 의존성 설치·코드 scaffold
- Docker Compose, PostgreSQL, Orthanc, 앱 설정, health check, DICOM fixture
- API/Domain/Data/OpenAPI/보안 행위 및 제품 Acceptance 결과

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `P0-DEVELOPER-BASELINE.md` §4–5; `TECH-STACK-DECISION.md` §1, TS-ADR-001 | Node 24/npm 11 Workspaces와 기존 API·Worker·Web 경계 정렬 | package manifest/lockfile 및 npm workspace 검사 |
| 보안 | `AGENTS.md` §4, §8; `SECURITY-REQUIREMENTS.md` §6 | 비밀값·실데이터를 manifest/lockfile에 넣지 않고 제품 보안 통제를 이 변경에서 약화하지 않음 | lockfile 의존성/manifest에 secret이나 신규 dependency가 없는지 점검 |
| API·도메인 | `OPENAPI.yaml`; `DOMAIN-MODEL.md`; `SYSTEM-ARCHITECTURE.md` | 업무 계약·도메인·시스템 구조 변경 없음 | 관련 파일 diff가 없음을 확인 |
| Acceptance | `IMPLEMENTATION-PLAN.md` §9 Phase 0 Gate; `P0-DEVELOPER-BASELINE.md` §5 | 이 Ticket은 Gate 전체를 완료하지 않음. 구조 정렬 자체를 별도 npm 검사로 확인 | workspace 목록 확인 및 `npm ci` 성공; Phase 0 제품 Gate는 후속 ENV Ticket |

## 4. 구현 결과

Root npm manifest가 기존 API·Worker·Web을 private ESM workspace로 등록한다. Node 24/npm 11 engine 범위와 현재 검증된 npm 11.16.0 package-manager pin을 명시했고, 세 workspace 경로가 포함된 lockfile을 생성했다. 애플리케이션 dependency·script는 아직 없다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `package.json`, `package-lock.json` | Node/npm 조건, root workspace 선언, workspace 링크 lockfile |
| `services/api/package.json`, `services/worker/package.json`, `web/package.json` | private ESM workspace manifests |
| `README.md` | workspace 선언의 현재 범위와 미구현 상태 안내 |
| `docs/implementation/README.md` | Ticket 색인과 scoped 결과 동기화 |
| `docs/P0-EXECUTION-SCHEDULE.md` | PLAN-01 및 개발 착수 상태 갱신 |
| `docs/P0-DEVELOPER-BASELINE.md`, `docs/REPOSITORY-BASELINE-AUDIT.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md` | 현재 scaffold와 제품 미구현 상태 동기화 |
| `docs/TECH-STACK-DECISION.md` | workspace scaffold 상태와 미구현 앱 stack 구분 |
| `docs/implementation/MEDIQ-ENV-002/*` | 구현 보고서·실행 증거 |

## 6. 영향 분석

### Architecture

- API/Worker/Web 경로만 npm workspace package로 선언한다. 런타임 구조·배포 경계는 변경하지 않는다.

### API·Data

- API 계약, Domain 모델, DB schema와 제품 동작 변경 없음.

### Security·Privacy

- Tenant, Consent, Authorization, Grant, Audit 행위 변경 없음. Secret/PHI/운영 DICOM 또는 런타임 dependency를 추가하지 않는다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: workspace 구조·오프라인 clean install 확인. 전체 Phase 0 Gate와 제품 기능은 미검증.

## 8. 변경하지 않은 사항

- 승인된 stack 버전 선택, API·Worker·Web 구현, DB·PACS 환경, 제품 보안 및 P0 E2E는 후속 Ticket에 남긴다.

## 9. 결정 및 예외

- `TECH-STACK-DECISION.md`가 승인한 Node 24/npm 11 Workspaces만 적용하며 신규 dependency나 package script는 이 구조 Ticket에 추가하지 않는다.

## 10. 잔여 위험과 후속 작업

- npm이 lockfile을 검증하지만 애플리케이션 호환성은 아직 검증하지 않는다. ENV-003부터 환경 scaffold와 호환성 시험을 계속한다.

## 11. 최종 판정

```text
Ticket: MEDIQ-ENV-002
Scope: CAPSTONE-P0 저장소 패키지 경계 정렬
Changed: Root 및 API/Worker/Web workspace manifests, npm lockfile, 관련 안내·상태 문서와 이 Ticket 기록
Not changed: 제품 API/Domain/UI 코드, 의존성, DB/PACS/Compose, 계약·보안 동작
Security impact: 신규 dependency·script·credential·PHI 없음; 제품 보안 통제 변경 없음
Tests executed: TEST-001 workspace discovery, TEST-002 offline lockfile install, TEST-003 manifest boundary/diff check — 모두 scoped PASS
Tests not executed: Phase 0 DB/Orthanc/API health, product security, integration, E2E (후속 Ticket)
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: 앱 stack 호환성 및 Phase 0 환경·기능 미검증
Status: PASS (MEDIQ-ENV-002 scope only; Phase 0 remains NOT RUN)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-28 | `PASS` | API·Worker·Web npm workspace/lockfile 정렬 및 구조 검증 완료; 애플리케이션 기능은 범위 밖 |
