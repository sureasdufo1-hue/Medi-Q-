# MEDIQ-TLS-001 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-TLS-001` |
| 제목 | Local Test Orthanc HTTPS and certificate validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-01` |
| 상태 | `PASS` — scoped local API↔Test Orthanc HTTPS, certificate validation and read-only DICOM Acceptance passed |

## 1. 목표

`TLS-001-DEC-001`에 따라 Synthetic local Compose에서 MediQ API 및 격리 DICOM test client가 Hospital A/B Test Orthanc에 HTTPS로만 접근하게 하고, CA chain과 hostname을 검증한다. 이 Ticket은 PACS side effect 없이 전송 TLS 기반을 검증하는 선행 infrastructure slice다.

## 2. 범위

### 포함

- local-only Test CA 및 A/B별 SAN 인증서 bootstrap; private material Git 제외
- Orthanc A/B HTTPS-only listener와 certificate-verified healthcheck
- API/adapter HTTPS-only endpoint config 및 Test CA trust
- TLS positive/negative와 read-only DICOM integration Acceptance

### 제외

- Client↔MediQ ingress TLS, production proxy/PKI, mTLS/VPN
- PACS coordinator, Authorization/Preflight, STOW, destination mutation/verification
- 실제 병원 endpoint, credential, patient 또는 production DICOM

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `SEC-TLS-001~002` | API↔Test Orthanc protected transport + certificate validation | `TC-TLS-001-*` |
| 보안 | `THR-014`, `THR-022`; `AT-SEC-022/023` | MITM/downgrade/invalid trust fail closed | TLS tests + read-only DICOM suite |
| API·도메인 | `DICOM-INTEROPERABILITY-PROFILE.md` §§10.2, 19.3 | Internal endpoint scheme/origin only; no public API or domain change | Config tests, Compose/runtime probe |
| Acceptance | `TLS-001-DEC-001` | Local test transport prerequisite only | `ACCEPTANCE-TESTS.md#p0-local-test-orthanc-https-acceptance--mediq-tls-001` |

## 4. 구현 결과

로컬 synthetic Compose에서 API 및 isolated adapter-test client가 HTTPS로만 A/B Test Orthanc에 연결한다. Test CA가 발급한 A/B별 server certificates에는 service DNS와 `localhost` SAN, serverAuth EKU 및 CA identifiers가 포함된다. `scripts/new-local-test-orthanc-certs.ps1`은 private material을 Git-ignored `data/local-tls/`에 생성하고, 기본 동작은 기존 material을 덮어쓰지 않는다. Compose는 Orthanc의 HTTPS-only listener와 read-only certificate/CA mounts를 설정한다. API와 integration container는 `NODE_EXTRA_CA_CERTS`로 해당 CA를 trust하되 기본 chain·hostname 검증은 유지한다. Orthanc healthcheck도 인증서를 검증하는 repo-owned Python probe를 사용한다.

API configuration과 endpoint resolver는 exact `https://orthanc-a|b:8042`만 허용하고 HTTP downgrade를 차단한다. Read-only QIDO/WADO/instance/frame probes는 기존 synthetic source content와 manifest SHA-256/byte count를 그대로 확인했으며 B destination baseline은 0 instance였다. TLS Ticket 동안 STOW/POST는 실행되지 않았다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `docs/POLICY-DECISION-LOG.md` | `TLS-001-DEC-001` recommendation, alternatives, scope, residual risks |
| `docs/ACCEPTANCE-TESTS.md` | 8 TLS and DICOM transport Acceptance cases; scoped outcomes recorded |
| `infra/docker-compose.yml`, `infra/orthanc/mediq-tls-healthcheck.py` | HTTPS-only Orthanc A/B, local CA mounts, verified runtime healthchecks |
| `scripts/new-local-test-orthanc-certs.ps1` | non-destructive local-only Test CA and separate A/B certificate bootstrap |
| `services/api/src/config/app-config.ts`; DICOM resolver/adapter | enforce exact HTTPS endpoints; reject HTTP |
| `tests/config/app-config.test.mjs`; `tests/api/orthanc-dicomweb.adapter.test.mjs`; `tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs` | scheme/config negative cases; trusted, untrusted, wrong-name, malformed trust and no-downgrade live tests; read-only DICOM checks |
| PowerShell probe/seed scripts, `.env.example`, `infra/README.md`, `scripts/README.md` | use HTTPS and supply Test CA to local synthetic client probes |
| `docs/DICOM-INTEROPERABILITY-PROFILE.md`, `docs/ACCEPTANCE-TESTS.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/P0-EXECUTION-SCHEDULE.md`, `docs/implementation/README.md` | record final scoped result and residual gates |

