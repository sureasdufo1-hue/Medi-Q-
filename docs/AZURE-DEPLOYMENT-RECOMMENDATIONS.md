# MediQ Azure Deployment Recommendations

**Project:** MediQ  
**Document Type:** Architecture Recommendation  
**Status:** RECOMMENDED / NON-NORMATIVE  
**Default Classification:** POST-MVP  
**Last Updated:** 2026-09-19

---

# 1. 문서 목적

본 문서는 기존 Highpass Azure 구상에서 MediQ에 재사용할 수 있는 내용을 검토하여, 학교 캡스톤 환경과 향후 실제 병원 연계를 위한 Azure 배포 권고사항으로 정리한다.

이 문서는 Azure 도입을 승인하거나 현재 `CAPSTONE-P0` 완료조건을 변경하지 않는다. 현재 P0의 기준 배포는 Docker Compose와 Hospital A/B Test Orthanc이며, Azure는 별도 Scope Decision과 Ticket 승인 후 적용하는 선택적 배포 프로파일이다.

규범 문서와 충돌할 때는 다음 문서가 우선한다.

```text
CAPSTONE-MVP-BOUNDARY
  → PRODUCT-BASELINE / REQUIREMENTS / SECURITY-REQUIREMENTS
  → DOMAIN / DATA / SYSTEM ARCHITECTURE / OPENAPI
  → 본 권고안
```

Legacy Highpass 명칭, 권한 모델 또는 설계는 MediQ의 Normative Source가 아니다.

---

# 2. 권고 결론

Highpass Azure 구상의 다음 방향은 MediQ와 일치하므로 채택 후보로 권고한다.

- Hospital PACS를 의료영상 Source of Record로 유지한다.
- Azure는 인증, 인가, 동의, Viewer/Transfer 조정 및 단기 Temporary Processing만 담당한다.
- Control Plane과 Imaging Data Plane을 분리한다.
- 사용자, 병원 시스템 및 Azure 서비스 Identity를 분리한다.
- Temporary Object는 암호화하고 Tenant/Session/Study에 binding하며 TTL 이후 삭제 증거를 남긴다.
- Managed Identity, Key Vault, Infrastructure as Code 및 중앙 모니터링을 사용한다.

다음 항목은 원안 그대로 채택하지 않고 MediQ 기준으로 수정해야 한다.

- Azure를 로컬 P0 환경보다 먼저 구축하지 않는다.
- Cloud ingress에 mTLS를 적용하는 것만으로 병원 내부 PACS 연결이 해결되었다고 보지 않는다.
- `dicom:query/read/transfer` 대신 MediQ의 canonical scope를 사용한다.
- One-Time Transfer Token을 독립적인 인가원으로 만들지 않는다.
- `mobile-package` 저장소를 장기 영상 백업이나 Key Escrow로 사용하지 않는다.
- 병원 의료진과 환자를 하나의 동일한 Identity Assurance 모델로 취급하지 않는다.
- PostgreSQL RLS나 네트워크 위치를 애플리케이션 Authorization의 대체재로 사용하지 않는다.

---

# 3. 범위 분류 권고

| 항목 | 권고 분류 | 비고 |
|---|---|---|
| Docker Compose + Test Orthanc A/B | CAPSTONE-P0 | 현재 승인 기준 유지 |
| Consent·Authorization·Grant·DICOMweb·Audit E2E | CAPSTONE-P0 | Azure와 무관한 제품 완료조건 |
| Azure Student 배포 프로파일 | POST-MVP | 기본 권고 |
| 평가 필수 Azure 배포 | CAPSTONE-P0 후보 | Scope Decision 선행 필요 |
| Mobile Secure Vault | CAPSTONE-P1 | Android 우선 기준 유지 |
| 실제 병원 VPN/Outbound Connector/PKI | PRODUCTIONIZATION | 실제 병원망 연계 |
| WAF·APIM·SIEM·HA/DR | PRODUCTIONIZATION | 운영 보안·가용성 |
| Audit Hash Chain/WORM | PRODUCTIONIZATION | 기본 Audit 이후 강화 |

Azure를 CAPSTONE-P0로 승격하더라도 로컬 재현 가능한 Docker Compose Acceptance 환경을 제거하지 않는다.

---

# 4. 권장 배포 프로파일

