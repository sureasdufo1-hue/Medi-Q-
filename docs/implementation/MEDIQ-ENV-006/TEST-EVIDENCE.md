# MEDIQ-ENV-006 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-006` |
| 제목 | Hospital B Test Orthanc runtime and DICOMweb readiness |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-29` |
| 결과 | `PASS` — ENV-006 scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows host, PowerShell; Docker Desktop Linux containers |
| Runtime·Toolchain | Docker Engine 29.8.0; Compose v5.5.1; Orthanc Team 26.9.1 digest; Orthanc core 1.13.0; pinned Node 24 Alpine probe image |
| 대상 환경 | Local Compose project `mediq`; separate `hospital-a` and `hospital-b` internal networks |
| 데이터 | Both Orthanc stores empty; no PHI or DICOM payload |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| ENV006-01 | Compose B health and exposure policy | Config | Pinned image, aliveness healthcheck, no B host port | Compose config and validator passed; B has no published binding | `PASS` |
| ENV006-02 | Hospital B process/service readiness | Runtime | B running/healthy with expected identity | Orthanc core `1.13.0`, name `Hospital B Test Orthanc`, AET `MEDIQB`; vendor aliveness probe passed | `PASS` |
| ENV006-03 | B authentication and DICOMweb capability | Integration/Security | Missing/invalid auth rejected; valid QIDO succeeds | `401` / `401` / `200`; `dicom-web` loaded; `application/dicom+json`, 0 studies | `PASS` |
| ENV006-04 | A/B boundary and storage separation | Security/Network | Networks/endpoints/volumes and test passwords are separate | Cross-network endpoint unreachable both directions; distinct volume names/passwords; no B host binding or Host-to-B-IP reachability on ports 4242/8042 | `PASS` |
| ENV006-05 | Existing A/DB regression | Regression | A remains healthy and its probes pass; PostgreSQL unaffected | A probe passed; A, B, PostgreSQL reported healthy | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Compose configuration and Hospital B startup

- 실행 일시: 2026-09-29 KST
- 목적: A/B aliveness·no-host-port policy를 정적으로 검사하고 B만 기동·readiness 대기
- 명령:

```powershell
docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait --wait-timeout 120 orthanc-b
docker compose --env-file .env -f infra/docker-compose.yml ps -a
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: Validator 통과; B `running|healthy`; A와 PostgreSQL도 `running|healthy`. B는 host port를 publish하지 않음.
- 판정: `PASS`

### TEST-002 — Hospital B repeatable runtime/auth/QIDO and isolation probe

- 실행 일시: 2026-09-29 KST
- 목적: ignored `.env` credential 비노출 상태로 B readiness, auth, plugin, QIDO, A/B boundary 확인
- 명령:

```powershell
./scripts/test-orthanc-b.ps1
```

- 종료 코드: `0`
- 핵심 결과: A/B test passwords distinct; Host-to-B container IP ports 4242/8042 unreachable; no-auth QIDO `401`; invalid-password QIDO `401`; authenticated `/system` `200`; name `Hospital B Test Orthanc`; core `1.13.0`; AET `MEDIQB`; `dicom-web` loaded; authenticated QIDO `200 application/dicom+json`, Study count `0`. Hospital A endpoint was unreachable from B network and Hospital B endpoint unreachable from A network. A/B Orthanc data volumes are distinct, and B host bindings are empty.
- 판정: `PASS`

### TEST-003 — Hospital A regression and final Compose boundary

- 실행 일시: 2026-09-29 KST
- 목적: B 구성 변경 후 A readiness/auth/QIDO 유지 및 Compose boundary 회귀 확인
- 명령:

```powershell
./scripts/test-orthanc-a.ps1
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
docker compose --env-file .env -f infra/docker-compose.yml ps -a
```

- 종료 코드: 각 명령 `0`
- 핵심 결과: A no-auth/invalid auth `401`; authenticated QIDO `200 application/dicom+json`, Study count `0`; A, B, PostgreSQL `running|healthy`.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| ENV006-SEC-01 | B QIDO without credentials | HTTP `401` | `PASS` |
| ENV006-SEC-02 | B QIDO with invalid password | HTTP `401` | `PASS` |
| ENV006-SEC-03 | Hospital B network attempts to reach Orthanc A | Endpoint unreachable | `PASS` |
| ENV006-SEC-04 | Hospital A network attempts to reach Orthanc B | Endpoint unreachable | `PASS` |
| ENV006-SEC-05 | Host attempts direct connection to B container IP ports 4242/8042 | Both endpoints unreachable | `PASS` |

Consent, Authorization, Grant, Tenant resource decisions and wrong-destination STOW are product behaviors and are not implemented by this infrastructure Ticket; they remain for later integration/security Acceptance.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Fixture-backed QIDO and WADO payload retrieval | Synthetic DICOM fixture not yet available | Empty QIDO proves endpoint/readiness only, not DICOM data interoperability | ENV-007 then DICOM integration tests |
| STOW-RS, destination verification, integrity/provenance/audit | MediQ transfer path and fixture not implemented | A→MediQ→B exchange not verified | PACS transfer/Acceptance tickets after ENV-007 |
| TLS certificate validation or mTLS | Current local test endpoints use HTTP | Does not satisfy `SEC-TLS-001` | ENV-008 and transport-security tickets |
| MediQ API, consent/authorization/grant and full P0 E2E | Product services/schema are absent | P0 remains BLOCKED | Subsequent P0 implementation tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Runtime/auth/QIDO/network summary | This file and test output | Password, `.env` values, patient data, DICOM payload omitted |
| Repeatable B probe | `scripts/test-orthanc-b.ps1` | Reads only Git-ignored `.env`; emits only password-distinct boolean |
| Compose policy checks | `scripts/validate-compose-baseline.ps1` | Uses `.env.example`; no credential output |

## 7. 결론

- 결과: `PASS` — Hospital B runtime/readiness, auth, DICOMweb empty-store QIDO and A/B environment-boundary scope only.
- PASS를 주장할 수 있는 범위: `MEDIQ-ENV-006`. DICOM object retrieval/transfer, TLS, application security and Phase 0 are not PASS.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