## 6. 영향 분석

### Architecture

- A/B local Orthanc HTTP service listeners are replaced with HTTPS-only listeners. Existing isolated A/B networks and persistent named data volumes remain unchanged; host ports remain unpublished.
- Compose service recreation preserved the existing named Orthanc data volumes.

### API·Data

- API endpoint URL scheme is HTTPS-only. No Domain, OpenAPI, database schema, Migration or runtime DB privileges changed.
- Integration runner mounts only the public Test CA and synthetic manifest; private keys are not mounted to API/test clients.

### Security·Privacy

- TLS certificate chain and peer hostname are validated; no bypass setting or HTTP fallback is used.
- Orthanc private keys remain only in ignored host-local `data/local-tls/` and the Orthanc read-only certificate bind mount; Test CA private key is not mounted to containers.
- No PHI, production PACS endpoint, production credential, STOW, or B write was used. Authentication remains in place.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` for this Ticket's local API↔Test Orthanc slice; global Client↔MediQ TLS / production PKI remain unpassed

## 8. 변경하지 않은 사항

- Client↔MediQ ingress TLS, mTLS, production reverse proxy/PKI lifecycle, PACS coordinator, Authorization/Preflight, STOW, destination write/verification, Integrity/Provenance/Audit transaction and full A→B E2E were not implemented.

## 9. 결정 및 예외

- `TLS-001-DEC-001`: Orthanc built-in HTTPS is selected only for the isolated local Synthetic Test profile. It is not a production architecture decision.
- Orthanc documentation recommends a production-grade HTTPS reverse proxy generally and permits built-in TLS for simple/intranet deployments; production termination and upstream protection remain a separate decision.

## 10. 잔여 위험과 후속 작업

- Local Test CA and keys are development-only and depend on host filesystem protection; rotate/recreate only through a separately controlled local workflow.
- `SEC-TLS-001` includes Client↔MediQ and is not globally complete. mTLS remains P0 SHOULD; production certificate lifecycle and reverse-proxy architecture remain open.
- Next: record recommendation/Acceptance for full PACS-001 operation-time Authorization/revocation fencing and Mandatory Preflight; keep STOW disabled until every gate passes.

## 11. 최종 판정

```text
Ticket: MEDIQ-TLS-001
Scope: Local synthetic API↔Hospital A/B Test Orthanc HTTPS, certificate verification and read-only DICOM interoperability
Changed: Local Test CA bootstrap; HTTPS-only Orthanc; strict HTTPS URL validation; verified health/probe/integration; related evidence/docs
Not changed: Client↔MediQ ingress, production TLS/PKI/reverse proxy, mTLS, PACS authorization/coordinator/STOW, schema or DB privileges
Security impact: TLS chain+SAN validated; HTTP downgrade, untrusted/malformed trust, and wrong hostname denied; no TLS verification bypass
Tests executed: API 29 files/526 tests; AppConfig 11/11; DICOM Port compile; API typecheck/build; TLS/DICOM integration 7/7; Orthanc A/B probes; ENV health; Compose/AppConfig validation; diff check
Tests not executed: Client↔MediQ ingress TLS, mTLS, production PKI/rotation, STOW, Authorization/Preflight and full A→B E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Local Test CA/key custody only; overall `SEC-TLS-001` and production profile remain open
Status: PASS
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-10-01 | `PASS` | Local HTTPS, CA/SAN fail-closed cases, verified health and read-only DICOM tests passed; global/production TLS remains open |