## 4.1 Profile A — Local P0 Reference

```text
Developer/Demo Host
  ├── MediQ API
  ├── MediQ Worker
  ├── Web/Cloud Viewer
  ├── PostgreSQL
  ├── Hospital A Test Orthanc
  └── Hospital B Test Orthanc
```

- Synthetic/Test/De-identified DICOM만 사용한다.
- P0 Golden Path와 Security Negative Test의 기준 환경이다.
- `MEDIQ-ENV-002`와 후속 P0 Ticket을 우선한다.

## 4.2 Profile B — Azure Student Demonstration

```text
Browser / Mobile Web
  → Azure-hosted Web UI
  → MediQ API / Authorization Gateway
  → MediQ Viewer or Transfer Worker
  → Test-only DICOM Connectivity
  → Hospital A/B Test Orthanc
```

권장 Azure 자원 매핑:

| 역할 | 권장 후보 |
|---|---|
| Web UI | Static Web Apps 또는 동등한 정적 호스팅 |
| API/Authorization Gateway | Azure Container Apps |
| Transfer/Viewer Worker | 내부 ingress 또는 비공개 Container Apps |
| Container Registry | Azure Container Registry |
| Metadata/Audit DB | Azure Database for PostgreSQL Flexible Server |
| Temporary Object | Azure Blob Storage |
| Secret/KEK/Certificate Reference | Azure Key Vault |
| Service Identity | Managed Identity |
| Log/Metric | Azure Monitor/Application Insights |
| IaC | Bicep 또는 동등한 선언형 IaC |

이 프로파일에서도 실제 환자정보, 실제 병원 Credential 및 운영 DICOM을 사용하지 않는다. 비용·리전·Quota·무료 제공 범위는 배포 시점에 다시 확인하며 공식 제품 요구사항으로 고정하지 않는다.

## 4.3 Profile C — Production Hospital Connectivity

다음 중 승인된 연결 방식을 사용한다.

1. **권장:** Hospital-side Connector가 Azure로 outbound authenticated channel을 수립한다.
2. Site-to-Site VPN 또는 승인된 Private Network를 사용한다.
3. 기관 보안정책에 맞는 전용회선 또는 관리형 연결을 사용한다.

실제 PACS를 공용 인터넷에 직접 노출해서는 안 된다. Public endpoint의 mTLS는 endpoint 인증 통제이며 사설 PACS로 가는 네트워크 경로를 대신하지 않는다.

---

# 5. Viewer 권고사항

Cloud Viewer는 다음 경로를 유지한다.

```text
Browser/Mobile Web
  → MediQ Backend Authorization Gateway
  → short-lived Viewer Session
  → Hospital Connector
  → Source PACS WADO-RS
  → 필요한 Study/Series/Instance/Frame 점진적 전달
```

- Browser/Mobile Client는 PACS endpoint를 직접 호출하지 않는다.
- PACS credential, internal storage reference 또는 raw upstream token을 클라이언트에 전달하지 않는다.
- Viewer Session은 Actor, Tenant, PatientReference, Source Hospital, Study, Grant 및 expiry에 binding한다.
- Viewer URL, Viewer Session ID 또는 DICOM UID는 단독 접근권한이 아니다.
- Viewer 응답은 `private, no-store`를 적용하고 CDN·Service Worker·Proxy의 영구 캐시를 금지한다.
- Source PACS 장애 시 영구 Cloud Copy로 대체하지 않고 Fail Closed한다.
- Viewer의 streaming은 video streaming이 아니라 WADO-RS 기반 on-demand/progressive retrieval이다.

---

# 6. Identity와 Authorization 권고사항

## 6.1 Identity 분리

| 주체 | 권장 Identity 경계 |
|---|---|
| 병원 의료진 | 병원 조직 계정/Federation 또는 Workforce Identity |
| 환자 | 별도 Patient Identity/CIAM Adapter |
| 병원 Connector | X.509 인증서 + Hospital Registry binding |
| Azure 내부 서비스 | Managed Identity |

CAPSTONE-P0의 Synthetic Patient 로그인은 실제 환자 본인확인 완료를 의미하지 않는다.

## 6.2 Canonical Action/Scope

Azure 배포에서도 다음 MediQ scope를 유지한다.

```text
study:view
study:download
study:pacs-transfer
study:mobile-export
```

