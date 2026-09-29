# MEDIQ-ENV-003 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-003` |
| 제목 | P0 Docker Compose baseline |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-28` |
| 상태 | `PASS` — Compose configuration scope only |

## 1. 목표

PostgreSQL과 Test Orthanc A/B의 Compose 구성을 추가했다. 각 서비스는 digest-pinned image를 사용하고, 서로 다른 internal network와 named volume을 갖는다. 외부에 publish하는 port는 loopback으로만 제한하고 필수 설정값이 없으면 Compose interpolation 단계에서 실패한다. 본 결과는 config 검증만 PASS이며 container 실행·health·PACS capability를 뜻하지 않는다.

## 2. 범위

### 포함

- `infra/docker-compose.yml`의 PostgreSQL·Orthanc A/B 서비스, 분리된 internal network와 persistent volume 선언
- `.env.example`의 Compose 개발 설정·명시적 test-only placeholder
- test service endpoint, secret 교체와 synthetic-only 경계를 설명하는 infra 안내
- Compose config boundary를 재현하는 `scripts/validate-compose-baseline.ps1`
- Compose syntax, service/image/network/volume resolution, loopback binding 및 required-variable fail-closed 검사

### 제외

- Docker container/image pull 또는 container start/stop, volume 삭제·초기화
- 개별 PostgreSQL·Orthanc 실행·health/capability 시험 (ENV-004~006)
- Application config loader·API/Worker container·Synthetic DICOM seed·health check·smoke test (ENV-007~010 또는 후속)
- 실제 병원 Endpoint/Credential·환자정보·운영 DICOM

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `P0-DEVELOPER-BASELINE.md` §2, §4–5; `CAPSTONE-MVP-BOUNDARY.md` §6.1; `TECH-STACK-DECISION.md` §1 | 로컬 Postgres + Synthetic Hospital A/B Orthanc, API/Worker 추가 전 구조 경계 | `docker compose config` 및 repeatable topology validator |
| 보안 | `AGENTS.md` §4, §8; `SECURITY-REQUIREMENTS.md` §6; `THREAT-MODEL.md` | synthetic-only, ignored local `.env`, loopback-only published ports, A/B·DB network isolation, required config | normalized config에서 bind IP·internal network·volume 검증; missing variable fail-closed; secret 값 출력 금지 |
| API·도메인 | `OPENAPI.yaml`; `DOMAIN-MODEL.md`; `SYSTEM-ARCHITECTURE.md` | API·Domain·schema 미변경 | Compose 외 계약 파일 미변경 확인 |
| Acceptance | `IMPLEMENTATION-PLAN.md` §9 Phase 0 Gate; `P0-DEVELOPER-BASELINE.md` §5 | Compose 해석 성공은 container health·Phase 0 gate가 아님 | `config --quiet`, topology script, missing-variable rejection; startup은 ENV-004~006 |

## 4. 구현 결과

PostgreSQL `18.6-bookworm`와 Orthanc Team `26.9.1` 이미지의 multi-architecture manifest digest를 pin했다. 당시 Compose 초안은 `postgres`, `orthanc-a`, `orthanc-b`와 세 internal network 및 독립 named volume 3개를 정의했다. 최초 config-only 결과에서는 host port `15432`, `14242/14243`, `18042/18043`가 127.0.0.1에 publish되도록 선언되어 있었다. PostgreSQL 선언은 ENV-004 runtime 발견 후 제거되었으며 현재값은 아래 후속 메모를 따른다. Orthanc 설정은 DICOMweb plugin을 활성화하고 Hospital A/B의 이름과 DICOM AET를 구분한다. 이 Ticket 시점에는 실제 image pull/start와 Orthanc runtime version/capability를 확인하지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `infra/docker-compose.yml` | Postgres·Orthanc A/B services, image digests, isolated networks/volumes, loopback ports |
| `.env.example` | DB·A/B Test Orthanc host ports와 test-only secret placeholders |
| `infra/README.md` | local config setup, validator 실행 및 config/runtime 구분 안내 |
| `scripts/validate-compose-baseline.ps1` | 재현 가능한 정적 Compose boundary 검사 |
| `docs/implementation/README.md` | Ticket 상태 색인 |
| `docs/P0-EXECUTION-SCHEDULE.md` | ENV 단계 상태·다음 Ticket 갱신 |
| `docs/P0-DEVELOPER-BASELINE.md`, `docs/REPOSITORY-BASELINE-AUDIT.md`, `docs/MEDIQ-EXECUTIVE-STATUS-REPORT.md` | scaffold/config-only 현재 상태 동기화 |
| `docs/TECH-STACK-DECISION.md` | 정확한 infra image pin과 runtime 미검증 상태 |
| `docs/implementation/MEDIQ-ENV-003/*` | 구현·시험 기록 |

## 6. 영향 분석

### Architecture

- Local Compose 내 PostgreSQL·Orthanc test service 구조만 선언한다. Application runtime은 아직 Compose에 포함하지 않는다.

### API·Data

- API, database schema, migration 및 Patient/Consent/Authorization/Grant domain 변경 없음.

### Security·Privacy

- 제품 접근정책 변화 없음. Compose에 credential literal을 넣지 않고 required local environment interpolation을 사용한다. `.env`는 ignore 상태이며 이 작업에서는 만들지 않았다. Compose port는 loopback-only; 활성화된 다른 Docker 프로젝트를 시작·중지하지 않았다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: Compose syntax/topology/required-variable 경계 통과. 실제 container lifecycle·health·DICOMweb는 미검증.

## 8. 변경하지 않은 사항

- Compose 해석 외 container startup, persisted data 초기화, 제품 readiness·PACS workflow는 미수행으로 유지한다.

## 9. 결정 및 예외

- PostgreSQL `18.6-bookworm` 및 Orthanc Team `26.9.1` multi-architecture manifest를 digest로 pin했다. 이는 승인된 Postgres 18 / Orthanc 1.13 stack을 구체화한다. 정확한 digest는 2026-09-28 registry metadata에서 확인했으며 image bytes는 pull하지 않았다. 공급자 기준은 [PostgreSQL Official Image](https://hub.docker.com/_/postgres), [Orthanc Docker image documentation](https://orthanc.uclouvain.be/book/users/docker-orthancteam.html), [Orthanc Docker release notes](https://github.com/orthanc-server/orthanc-builder/blob/master/release-notes-docker-images.md)다.

## 10. 잔여 위험과 후속 작업

- Image manifest가 검증되어도 local Docker startup·health·DICOMweb 지원 동작은 입증되지 않는다. ENV-004~006에서 단계별 실행·시험한다.

## 11. 최종 판정

```text
Ticket: MEDIQ-ENV-003
Scope: CAPSTONE-P0 Compose service/network/volume baseline
Changed: Postgres·Orthanc A/B Compose declarations, local placeholder config, repeatable topology validator, current-state docs/evidence
Not changed: container lifecycle or volumes, API/Worker code, health/readiness, synthetic DICOM seeding, DICOM workflow
Security impact: required env vars, loopback-only host ports, isolated internal networks and volumes; no runtime secret or patient payload created
Tests executed: config normalization, topology validator, missing-variable fail-closed, digest metadata lookup, git diff check — scoped PASS
Tests not executed: container startup/health, DB connection, Orthanc DICOMweb capability, seed, API readiness, Phase 0 Acceptance/E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: actual image startup/version and host-port reachability remain unverified; app/worker networks and env loader are later tickets
Status: PASS (MEDIQ-ENV-003 config scope only; Phase 0 remains NOT RUN)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-28 | `PASS` | Digest-pinned Postgres/Orthanc Compose 구성과 repeatable boundary validator 검증. Container는 시작하지 않음 |

### ENV-004 runtime 후속 메모 — 2026-09-28

이 Ticket의 `loopback-only host port` 결과는 당시 Compose의 선언값 검사이며 runtime 도달성 검증이 아니었다. PostgreSQL network가 `internal: true`인 상태에서 host port를 선언해도 실제 host binding이 만들어지지 않는 점을 후속 runtime 점검에서 발견했다. DB isolation을 유지하도록 Postgres host port declaration을 제거하고, peer container가 `postgres:5432`에 인증 연결하는 방식으로 수정·검증했다. 현재 Compose baseline은 [ENV-004 보고서](../MEDIQ-ENV-004/IMPLEMENTATION-REPORT.md)와 [검증 증거](../MEDIQ-ENV-004/TEST-EVIDENCE.md)를 따른다. ENV-003의 config-only 시험 결과 자체는 당시 상태의 역사적 기록으로 보존한다.
