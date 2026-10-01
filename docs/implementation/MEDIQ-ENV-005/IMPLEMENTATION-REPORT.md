# MEDIQ-ENV-005 Implementation Report

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-005` |
| 제목 | Hospital A Test Orthanc runtime and DICOMweb readiness |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-29` |
| 상태 | `PASS` — Ticket scope only |

## 1. 목표

Hospital A Test Orthanc를 기존 digest-pinned Compose 설정으로 기동하고, readiness, HTTP authentication, DICOMweb plugin과 QIDO-RS 응답을 확인한다. 결과는 ENV-005의 로컬 Test PACS 범위에만 적용한다.

## 2. 범위

### 포함

- 기존 `orthanc-a` service/image/network/volume 설정의 실제 기동 확인
- `/system` 인증 및 DICOMweb `/dicom-web/studies` capability probe
- Orthanc A의 host published port 실제 도달성 관찰
- 실행·시험 증거와 현재 상태 문서 동기화

### 제외

- Orthanc B, Synthetic DICOM fixture/seed, API·Worker·Web, DB schema/Migration
- PACS 업무 인가·Consent·Grant 및 제품 E2E PASS 주장
- 기존 사용자 Docker project 또는 기존 volume 삭제·초기화

## 3. 기준선 및 추적성

| 구분 | ID 또는 문서 | 적용 내용 | 구현·시험 연결 |
|---|---|---|---|
| 요구사항 | `IMPLEMENTATION-PLAN.md` §9 `MEDIQ-ENV-005`; `P0-DEVELOPER-BASELINE.md` §5 | A Test Orthanc readiness와 DICOMweb capability | Compose service `orthanc-a`, health/system and QIDO probe |
| 보안 | `AGENTS.md` §§4, 8; `SECURITY-REQUIREMENTS.md` DICOMweb security; `THREAT-MODEL.md` source PACS boundary | Test-only, no PHI, no credentials in evidence, authentication required | unauthenticated rejection and authenticated capability test |
| API·도메인 | `DICOM-INTEROPERABILITY-PROFILE.md` §§2, 8–9, 16; `SYSTEM-ARCHITECTURE.md` DICOMweb Adapter | Orthanc serves standards-based DICOMweb; client access remains MediQ backend responsibility | DICOMweb endpoint probe only; no product API claim |
| Acceptance | `P0-EXECUTION-SCHEDULE.md` PLAN-01; `DICOM-INTEROPERABILITY-PROFILE.md` DICOM-INT-001/002/003 | Environment prerequisite, not full DICOM Acceptance | empty-store QIDO and endpoint/auth readiness; fixture-dependent checks remain ENV-007 |

## 4. 구현 결과

Digest-pinned Orthanc Team image를 받아 Hospital A만 기동했다. Orthanc core `1.13.0`, DICOMweb plugin `dicom-web`, AET `MEDIQA`를 runtime에서 확인했다. 컨테이너 aliveness와 병원 A network 안에서 unauthenticated·잘못된 인증 거부 및 인증된 QIDO-RS를 검증했다. QIDO는 빈 저장소에 `application/dicom+json`과 0 Study를 반환했다.

Compose의 A host port publish는 이 Docker 환경에서 실제 binding을 만들지 않았고 host와 container IP 모두에서 도달할 수 없었다. A에 불필요한 host port 선언을 제거하고, A 전용 container network를 통해서만 접근하도록 고쳤다. Orthanc image의 공식 `/probes/test-aliveness.py`를 Compose healthcheck로 사용한다.

## 5. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `infra/docker-compose.yml` | Hospital A aliveness healthcheck 추가, A host port publish 제거 |
| `.env.example` | 더 이상 사용하지 않는 A host port 변수 제거 |
| `scripts/validate-compose-baseline.ps1` | A no-host-port 및 aliveness probe config assertion 추가 |
| `scripts/test-orthanc-a.ps1` | A runtime/auth/DICOMweb/network probe 재현 스크립트 추가 |
| `infra/README.md` | 실제 A network reachability와 Ticket 증거 안내 |
| `docs/implementation/MEDIQ-ENV-005/*` | Ticket 구현·시험 증거 |
| 기준선·현황 문서 | A runtime 상태 및 다음 ENV Ticket으로 동기화 |

## 6. 영향 분석

### Architecture

- Local Test Orthanc A service only; existing PostgreSQL remains running and unchanged.

### API·Data

- No schema, API, domain model, or patient data changes.

### Security·Privacy

- Synthetic/Test only. Verify HTTP auth; never record local credentials or PHI. This Ticket does not implement MediQ authorization or audit controls.

## 7. 실행 및 검증 요약

- 상세 명령과 결과: [TEST-EVIDENCE.md](TEST-EVIDENCE.md)
- 검증 결론: `PASS` — ENV-005 Hospital A runtime/readiness scope only.

## 8. 변경하지 않은 사항

- Orthanc B, DICOM fixture, app integration, and full P0 Acceptance remain later Tickets.

## 9. 결정 및 예외

- The official Orthanc Team image probe `/probes/test-aliveness.py` is used for container health. The DICOMweb plugin and `/dicom-web/` root follow the [Orthanc Team Docker image documentation](https://orthanc.uclouvain.be/book/users/docker-orthancteam.html) and [Orthanc DICOMweb documentation](https://orthanc.uclouvain.be/book/plugins/dicomweb.html).
- Host port reachability is recorded as observed on this Docker environment only; A is kept on its internal service network and no general host-network behavior is inferred.

## 10. 잔여 위험과 후속 작업

- A is deliberately not host-published. Future API/Worker containers must join the approved `hospital-a` network; app-to-PACS configuration is still an ENV-008 concern.
- Empty Orthanc does not prove fixture-backed QIDO/WADO interoperability; ENV-007 and DICOM integration tests remain required.

## 11. 최종 판정

```text
Ticket: MEDIQ-ENV-005
Scope: Hospital A Test Orthanc runtime and empty-store DICOMweb readiness
Changed: A aliveness healthcheck, removal of ineffective A host-port declarations, repeatable A probe, test evidence and status documents
Not changed: Orthanc B, DICOM seed, app services, DB schema, product authorization, full P0 E2E
Security impact: Test-only synthetic environment; authentication verified; no secret or patient payload in evidence
Tests executed: Compose config validator, Orthanc aliveness, unauthorized/invalid/valid auth, plugin and QIDO checks, network/port boundary; see TEST-EVIDENCE.md
Tests not executed: Fixture-backed QIDO/WADO, STOW, A→B, MediQ authorization and Phase 0 Acceptance
Evidence: TEST-EVIDENCE.md
Implementation record: IMPLEMENTATION-REPORT.md
Remaining risks: Empty-store capability does not prove DICOM payload interoperability; B and app-to-PACS path remain unverified
Status: PASS (MEDIQ-ENV-005 scope only; Phase 0 remains NOT RUN/BLOCKED)
```

## 12. 변경 이력

| 날짜 | 상태 | 내용 |
|---|---|---|
| 2026-09-29 | `PASS` | Hospital A startup/aliveness/authenticated empty-store QIDO verified; ineffective A host port declarations removed |