`VIEW`, `DOWNLOAD`, `PACS_IMPORT`, `MOBILE_EXPORT` 권한은 서로 자동 승격하지 않는다.

## 6.3 One-Time Transfer Credential

One-Time Transfer Token이 필요한 경우 다음처럼 정의한다.

> 승인된 Scoped Transfer Grant를 실행하는 짧은 수명의 1회용 실행 자격 증명이며 새로운 권한을 부여하지 않는다.

Transfer Grant 참조, source/destination tenant, patient/study, action, expiry, `jti` 또는 nonce, consumption 상태 및 idempotency context에 binding한다. 재사용과 replay는 거부하고 Audit Event를 남긴다.

---

# 7. Temporary Storage와 Mobile Package 권고사항

## 7.1 Cloud Temporary Object

- 기본 경로는 memory/streaming pipeline이다.
- retry나 packaging 때문에 객체 저장이 필요한 경우에만 Temporary Blob을 사용한다.
- AES-256-GCM 등 승인된 인증 암호와 envelope encryption을 적용한다.
- DEK는 객체별 또는 승인된 package 단위로 생성하고 KEK/Key Version Reference로 wrapping한다.
- Tenant, Session, Patient, Study 및 목적에 binding한다.
- TTL, 최대 크기, lifecycle purge 및 purge evidence를 필수로 한다.
- Key Vault에는 Secret, KEK 및 key reference만 두고 DICOM이나 plaintext DEK를 저장하지 않는다.

## 7.2 Mobile Package

`mobile-package` 저장소를 도입한다면 모바일 다운로드 준비를 위한 단기 staging으로만 사용한다.

- Persistent Cloud Backup 금지
- Device Private Key/Vault KEK Escrow 금지
- Cross-device restore source 사용 금지
- 다운로드 완료 또는 TTL 만료 후 삭제
- 분실·교체 시 Source PACS에서 재승인·재다운로드

P1 Mobile Vault의 장기 저장 주체는 환자 단말이며 MediQ Cloud가 아니다.

---

# 8. 데이터베이스와 감사 권고사항

## 8.1 PostgreSQL RLS

RLS는 Tenant Isolation의 defense-in-depth 후보로 권고하지만 애플리케이션 Authorization을 대체하지 않는다.

도입 전 다음 설계를 승인해야 한다.

- transaction-scoped tenant context
- connection pool 반환 시 context reset
- service/admin role의 RLS bypass 통제
- tenant context 누락 시 Fail Closed
- cross-tenant negative test
- migration과 rollback 계획

## 8.2 Audit Hash Chain

기본 P0 Audit가 먼저이며 Hash Chain/WORM은 PRODUCTIONIZATION 권고사항이다. 도입 시 canonical serialization, tenant별 또는 global chain 범위, sequence/locking, retry/idempotency, HMAC/외부 anchor와 검증·복구 절차를 별도 결정한다.

---

# 9. Azure 보안 권고사항

- 인터넷 노출 컴포넌트를 최소화하고 Worker와 Database는 가능한 한 비공개 경계에 둔다.
- 병원 Connector 경계에는 TLS 검증과 가능하면 mTLS를 적용한다.
- mTLS 인증서 전달 헤더는 신뢰 가능한 ingress가 생성·정규화한 경우에만 사용하고 애플리케이션에서 인증서와 Hospital Registry binding을 검증한다.
- Managed Identity를 우선하고 장기 Service Credential을 컨테이너 이미지나 환경 파일에 포함하지 않는다.
- Blob public access를 비활성화하고 짧은 수명의 최소권한 접근만 허용한다.
- Database와 Storage 접근은 Tenant/Session/Resource binding을 다시 검증한다.
- Image Scan, dependency scan 및 IaC validation을 CI에 포함한다.
- 로그에 DICOM Payload, Secret, PACS Credential, raw token 또는 불필요한 환자정보를 기록하지 않는다.
- Budget Alert, log retention/cap 및 teardown 절차를 정의한다.

네트워크 내부성, VPN 또는 mTLS만으로 사용자·Tenant·Consent·Grant 검증을 생략해서는 안 된다.

---

# 10. 도입 전 Decision Gates

다음 조건이 충족되기 전 Azure 구현 Ticket을 시작하지 않는 것을 권고한다.

