# MEDIQ-ENV-006 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-006` |
| 제목 | Hospital B Test Orthanc runtime and DICOMweb readiness |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-29` |
| 상태 | `PASS` — Ticket scope only |

## 1. 목표

Hospital B Test Orthanc를 pinned Compose 환경에서 기동하고, 실제 readiness·인증·DICOMweb QIDO 동작과 A/B 네트워크·저장소 분리를 검증한다. 이 Ticket은 환경 준비 Gate이며 영상 payload 교환이나 MediQ 제품 보안의 PASS를 의미하지 않는다.

## 2. 범위

### 포함

- Hospital B Orthanc healthcheck와 runtime 기동 검증
- B HTTP 인증, `dicom-web` plugin 및 빈 저장소 QIDO-RS probe
- A/B 전용 internal network 및 영속 volume이 서로 분리되는지 검증
- Host-published binding 및 Host에서 B container IP로 직접 연결되는지 검증
- A/B test password가 서로 다른지 비밀값을 노출하지 않고 확인
- B host port publish 선언의 runtime 영향을 확인하고 host 포트를 비공개로 유지
- 재현 가능한 B 점검 스크립트와 시험 증거 작성

### 제외

- Synthetic DICOM fixture/seed, QIDO 결과 데이터 및 WADO payload retrieval
- STOW-RS, A→MediQ→B transfer, destination verification 또는 integrity/provenance/audit
- MediQ API·Worker·Web, Consent·Authorization·Transfer Grant 구현
- TLS/mTLS 및 실제 병원 PACS·실제 환자·운영 credential

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `IMPLEMENTATION-PLAN.md` §9 `MEDIQ-ENV-006`; `P0-DEVELOPER-BASELINE.md` §5 | B Test Orthanc readiness와 A/B 독립성 | Compose B service, `scripts/test-orthanc-b.ps1` |
| 보안 | `AGENTS.md` §§4–8; `SECURITY-REQUIREMENTS.md` §§21–22; `THREAT-MODEL.md` TB-02/TB-03 | 별도 병원 trust boundary, test-only 데이터, credential 비노출; TLS는 별도 보안 Gate | 양방향 cross-network reachability denial, distinct volume/password, 인증 부정 시험 |
| API·도메인 | `DICOM-INTEROPERABILITY-PROFILE.md` §§3, 22; `SYSTEM-ARCHITECTURE.md` DICOMweb/PACS 경계 | B는 destination Test PACS; 접근은 병원별 네트워크의 server-side peer에서만 | 인증된 빈 QIDO 응답; 제품 API/adapter는 구현하지 않음 |
| Acceptance | `IMPLEMENTATION-PLAN.md` §9 `MEDIQ-ENV-006` | B health·DICOMweb capability·A/B 독립성 | B identity/auth/plugin/QIDO, A/B network·volume/host-port 검사 |

## 4. 구현 결과

Hospital B의 pinned Orthanc image를 기동해 container aliveness healthcheck를 추가했다. 인증 없는 QIDO와 잘못된 암호가 거부되고, 올바른 인증으로 `/system`, `/plugins`, 빈 저장소 QIDO가 동작함을 확인했다. A와 B의 test password는 값 자체를 출력하지 않고 서로 다름을 확인했다.

실제 Docker runtime에서 B host port binding과 Host→B container IP의 DICOM/HTTP port 접근이 모두 없음을 확인했다. B의 loopback port 선언을 제거해 A와 동일하게 B의 `hospital-b` network peer에서만 접근하도록 했다. A/B service는 서로 다른 internal network와 `orthanc-a-data`/`orthanc-b-data` volume에 연결되고, 양방향 병원간 endpoint 요청은 각각 도달 불가였다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `infra/docker-compose.yml` | B aliveness healthcheck 추가, B host port publish 제거 |
| `.env.example` | 사용하지 않는 B host-port 변수 제거 |
| `scripts/validate-compose-baseline.ps1` | A/B healthcheck와 host-port 미공개 설정 assertion |
| `scripts/test-orthanc-b.ps1` | B auth/QIDO, credential 구분, network·volume·port 경계 반복 시험 |
| `infra/README.md` | 실제 A/B 접근·격리와 시험 근거 갱신 |
| `docs/implementation/MEDIQ-ENV-006/*` | Ticket 구현·시험 증거 |
| 기준선·현황 문서 | A/B runtime 상태와 다음 Ticket을 ENV-007로 동기화 |

## 6. 영향 분석

### Architecture

- Hospital B Test Orthanc만 대상 설정을 재생성했다. PostgreSQL·Hospital A는 재기동하지 않았다.
- B persistent volume `mediq_orthanc-b-data`를 유지했다. fixture가 없어 저장소는 빈 상태다.

### API·Data

- API·schema·migration·DICOM object 변경 없음.
- QIDO에서 A/B 모두 0 Study를 확인했으며 synthetic DICOM payload를 추가하지 않았다.

### Security·Privacy

- test-only HTTP Basic Auth 확인; unauthenticated/invalid credential은 `401`.
- A/B internal network와 data volume이 분리되고 두 Orthanc에 host port를 공개하지 않는다. 이번 Docker 환경에서 B container IP의 4242/8042는 Host에서도 도달 불가였다.
- A/B test password의 구분 여부만 출력했다. password, `.env` 값, 환자정보, DICOM payload는 출력·기록하지 않았다.
- TLS, MediQ identity/tenant/consent/authorization/grant 및 audit control은 이 Ticket에서 구현·검증하지 않았다.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` — Hospital B runtime/readiness, empty-store QIDO, 인증 경계 및 A/B 환경 격리 범위만.

## 8. 변경하지 않은 사항

- Hospital A configuration와 persistent data; PostgreSQL service와 volume
- Synthetic fixture, WADO/STOW, MediQ product services, database schema 및 Phase 0 Acceptance
- 승인된 DICOM/API/Security 계약

## 9. 결정 및 예외

- ENV-005에서 A internal network의 loopback host port 선언이 실제 host binding을 만들지 않는 것을 관찰했다. ENV-006에서는 B도 runtime을 별도로 확인해 선언을 제거했다. 이 Docker 환경의 관찰이며 모든 Docker `internal` network 일반론으로 확대하지 않는다.
- Orthanc image와 volume은 기존 pinned Compose 정의를 유지했다. `--wait` readiness는 DICOM payload 상호운용성이나 MediQ 제품 보안을 뜻하지 않는다.

## 10. 잔여 위험과 후속 작업

- 두 Orthanc 저장소가 비어 있어 실제 Patient/Study isolation, QIDO metadata, WADO payload 및 STOW import/verification은 입증되지 않았다. ENV-007 Synthetic DICOM 이후 DICOM Integration/Acceptance Ticket에서 검증한다.
- Internal-network HTTP 시험은 `SEC-TLS-001`을 충족하지 않는다. TLS certificate validation과 application connectivity는 ENV-008 및 보안/DICOM Ticket에서 별도 검증해야 한다.

## 11. 최종 판정

```text
Ticket: MEDIQ-ENV-006
Scope: Hospital B Test Orthanc runtime/readiness, DICOMweb QIDO and A/B environment isolation
Changed: B healthcheck, removal of ineffective B host-port declarations, repeatable B probe, synchronized records
Not changed: Orthanc A data/config, PostgreSQL, DICOM fixture/payload transfer, product API/schema, TLS, P0 Acceptance
Security impact: Distinct internal networks/volumes and test passwords; no host ports; credentials and patient data not exposed
Tests executed: Compose config/validator; B startup/aliveness/auth/plugin/QIDO; A regression probe; A/B cross-network denial, volume/password separation, no published ports and Host-to-B-IP reachability check
Tests not executed: Fixture-backed QIDO/WADO/STOW, TLS, MediQ authorization and Phase 0 E2E
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Empty stores cannot prove DICOM payload isolation/interoperability; app and TLS paths remain unimplemented
Status: PASS (MEDIQ-ENV-006 scope only; Phase 0 remains BLOCKED)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-29 | `PASS` | Hospital B readiness/auth/QIDO와 A/B network·volume boundary 검증; host-port 선언 제거 |
