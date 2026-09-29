# MEDIQ-ENV-004 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-004` |
| 제목 | PostgreSQL container startup and health |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-28` |
| 상태 | `PASS` — DB 환경 범위만 |

## 1. 목표

고정된 PostgreSQL 18.6 Test/Development container가 재현 가능하게 기동되고, readiness·인증 연결·재시작을 검증한다. 이 Ticket은 database schema·Migration이나 Phase 0 제품 Gate를 완료하지 않는다.

## 2. 범위

### 포함

- Compose Postgres readiness healthcheck 추가 (`pg_isready`, 설정된 사용자·DB)
- Postgres를 internal-only `database` network 안에서 기동하고 readiness 확인
- 별도 peer container에서 Compose DNS `postgres:5432`를 통한 password-authenticated `SELECT 1` 확인
- restart 후 health와 SQL 연결 재확인, persistent volume 유지 확인
- `internal: true`와 host port publish를 함께 선언한 기존 구성이 실제로 host binding을 만들지 않는 점을 교정
- `.env.example`과 Infra 안내의 container-to-container DB/DICOM endpoint 기준 동기화

### 제외

- DB schema, Migration, ORM, API·Worker·Web 코드
- PostgreSQL backup/restore·고가용성·운영 보안/성능 보증
- Hospital A/B Orthanc 기동 및 DICOMweb 시험 (ENV-005/006)
- Host에서 실행하는 API가 DB에 연결하는 최종 profile (ENV-008)
- 실제 환자정보·운영 PACS·Production credential

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `P0-DEVELOPER-BASELINE.md` §5; `IMPLEMENTATION-PLAN.md` §9의 `MEDIQ-ENV-004` | DB 기동·health·재시작·연결을 schema 작업과 분리 | Compose healthcheck, runtime inspection, authenticated SQL |
| 보안 | `AGENTS.md` §§4, 8; `SECURITY-REQUIREMENTS.md`; `THREAT-MODEL.md` | synthetic/test-only, fail-closed config, 최소 노출, secret 비기록 | internal network, host port 제거, ignored `.env`, 별도 peer 인증 |
| API·도메인 | `SYSTEM-ARCHITECTURE.md`; `DATA-MODEL.md`; `ERD.md` | 제품 API·Domain·schema 변경 없음 | PostgreSQL connectivity만 검증; migration 실행 안 함 |
| Acceptance | `IMPLEMENTATION-PLAN.md` Phase 0 Gate; `ACCEPTANCE-TESTS.md` | DB readiness는 전체 API/PACS/E2E gate가 아님 | ENV-004만 PASS; Phase 0 계속 NOT RUN/BLOCKED |

## 4. 구현 결과

- `infra/docker-compose.yml`의 PostgreSQL healthcheck가 container 안에서 `pg_isready`를 설정된 DB 사용자·이름으로 실행한다.
- digest-pinned `postgres:18.6-bookworm` image를 pull해 `mediq-postgres-1`로 기동했고, 시작 시와 재시작 후 모두 `healthy`임을 확인했다.
- 별도 임시 PostgreSQL client container가 `mediq_database` network에서 service DNS `postgres`를 해석하고 password-authenticated `SELECT 1`에 성공했다.
- Runtime에서 기존 Compose의 Postgres host-port 선언이 실제 binding을 만들지 않는 것을 확인했다. Docker 문서의 internal network 경계와 일치하도록 DB host port를 제거해 의도된 internal-only 경계를 명시했다. 재생성 전후 `mediq_postgres-data:/var/lib/postgresql` volume이 동일함을 확인했다.
- `.env.example`의 DB/Orthanc URL은 Compose service DNS를 사용하도록 갱신했다. ignored root `.env`는 이번 workstation에서 생성한 test-only random credentials를 포함하고 Git ignore 여부를 확인했다. 값은 보고서·명령 출력·Git 변경에 기록하지 않았다.
- 현재 DB service는 실행 상태로 유지한다. Orthanc A/B는 시작하지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `infra/docker-compose.yml` | PostgreSQL readiness healthcheck 추가, host port mapping 제거 |
| `scripts/validate-compose-baseline.ps1` | `pg_isready` 설정과 Postgres host port 비공개 검증 추가, null port config 처리 |
| `.env.example` | DB·Orthanc URL을 Compose service DNS 기준으로 수정, DB host-port placeholder 제거 |
| `infra/README.md` | Postgres 실행·health·인증 연결 명령, internal endpoint 및 ENV-008 경계 추가 |
| `docs/implementation/MEDIQ-ENV-003/*` | 이전 loopback config 결과가 runtime reachability 증거가 아님을 후속 메모로 추가 |
| `README.md`; `docs/P0-DEVELOPER-BASELINE.md`; `docs/P0-EXECUTION-SCHEDULE.md`; `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md`; `docs/REPOSITORY-BASELINE-AUDIT.md`; `docs/TECH-STACK-DECISION.md`; `docs/implementation/README.md` | 실제 상태·다음 ticket·scope-limited PASS를 동기화 |
| `docs/implementation/MEDIQ-ENV-004/*` | 이번 Ticket의 구현·시험 근거 |

## 6. 영향 분석

### Architecture

- PostgreSQL은 `database` internal network에만 연결되며 Compose peer는 `postgres:5432`를 사용한다. Host 실행 API의 endpoint profile은 ENV-008에서 정한다.
- Orthanc A/B와 API/Worker 연결 구조는 이번 Ticket에서 runtime 검증하지 않았다.

### API·Data

- API, Domain, schema, table, index, constraint, Migration 변경 없음. 데이터는 synthetic/test용 빈 DB 초기 상태다.

### Security·Privacy

- Postgres host port를 열지 않아 internal DB 경계를 유지한다. 임시 peer client와 local `.env` 외부로 password를 출력·문서화하지 않았다.
- 실제 PHI, DICOM, production credential은 취급하지 않았다. 제품 Consent·Authorization·Grant·Audit 통제는 이번 기반환경 시험 범위 밖이다.

## 7. 실행 및 검증 요약

- 상세 명령·실제 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: PostgreSQL startup, healthcheck, isolated-network authenticated SQL, restart, volume continuity 및 no-host-publish 경계는 `PASS`.
- `PASS`는 `MEDIQ-ENV-004` DB runtime 범위에 한정된다. API connectivity, schema/Migration, Orthanc, DICOM, 제품 보안·Acceptance는 포함하지 않는다.

## 8. 변경하지 않은 사항

- Orthanc A/B 기동·DICOMweb capability·실제 host publish 도달성
- database schema·Migration·API/Worker·제품 기능/테스트
- user data가 포함된 volume reset, 삭제 또는 초기화
- 다른 Docker Compose project/container/network/volume

## 9. 결정 및 예외

- `internal: true` network는 호스트 network interface에 연결되지 않는다. Compose config에서 host port가 선언된 것만으로 실제 접근을 증명할 수 없어 Postgres port를 공개하지 않기로 했다. 근거: [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) 및 [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/).
- `.env.example`의 `postgres`와 `orthanc-a/b` DNS 주소는 Compose network 내부 application container 기준이다. Host에서 실행하는 API를 위한 대체 연결 방식·최소 권한 경계는 ENV-008에서 승인·시험해야 한다.
- 사용자 제공 보안 기준이나 제품 데이터 정책의 변경은 없다.

## 10. 잔여 위험과 후속 작업

- API가 아직 없어 실제 애플리케이션 connection pool·retry·TLS·migration은 검증되지 않았다.
- Host-run app profile이 미결정이다. `.env.example`의 service DNS는 host 자체에서 자동 resolve되지 않으므로 ENV-008에서 실행 위치에 맞는 URL/경계를 결정해야 한다.
- Orthanc A/B 역시 internal network에 loopback publish가 선언되어 있다. Postgres runtime에서 드러난 차이와 유사한 host reachability 문제가 없는지 ENV-005/006에서 runtime 검증 전이며, 현 config를 runtime 접근성 증거로 취급하지 않는다.
- 백업/복구, 데이터 보존기간, schema 무결성, DB 사용자 분리·운영 secret 관리가 남아 있다.

## 11. 최종 판정

```text
Ticket: MEDIQ-ENV-004
Scope: CAPSTONE-P0 local PostgreSQL startup, readiness, isolated-network connection, restart
Changed: pg_isready healthcheck; Postgres host-port removal; validator, endpoint guidance, scoped status/evidence docs
Not changed: schema/migration, API/Worker, Orthanc runtime, PACS workflow, Phase 0 Acceptance
Security impact: DB remains internal-only; local test secrets ignored and not reported; no PHI/production credential
Tests executed: Compose config/validator, startup/health, peer-container authenticated SQL, restart/recheck, volume continuity, no host publish, git ignore/diff checks — PASS in ticket scope
Tests not executed: host-run API profile, migrations, backup/restore, Orthanc DICOMweb, product tests and Phase 0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: ENV-008 must establish app execution profile; ENV-005/006 must verify Orthanc network reachability/capability
Status: PASS (MEDIQ-ENV-004 runtime scope only; Phase 0 remains NOT RUN/BLOCKED)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-28 | `PASS` | Postgres 18.6 기동·health·restart·peer 인증 연결, internal-only 경계 검증 및 기록 |
