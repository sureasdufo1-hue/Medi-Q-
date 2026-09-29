# MEDIQ-ENV-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-004` |
| 제목 | PostgreSQL container startup and health |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-28` |
| 결과 | `PASS` — PostgreSQL 환경 Ticket 범위만 |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows host, PowerShell |
| Runtime·Toolchain | Docker Engine 29.8.0; Docker Compose v5.5.1; digest-pinned PostgreSQL 18.6-bookworm |
| 대상 환경 | Local Docker Compose; `mediq` project |
| 데이터 | Synthetic/Test only; 제품 fixture·PHI 없음 |
| 실행 시각 | 2026-09-28 18:54 KST 최종 상태 확인 |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| ENV004-01 | Compose health 설정·internal-only DB boundary | Config/Security | 올바른 identity의 `pg_isready`; Postgres host port 없음; A/B 선언 port는 loopback | `.env.example` 및 ignored `.env`에서 config·validator 모두 통과 | `PASS` |
| ENV004-02 | 실제 PostgreSQL startup/readiness | Integration | pinned image로 기동하고 health가 `healthy` | `mediq-postgres-1` `running|healthy`; digest 일치 | `PASS` |
| ENV004-03 | 다른 Compose peer의 DB 접속 | Integration/Security | internal DNS `postgres:5432`에서 password 인증과 `SELECT 1` 성공 | 별도 임시 client container가 DB network에서 결과 `1` 반환 | `PASS` |
| ENV004-04 | 재시작 회복 | Reliability | restart 후 health 회복 및 SQL 재접속 | `restart` 후 Compose wait `Healthy`, `SELECT 1` 결과 `1` | `PASS` |
| ENV004-05 | 격리·상태 보존 | Security/Data | Postgres host binding 없음; 재생성/재시작 동안 volume 유지 | runtime binding null/없음, `mediq_postgres-data:/var/lib/postgresql` 유지 | `PASS` |
| ENV004-06 | 로컬 Secret 취급·patch hygiene | Security/Static | `.env` ignored, diff check 통과, 값 출력 없음 | `git check-ignore` 확인; `git diff --check` 종료 코드 0 (기존 LF→CRLF 안내만) | `PASS` |
| ENV004-07 | 실행된 server version | Runtime | 승인한 PostgreSQL 18 계열 image/runtime 사용 | SQL `SHOW server_version` → `18.6 (Debian 18.6-1.pgdg12+2)`; inspected image digest 일치 | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Compose 선언과 boundary 검사

- 실행 일시: 2026-09-28 KST
- 목적: example 및 local env에서 config 해석, healthcheck·network·port·volume 규칙 확인
- 명령:

```powershell
docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
docker compose --env-file .env -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1 -EnvFile .env
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: `PASS: Compose syntax, pinned images, PostgreSQL readiness and internal-only boundary, service networks, loopback-published Orthanc ports, and isolated volumes.`
- 판정: `PASS`

### TEST-002 — 기동·health·network peer 인증