1. Repository 기준 커밋과 변경 추적 가능성 확보
2. `MEDIQ-ENV-002` 로컬 재현 환경 완료
3. Hospital A → MediQ → Hospital B 로컬 Golden Path PASS
4. Security Negative Acceptance PASS
5. Azure 배포의 범위 분류와 예산 승인
6. Test PACS 연결 방향 결정
7. Identity Provider와 Patient Identity 경계 결정
8. Temporary Blob TTL·암호화·삭제 증거 설계 승인
9. IaC와 teardown 검증

---

# 11. 권장 후속 Ticket

| Ticket | 분류 | 내용 | 선행조건 |
|---|---|---|---|
| MEDIQ-CLOUD-001 | POST-MVP | Azure Deployment ADR 및 Scope Decision | Local P0 E2E |
| MEDIQ-CLOUD-002 | POST-MVP | Bicep 기반 최소 Azure Landing Zone | MEDIQ-CLOUD-001 |
| MEDIQ-CLOUD-003 | POST-MVP | Managed Identity/Key Vault/Secret 경계 | MEDIQ-CLOUD-002 |
| MEDIQ-CLOUD-004 | POST-MVP | Encrypted Temporary Blob TTL/Purge | MEDIQ-CLOUD-003 |
| MEDIQ-CLOUD-005 | POST-MVP | Test Orthanc Connectivity PoC | MEDIQ-CLOUD-002 |
| MEDIQ-CLOUD-006 | POST-MVP | Azure E2E 및 Security Negative Test | MEDIQ-CLOUD-003~005 |
| MEDIQ-CONN-001 | PRODUCTIONIZATION | Hospital-side Outbound Connector/VPN 결정 | 실제 기관 협의 |
| MEDIQ-RLS-001 | POST-MVP | PostgreSQL RLS 설계·Migration·Pool Isolation Test | Core DB 안정화 |
| MEDIQ-AUD-HARDEN-001 | PRODUCTIONIZATION | Audit Hash Chain/WORM/SIEM | P0 Audit PASS |

평가 요구로 Azure가 필수가 되면 Ticket 분류를 조용히 변경하지 않고 `CAPSTONE-MVP-BOUNDARY.md`의 Scope Decision을 먼저 개정한다.

---

# 12. 문서 변경 영향

- Azure 배포 승인 시 `CAPSTONE-MVP-BOUNDARY.md`를 먼저 개정한다.
- 컴포넌트와 연결 경로는 `SYSTEM-ARCHITECTURE.md`와 `DATA-FLOW.md`에 반영한다.
- 보안 통제는 `SECURITY-REQUIREMENTS.md`와 `THREAT-MODEL.md`를 함께 개정한다.
- 인증서, wrapped DEK metadata, RLS context 등을 영속화할 때만 `DATA-MODEL.md`, `ERD.md` 및 Migration을 개정한다.
- 서비스 배치만 바뀌고 외부 업무행위가 같으면 `OPENAPI.yaml`은 변경하지 않는다.
- API action/scope 또는 응답이 바뀌면 OpenAPI와 Acceptance Test를 동시에 개정한다.

---

# 13. 현재 결정 상태

```text
Azure Deployment Profile: RECOMMENDED, NOT APPROVED
Default Classification: POST-MVP
Current P0 Deployment Baseline: Docker Compose
Current P0 Test PACS: Hospital A/B Test Orthanc
Actual Hospital Connectivity: PRODUCTIONIZATION
Normative API/Scope Change: NONE
Implementation Authorization: NONE
```

---

# 14. 참고자료

- Microsoft, Azure Container Apps client certificate authentication
  - <https://learn.microsoft.com/en-us/azure/container-apps/client-certificate-authorization>
- Microsoft, Azure Container Apps virtual network configuration
  - <https://learn.microsoft.com/en-us/azure/container-apps/vnet-custom>
- Microsoft, Azure API Management private endpoint
  - <https://learn.microsoft.com/en-us/azure/api-management/private-endpoint>
- Microsoft, Azure for Students
  - <https://azure.microsoft.com/en-us/free/students>

외부 서비스의 가격, 무료 한도, 지원 SKU, 네트워크 제약 및 리전 가용성은 변경될 수 있으므로 실제 배포 Ticket 시작 시 공식 문서를 다시 확인한다.
