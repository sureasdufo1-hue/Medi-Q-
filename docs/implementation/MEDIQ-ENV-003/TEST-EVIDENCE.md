# MEDIQ-ENV-003 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-003` |
| 제목 | P0 Docker Compose baseline |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-28` |
| 결과 | `PASS` — Compose config scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / Docker Desktop |
| Runtime·Toolchain | Docker `29.8.0`, Compose `v5.5.1` |
| 대상 환경 | Compose config validation only; containers/images not started/pulled |
| 데이터 | `.env.example` placeholder 설정; 환자 데이터 없음 |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| ENV003-01 | Compose 파일 구문·필수 변수 | Config | 정상 설정 시 `config --quiet` 성공, required variable 누락 시 실패 | 둘 다 예상한 동작; 정상 0, 누락 config nonzero | `PASS` |
| ENV003-02 | Service/image/network/volume 선언 | Static/config | PostgreSQL·Orthanc A/B, digest pins와 분리 경계 | 3 service, 3 internal network, 3 named volume 확인 | `PASS` |
| ENV003-03 | 외부 노출 최소화 | Security/config | publish가 127.0.0.1에 한정되고 service network가 분리·internal | repeatable validator에서 모든 조건 통과 | `PASS` |
| ENV003-04 | Image identity | Registry metadata | 승인 major version image tag와 multi-arch manifest digest 기록 | Postgres/Orthanc registry manifest 조회 종료 코드 0 | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Compose config and topology validation

- 실행 일시: 2026-09-28 17:39~17:43 KST
- 목적: Compose 문법, 서비스/이미지, 네트워크·volume 연결 및 loopback bind 검사
- 명령:

```powershell
docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
docker compose --env-file .env.example -f infra/docker-compose.yml config --services
docker compose --env-file .env.example -f infra/docker-compose.yml config --images
docker compose --env-file .env.example -f infra/docker-compose.yml config --networks
docker compose --env-file .env.example -f infra/docker-compose.yml config --volumes
git diff --check
```

- 종료 코드: 0 (각 명령)
- 핵심 결과: `postgres`, `orthanc-a`, `orthanc-b`; 3 digest-pinned image references; `database`, `hospital-a`, `hospital-b`; 3 isolated named volumes. Validator는 loopback-only publish와 service network 분리를 PASS. Git diff check 통과; LF→CRLF 경고만 있었음.
- 판정: `PASS`

### TEST-002 — Missing required configuration rejection

- 실행 일시: 2026-09-28 17:38 KST
- 목적: 로컬 `.env`/필수 변수 누락 시 Compose가 fail-closed하는지 확인 (`.env` 파일은 생성하지 않음)
- 명령:

```powershell
docker compose -f infra/docker-compose.yml config --quiet
if ($LASTEXITCODE -eq 0) { Write-Output 'FAIL'; exit 1 }
Write-Output 'PASS: required variables rejected'; exit 0
```

- 종료 코드: wrapper 0; inner Compose config는 expected nonzero
- 핵심 결과: `ORTHANC_A_PASSWORD`, `ORTHANC_B_PASSWORD`, `MEDIQ_POSTGRES_*` 누락 메시지를 내고 구성을 거부함. 민감 값은 출력되지 않음.
- 판정: `PASS`

### TEST-003 — Registry manifest digest inspection

- 실행 일시: 2026-09-28 17:34 KST
- 목적: 설정에 고정할 multi-architecture image manifest identities 조회 (image pull은 하지 않음)
- 명령:

```powershell
docker buildx imagetools inspect postgres:18.6-bookworm
docker buildx imagetools inspect orthancteam/orthanc:26.9.1
```

- 종료 코드: 0 (두 명령)
- 핵심 결과: `postgres:18.6-bookworm` → `sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650`; `orthancteam/orthanc:26.9.1` → `sha256:d2705f2c56547e55ce9bc2250fd22d05d326493b3f3d9fa191ecb7db8ca6b5a2`. Registry metadata only; layers were not pulled.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| 해당 없음 | 제품 API·데이터 이동 없음; infra configuration만 검증 | 제품 인가 거부 경로는 ENV 기능 및 이후 product Ticket에서 검증 | `NOT APPLICABLE` |
| Harness correction | 두 초기 PowerShell assertion | 첫 비교식의 precedence 및 테스트가 container mount target 자체를 잘못 unique로 요구한 문제를 수정; Compose 설계 변경 없음. Repeatable validator의 올바른 조건(서비스별 volume source 독립)으로 재실행 통과 | `PASS after correction` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Container startup, health, Orthanc DICOMweb capability | ENV-003은 configuration-only 범위이며 Docker state를 변경하지 않음 | 선언된 서비스의 runtime behavior는 확인되지 않음 | ENV-004~006에서 실행/검증 |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Compose validator | `scripts/validate-compose-baseline.ps1` | expanded config/credential 값 출력 안 함 |
| Compose command summary | 이 문서 | expanded config/credential 값 저장 안 함 |

## 7. 결론

- 결과: `PASS` — Compose configuration, service/image/network/volume topology, loopback binding, missing-config rejection only.
- PASS를 주장할 수 있는 범위: `MEDIQ-ENV-003` config scope만. Container runtime, ENV-004~010, Phase 0 Acceptance, product security/Integration/E2E는 미실행이며 PASS가 아님.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.

### ENV-004 runtime 후속 메모 — 2026-09-28

ENV-003의 loopback publish 판정은 Compose normalized config의 선언값만 확인했다. 실제 PostgreSQL runtime에서 `internal: true` network의 host port mapping이 생성되지 않는 것이 확인되어 ENV-004에서 PostgreSQL port publish를 제거했다. Orthanc A/B의 동일 network/publish 조합은 ENV-005/006의 runtime 검증 전이며, config-only 결과를 host 도달성 증거로 해석하지 않는다.