- 실행 일시: 2026-09-28 KST
- 목적: Postgres만 시작하고 별도 임시 container에서 service DNS와 password-authenticated query 확인
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --force-recreate --wait --wait-timeout 90 postgres
# .env에서 DB 사용자/암호/DB 이름을 현재 PowerShell process env로 안전하게 주입
docker run --rm --network mediq_database --env MEDIQ_POSTGRES_USER --env MEDIQ_POSTGRES_PASSWORD --env MEDIQ_POSTGRES_DB --entrypoint sh postgres:18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650 -ec 'PGPASSWORD="$MEDIQ_POSTGRES_PASSWORD" psql -h postgres -U "$MEDIQ_POSTGRES_USER" -d "$MEDIQ_POSTGRES_DB" -v ON_ERROR_STOP=1 -Atqc "SELECT 1;"'
```

- 종료 코드: `0`
- 핵심 결과: Compose가 Postgres를 `Healthy`로 판정; 별도 peer client의 query 결과 `1`; password 값은 출력·증거에 포함하지 않음.
- 판정: `PASS`

### TEST-003 — restart·health·SQL 재확인

- 실행 일시: 2026-09-28 KST
- 목적: container restart 후 readiness와 인증 연결 확인
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml restart postgres
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait --wait-timeout 60 postgres
docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atqc "SELECT 1;"'
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: Restart 후 `Healthy`; SQL 결과 `1`; volume 이름·mount 경로가 유지됨.
- 판정: `PASS`

### TEST-004 — 실제 host binding 부재·원인 확인

- 실행 일시: 2026-09-28 KST
- 목적: Compose의 config상 선언과 runtime host mapping을 구분
- 명령:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 15432 -InformationLevel Quiet
docker inspect --format '{{json .NetworkSettings.Ports}}' mediq-postgres-1
docker inspect --format '{{.State.Status}}|{{.State.Health.Status}}|{{json .NetworkSettings.Ports}}' mediq-postgres-1
docker compose --env-file .env -f infra/docker-compose.yml ps postgres
git check-ignore -v .env
git diff --check
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: 초기 misconfigured runtime은 `Test-NetConnection` 결과 `False`, network ports `{"5432/tcp":[]}`였다. 설정을 제거한 뒤 runtime은 `running|healthy|{"5432/tcp":null}`; `ps`에는 `5432/tcp`만 표시되고 host mapping은 없음; `.env`가 `.gitignore` 규칙에 의해 제외됨.
- 발견·조치: 초기 Compose config에는 `127.0.0.1:15432`가 있었지만 `internal: true` network runtime에서는 host port listener/binding이 생성되지 않았다. `Test-NetConnection 127.0.0.1:15432`도 실패했다. 이 설정을 그대로 성공 처리하지 않고 Postgres port declaration을 제거한 뒤 internal peer 경로로 재시험했다.
- 판정: `PASS` — 교정된 internal-only Compose 기준; 초기 host-port 선언은 구현 결함으로 수정.

### TEST-005 — 실제 DB server version

- 실행 일시: 2026-09-28 KST
- 목적: manifest tag만이 아니라 실행중인 PostgreSQL의 server version을 SQL로 확인
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atqc "SHOW server_version;"'
```

- 종료 코드: `0`
- 핵심 결과: `18.6 (Debian 18.6-1.pgdg12+2)`; image reference digest는 Compose 선언과 일치.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| N/A | Consent·Grant·tenant·destination 거부 | 제품 request/영상 접근이 없는 DB environment ticket이라 적용되지 않음 | `NOT APPLICABLE` |
| ENV004-DIAG-01 | internal DB host port 도달성 | 초기 선언 상태에서 TCP reachability와 runtime host binding 부재 발견; port 공개 제거 후 내부 peer 연결 PASS | `FIXED; RETESTED` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Host에서 실행하는 Node API→DB 접속 | app config loader 및 실행 위치가 아직 없고 `localhost`/container DNS profile은 ENV-008 범위 | Host-run profile 미확정 | ENV-008에서 개발 실행 방식과 최소 권한 네트워크를 선택·검증 |
| schema·Migration·ORM contract | DB schema Ticket 미착수 | DB 기능 데이터 model 미검증 | DB-001~008에서 승인 Data/ERD와 연결 |
| Orthanc A/B health·DICOMweb/host port runtime | 본 Ticket 범위 밖 | internal+publish 조합의 실제 reachability 미검증 | ENV-005/006에서 host mapping을 runtime 증거 없이 가정하지 말 것 |
| backup/restore·volume recovery·성능/보안 강화 | 본 Ticket 범위 밖 | persistence 복구·운영 준비 미검증 | 별도 승인된 DB/productionization scope |
| Phase 0 API/PACS E2E와 security Acceptance | 제품 API·Orthanc·fixture 미착수 | 제품 Golden Path 미검증 | 후속 ENV-005~010 및 기능 Ticket |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Compose, health, peer SQL 결과 요약 | 이 문서 ENV004-01~06 | 실제 SQL은 `SELECT 1`; Secret·PHI 없음 |
| runtime image/health/mount/port state | `mediq-postgres-1`, `mediq_postgres-data` | 식별자만 기록, secret·payload 없음 |
| local credentials | root `.env` (ignored, untracked) | random test-only; 값 미출력·미기록; `.gitignore` 확인 |

## 7. 결론

- 결과: `PASS` — PostgreSQL startup/readiness, internal peer authenticated SQL, restart, volume continuity 및 host-port isolation.
- PASS 범위: `MEDIQ-ENV-004` DB runtime만. DB schema, API, Orthanc, DICOM workflow, product Security/Integration/E2E 또는 Phase 0 전체 PASS가 아니다.
- 다른 Docker Compose project는 시작·중지·변경하지 않았다. `mediq-postgres-1`과 `mediq_postgres-data`는 다음 Ticket용으로 유지 중이다.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
