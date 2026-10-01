# MEDIQ-ENV-005 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-005` |
| 제목 | Hospital A Test Orthanc runtime and DICOMweb readiness |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-29` |
| 결과 | `PASS` — ENV-005 scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows host, PowerShell; Docker Desktop Linux containers |
| Runtime·Toolchain | Docker Engine 29.8.0; Compose v5.5.1; Orthanc Team 26.9.1 digest; Orthanc core 1.13.0; pinned Node 24 Alpine probe image |
| 대상 환경 | Local Docker Compose project `mediq`; isolated `hospital-a` network |
| 데이터 | Empty Orthanc store; no PHI or DICOM payload |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| ENV005-01 | Compose configuration and A readiness policy | Config | Pinned image, isolated network, aliveness healthcheck, no A host port | Validator passed; normalized config matched assertions | `PASS` |
| ENV005-02 | Orthanc process readiness | Runtime | Compose reports A healthy; vendor aliveness probe succeeds | A running/healthy after recreation; `/probes/test-aliveness.py` exit 0 | `PASS` |
| ENV005-03 | HTTP auth and DICOMweb boundary | Integration/Security | No credentials and invalid credentials rejected; valid credentials can query QIDO | 401 / 401 / 200; `dicom-web` loaded; QIDO returned `application/dicom+json`, 0 studies | `PASS` |
| ENV005-04 | PACS network isolation | Security/Network | No host-published A port; peer on `hospital-a` reaches `orthanc-a:8042` | A host bindings empty; authenticated peer request succeeded | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Compose config and topology

- 실행 일시: 2026-09-29 KST
- 목적: Compose 구문·A healthcheck·network 경계·port 비공개 assertion 재현
- 명령:

```powershell
docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: Pinned services, A aliveness probe, A no-host-port, DB readiness, isolated networks/volumes assertions 통과.
- 판정: `PASS`

### TEST-002 — Pull, startup and readiness

- 실행 일시: 2026-09-29 KST
- 목적: 승인 digest로 Hospital A만 기동하고 readiness 확인
- 명령:

```powershell
docker pull --quiet orthancteam/orthanc:26.9.1@sha256:d2705f2c56547e55ce9bc2250fd22d05d326493b3f3d9fa191ecb7db8ca6b5a2
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait --wait-timeout 120 orthanc-a
docker compose --env-file .env -f infra/docker-compose.yml ps -a
docker exec mediq-orthanc-a-1 python3 /probes/test-aliveness.py
```

- 종료 코드: pull, Compose startup/wait, probe `0`
- 핵심 결과: `mediq-orthanc-a-1` `running|healthy`; PostgreSQL remains `running|healthy`; Orthanc core reports `1.13.0`, AET `MEDIQA`.
- 판정: `PASS`

### TEST-003 — Repeatable auth and DICOMweb probe

- 실행 일시: 2026-09-29 KST
- 목적: 로컬 ignored `.env`의 A test credentials를 출력하지 않고, 동일 Docker service network의 pinned Node peer에서 HTTP auth·plugin·QIDO 확인
- 명령:

```powershell
./scripts/test-orthanc-a.ps1
```

- 종료 코드: `0`
- 핵심 결과: unauthenticated QIDO `401`, invalid password `401`, authenticated `/system` `200`, `dicom-web` plugin loaded, authenticated QIDO `200 application/dicom+json`, empty-store Study count `0`. Secret은 probe stdin으로만 전달했고 출력하지 않음.
- 판정: `PASS`

### TEST-004 — Host binding diagnostic and config correction

- 실행 일시: 2026-09-29 KST
- 목적: 기존 loopback host port 선언이 실제로 bind되었는지 확인하고, 결과에 따라 A 경계를 교정
- 진단 명령:

```powershell
docker inspect --format '{{.State.Status}}|{{json .NetworkSettings.Ports}}' mediq-orthanc-a-1
$orthancIp = docker inspect --format '{{(index .NetworkSettings.Networks "mediq_hospital-a").IPAddress}}' mediq-orthanc-a-1
Test-NetConnection -ComputerName $orthancIp -Port 8042 -InformationLevel Quiet
```

- 관찰: 실제 `NetworkSettings.Ports`에는 `4242/tcp`·`8042/tcp`의 host binding이 없었고, host에서 container IP의 8042 접속도 실패했다. 이 Docker 환경의 관찰을 일반 규칙으로 확대하지 않는다.
- 조치: A `ports`와 미사용 A host-port placeholders 제거; service remains reachable from a container on `hospital-a` network.
- 재검증: TEST-001~003 재실행 PASS.
- 판정: `PASS` after correction

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| ENV005-SEC-01 | DICOMweb without credentials | QIDO 요청 | HTTP `401` | `PASS` |
| ENV005-SEC-02 | DICOMweb with invalid password | QIDO 요청 | HTTP `401` | `PASS` |

이 Ticket의 적용 가능한 거부 경로는 인증 없는 요청과 잘못된 암호 요청이며, 결과는 ENV005-SEC-01/02에 기록했다. Consent, Authorization, Grant 및 Tenant 거부는 제품 코드가 아직 없어 이 환경 Ticket 범위에 해당하지 않는다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Fixture-backed QIDO/WADO and DICOM payload retrieval | No Synthetic DICOM fixture yet; ENV-007 prerequisite | QIDO metadata semantics and WADO payload compatibility unknown | ENV-007 then DICOM Integration tickets |
| STOW-RS and Hospital B verification | ENV-006 and fixture not complete | No transfer path evidence | ENV-006/007 then PACS Integration |
| Application connectivity and TLS certificate validation | API/Worker profile not yet configured; local test uses HTTP | Does not meet end-to-end TLS Security Acceptance | ENV-008 and security/DICOM tickets |
| Full P0 Acceptance/E2E | Product API, mapping, consent, authorization and grants not implemented | Capstone remains BLOCKED | Subsequent P0 tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Orthanc startup/auth/QIDO summary | This file and command output | No secret, patient metadata, or DICOM payload |
| Repeatable probe | `scripts/test-orthanc-a.ps1` | Reads only local ignored `.env`; never prints credentials |

## 7. 결론

- 결과: `PASS` — Hospital A runtime readiness, auth boundary, DICOMweb plugin and empty-store QIDO only.
- PASS를 주장할 수 있는 범위: `MEDIQ-ENV-005`. DICOM object retrieval/transfer, application security and Phase 0 are not PASS.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
