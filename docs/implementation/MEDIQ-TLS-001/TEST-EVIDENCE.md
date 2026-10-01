# MEDIQ-TLS-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-TLS-001` |
| 제목 | Local Test Orthanc HTTPS and certificate validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 결과 | `PASS` — all eight scoped Acceptance cases pass; global TLS requirements remain broader |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows host / Docker Linux containers |
| Runtime·Toolchain | Docker Compose, Node.js 24, Orthanc Team image 26.9.1, PowerShell 7.6.5, TypeScript 6, Vitest 5 |
| 대상 환경 | Local Synthetic Test only |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-TLS-001-HTTPS-001` | Scheme, host, port, path, userinfo, query and fragment override | AppConfig unit | Exact HTTPS origin only; reject before upstream call | 7 invalid origins rejected; API config 11/11 | `PASS` |
| `TC-TLS-001-HTTPS-002` | Authenticated A/B HTTPS and DICOMweb content negotiation | Runtime + integration | Chain/SAN valid; A/B auth and media type; no host ports | `/system` unauthenticated 401 / authenticated 200; QIDO 200; A/B names verified | `PASS` |
| `TC-TLS-001-HTTPS-003` | Plain HTTP to TLS-only listener | Security integration | Connection fails; no redirect/fallback | Node fetch to `http://orthanc-a:8042/system` rejected | `PASS` |
| `TC-TLS-001-CERT-001` | Empty/untrusted CA store | Security integration | TLS peer not authorized | `tls.connect` failed before secure session | `PASS` |
| `TC-TLS-001-CERT-002` | Wrong DNS server name with the trusted CA | Security integration | Hostname mismatch denied | `ERR_TLS_CERT_ALTNAME_INVALID` | `PASS` |
| `TC-TLS-001-CERT-003` | Corrupted/malformed trust bundle | Security integration | Peer never becomes authorized | Mutated CA bundle did not produce `AUTHORIZED` result | `PASS` |
| `TC-TLS-001-HEALTH-001` | A/B Docker healthcheck | Runtime + source review | Verify local Test CA and localhost SAN; no `CERT_NONE` | Both Orthanc containers healthy; repo-owned probe uses `ssl.create_default_context(cafile=...)` | `PASS` |
| `TC-TLS-001-DICOM-001` | Existing read-only A QIDO/WADO/frame and B destination baseline over HTTPS | DICOM integration | Synthetic hierarchy/hash/size preserved; B unchanged; no STOW | 7/7 integration cases; A 1 Study/1 Series/3 Instances; three payload SHA-256/byte counts matched; B=0 instances | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — TLS and read-only DICOM integration

- 실행 일시: 2026-10-01 (Asia/Seoul)
- 목적: TLS positive/negative behavior and existing DICOM compatibility, without PACS write
- 명령:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile dicom-test run --build --rm dicom-adapter-test
```

- 종료 코드: `0`
- 핵심 결과: Node integration 7 tests / 7 passed; trusted A/B TLS, untrusted CA, wrong SAN, malformed CA, HTTP downgrade, A QIDO/WADO/frame hash, B read-only baseline; no POST/STOW code path invoked
- 판정: `PASS` for `TC-TLS-001-HTTPS-002/003`, `CERT-001~003`, `DICOM-001`

### TEST-002 — API/config/contract regression

- 실행 일시: 2026-10-01 (Asia/Seoul)
- 목적: HTTPS origin enforcement and regression
- 명령:

```powershell
npm run typecheck:api
npm run test:api -- --reporter=dot
npm run test:dicom-port-contract
./scripts/validate-app-config.ps1 -EnvFile .env
./scripts/validate-compose-baseline.ps1 -EnvFile .env
git diff --check
```

- 종료 코드: `0`
- 핵심 결과: API typecheck/build pass; 29 files / 526 tests; DICOM Port type contract pass; AppConfig 11/11; Compose baseline pass; `git diff --check` pass (Git emitted existing LF→CRLF working-copy warnings only)
- 판정: `PASS` for `TC-TLS-001-HTTPS-001` and configuration/build regression

### TEST-003 — Orthanc A/B and complete local environment probes

- 실행 일시: 2026-10-01 (Asia/Seoul)
- 목적: Test certificate-verified health, local auth/network isolation and API→DB/Orthanc readiness
- 명령:

```powershell
./scripts/test-orthanc-a.ps1 -EnvFile .env
./scripts/test-orthanc-b.ps1 -EnvFile .env
./scripts/test-environment-health.ps1 -EnvFile .env
```

- 종료 코드: `0` for each completed command
- 핵심 결과: A authenticated HTTPS QIDO 200 / 1 Study; B authenticated HTTPS QIDO 200 / 0 Study; invalid credentials rejected; A/B host ports unpublished and hospital networks isolated; `postgres_readiness=PASS runtime_sql_auth=PASS orthanc_a=PASS orthanc_b=PASS api_readiness=PASS`
- 판정: `PASS` for `TC-TLS-001-HTTPS-002` and `HEALTH-001`

### TEST-004 — Local certificates and runtime reconfiguration

- 실행 일시: 2026-10-01 (Asia/Seoul)
- 명령:

```powershell
./scripts/new-local-test-orthanc-certs.ps1 -Force
docker compose --env-file .env -f infra/docker-compose.yml up -d --no-deps --force-recreate orthanc-a orthanc-b
docker compose --env-file .env -f infra/docker-compose.yml up -d --build --no-deps --force-recreate api
docker compose --env-file .env -f infra/docker-compose.yml config --quiet
git check-ignore -v data/local-tls/test-ca.key data/local-tls/test-ca.crt data/local-tls/orthanc-a.pem data/local-tls/orthanc-b.pem
```

- 종료 코드: `0` for final execution and validation
- 핵심 결과: Certificates were generated locally; `data/*` Git ignore confirmed; Orthanc A/B HTTPS healthchecks passed; API rebuilt/recreated healthy; named A/B volumes remained mounted; no `down`, volume deletion or database reset was run. `-Force` was used only to replace this Ticket's newly generated, invalid intermediate local cert files after tests caught formatting/EKU issues; default script invocation does not overwrite existing material.
- 판정: `PASS` for runtime setup; cert material remains ignored local-only output

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-TLS-001-HTTPS-003` | HTTP downgrade to HTTPS-only listener | Connection rejected; no fallback/redirect | `PASS` |
| `TC-TLS-001-CERT-001` | Untrusted CA | TLS peer not authorized | `PASS` |
| `TC-TLS-001-CERT-002` | Wrong DNS identity | TLS peer not authorized | `PASS` |
| `TC-TLS-001-CERT-003` | Malformed CA trust input | TLS peer not authorized | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Client↔MediQ ingress TLS / mTLS | Out of Ticket scope; no product ingress endpoint is under test | Do not claim full SEC-TLS-001; separate architecture/release gate | Productionization / later security ticket |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Local generated CA / private keys | ignored runtime directory only; not attached/committed | No certificate private key or credential in report |

## 7. 결론

- 결과: `PASS` — local Synthetic API↔Test Orthanc transport and DICOM read-only compatibility only
- PASS를 주장할 수 있는 범위: the eight `TC-TLS-001-*` cases; not Client ingress, global TLS, production PKI, mTLS, PACS authorization or transfer
- 실제 환자정보, 운영 Credential, Secret, private key 및 운영 DICOM을 증거에 포함하지 않는다.
