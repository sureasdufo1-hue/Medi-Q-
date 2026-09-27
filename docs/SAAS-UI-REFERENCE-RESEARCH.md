# MediQ SaaS UI/UX Reference Research

**Project:** MediQ  
**Document ID:** MEDIQ-SAAS-UI-REF-001  
**Classification:** RESEARCH / NON-NORMATIVE  
**Status:** Reference Research — Not an Approved Product Baseline  
**Implementation:** NOT IMPLEMENTED  
**Test Status:** NOT RUN  
**Last Updated:** 2026-09-24  
**Owner:** MediQ Product, UX, Security & Architecture

---

# 1. 목적과 사용 제한

본 문서는 공개된 SaaS·의료영상·보안 제품의 UI/UX 패턴을 조사하여 `SAAS-SCREEN-DESIGN-SPEC.md`의 79개 화면에 적용·변형·제외할 후보를 제시한다. 외부 제품은 참고자료일 뿐 MediQ의 요구사항, 보안정책 또는 API 계약을 변경하는 근거가 아니다.

- 기준선 우선순위는 `PRODUCT-BASELINE.md`, `CAPSTONE-MVP-BOUNDARY.md`, `REQUIREMENTS.md`, `SECURITY-REQUIREMENTS.md`, `SYSTEM-ARCHITECTURE.md`, `DATA-FLOW.md`, `OPENAPI.yaml`, `THREAT-MODEL.md`를 따른다.
- Hospital PACS는 Source of Record이며 MediQ Cloud는 Permanent PACS가 아니다.
- Browser는 PACS endpoint나 credential을 받지 않는다.
- Consent, Authorization, Transfer Grant, QR Claim, 환자 승인, PACS Import 완료는 각각 다른 상태다.
- 외부 사례가 이 원칙과 충돌하면 점수가 높아도 `ADAPT` 또는 `REJECT`한다.
- 공개 화면 이미지는 저장소에 복제하지 않았다. 아래 링크와 자체 관찰만 기록했다.
- 본 조사에는 실제 환자정보가 포함된 자료를 수집하거나 저장하지 않았다.

# 2. 조사 방법과 결과 요약

2026-09-24 현재 로그인 없이 접근 가능한 공식 문서·사용 가이드·제품 페이지를 우선 확인했다. 검색 결과 페이지가 아닌 실제 페이지를 출처로 사용했으며, 화면이 문서에서 확인되지 않거나 동작을 직접 검증하지 못한 사항은 추론으로 구분했다.

| 항목 | 결과 |
|---|---:|
| 유효 Reference | 26 |
| 공식 자료 | 26 |
| 비공식 Concept | 0 |
| 운영 주체 | 15 |
| 제품 유형 | 6 |
| 의료영상 Viewer/PACS | 6 |
| Consent·의료정보 교환 | 4 |
| Enterprise SaaS·Workflow | 5 |
| Audit·Provenance | 3 |
| QR·Pairing | 4 |
| Admin·Connector·Health | 4 |
| MediQ 화면 ID 연결 | 79 / 79 |
| 등급 | ADOPT 7 / ADAPT 15 / STUDY ONLY 4 / REJECT 0 |

`REJECT 0`은 충돌 패턴이 없다는 뜻이 아니다. 각 Reference에서 직접 PACS 연결, URL 식별자 기반 접근, QR 즉시 승인, 광범위 환자 검색 등 금지 요소를 분리하여 명시적으로 제외했다. Reference 전체를 폐기하기보다 안전한 하위 패턴만 채택하는 방식이다.

# 3. 평가 척도

점수 순서는 `업무 적합성/의료영상 Workflow/보안 상태 전달/Multi-tenant Context/오류·만료·거부 UX/접근성/구현 현실성/MVP 적합성`이며 각 1~5점이다. 총점은 참고값이며 보안 불변조건보다 우선하지 않는다.

| Ref ID | 제품 | 유형 | 참고 화면 | 점수 | 장점 | 주요 위험 | MediQ 대상 | 결정 |
|---|---|---|---|---|---|---|---|---|
| REF-IMG-01 | OHIF Study List | 의료영상 | Study list/summary | 5/5/3/2/3/4/5/5 | 표·필터·Series 요약 | 일반 환자 전체검색 전제 | 020~026 | ADAPT |
| REF-IMG-02 | OHIF Modes | 의료영상 | Mode 선택/Viewer layout | 4/5/3/1/3/3/4/4 | 업무별 Viewer 구성 | URL route가 권한처럼 오인될 수 있음 | 040~047 | ADAPT |
| REF-IMG-03 | OHIF Toolbar | 의료영상 | Viewer toolbar | 4/5/3/1/3/4/5/5 | 표준 영상 조작 | 진단 기능 과확장 | 042~044 | ADOPT |
| REF-IMG-04 | Cornerstone3D | 의료영상 | Rendering/tool groups | 4/5/3/1/3/3/4/4 | 점진 렌더링 기반 | 완성 UI가 아님 | 041~046 | ADAPT |
| REF-IMG-05 | Orthanc Explorer 2 | PACS UI | Study browser/config | 3/5/2/2/3/3/4/4 | 단순한 Study 중심 IA | PACS 직접 관리·공유 패턴 | 021~026, ADM | STUDY ONLY |
| REF-IMG-06 | Google Cloud DICOM Viewer 연동 | Cloud imaging | Worklist/viewer 연동 | 4/5/4/3/3/3/4/4 | DICOMweb+OAuth 경계 | 공급자 역할을 그대로 복제할 수 없음 | 022, 040~047 | ADAPT |
| REF-CON-01 | Epic Share Everywhere | 의료정보 공유 | 일회성 공유 코드 | 5/2/4/2/4/3/4/4 | 환자 주도·시간 제한 | 코드+생년월일 모델의 단순 이식 | 030~039, QR | ADAPT |
| REF-CON-02 | Entra Consent Request Review | 승인 Workflow | 요청 검토·승인·거부 | 4/1/5/4/5/4/5/5 | Requester/permission/결정 분리 | 앱 권한 Consent와 의료동의는 다름 | 030~039 | ADAPT |
| REF-CON-03 | Entra Consent Workflow Config | 승인 Workflow | Reviewer/expiry 설정 | 3/1/5/5/4/3/4/3 | 승인자·만료 정책 | Tenant-wide 승인 개념 오용 | 031, 036~039, ADM | STUDY ONLY |
| REF-CON-04 | NHS App Data Sharing Decision | 환자 선택 | 현재 선택·변경·제출 | 4/1/4/1/3/4/4/3 | 현재 상태와 변경 절차 | 연구·계획 공유와 진료 목적 혼동 | 032~035 | STUDY ONLY |
| REF-SAA-01 | Azure Directory/Subscription Switcher | Multi-tenant | Context switch/filter | 5/1/4/5/3/4/5/5 | Header context 지속성 | 선택이 권한을 만든다는 오해 | 001~006, 010 | ADOPT |
| REF-SAA-02 | Auth0 Organizations | B2B SaaS | Organization list/detail | 4/1/4/5/3/3/5/4 | 조직 단위 branding·membership | Auth0 모델을 Domain 모델로 대체 | 003, ADM-001~003 | ADAPT |
| REF-SAA-03 | Auth0 My Organization | Delegated admin | 조직 범위 관리 | 4/1/5/5/3/3/4/3 | 고객별 관리 경계 | Early Access/API 의존 | ADM-001~003 | STUDY ONLY |
| REF-SAA-04 | AWS Step Functions Execution | Workflow monitor | Graph/table/step details | 5/1/4/3/5/4/4/4 | 단계·실패·재시도 시각화 | 입력·출력 원문 노출 | 015, 060~070 | ADAPT |
| REF-SAA-05 | Azure Data Factory Monitor | Job monitor | Run list/activity/Gantt | 5/1/4/3/5/4/5/4 | 상태 필터·오류·재실행 | 임의 재실행이 중복 STOW 유발 | 010~016, 064~070 | ADAPT |
| REF-AUD-01 | GitHub Organization Audit Log | Audit | 검색·필터·Export | 4/1/4/4/4/4/5/5 | who/what/when | 원문 event를 병원 사용자에게 과노출 | 080, 083~085 | ADOPT |
| REF-AUD-02 | AWS CloudTrail Event History | Audit | Event table/detail/compare | 4/1/5/4/4/4/5/4 | Filter·detail·export 분리 | JSON/리소스명 민감 노출 | 080, 083~085 | ADAPT |
| REF-AUD-03 | Microsoft Purview Lineage | Provenance | Node-edge lineage | 5/1/4/3/3/4/4/4 | Source→Process→Destination | 복잡한 그래프·메타데이터 과노출 | 081~082 | ADAPT |
| REF-QR-01 | GitHub OAuth Device Flow | Device authorization | User code/expiry/poll | 4/1/4/1/5/3/5/4 | claim과 승인 완료 분리 | OAuth token 발급 흐름 그대로 사용 | QR-001~010 | ADAPT |
| REF-QR-02 | Microsoft Authenticator Number Match | Cross-device approval | Number challenge | 4/1/5/2/4/4/5/4 | 승인 대상 상호 확인 | 단순 Approve/Reject로 의료동의 대체 | QR-005~010 | ADAPT |
| REF-QR-03 | Signal Linked Devices | QR pairing | Scanner/linked device list | 4/1/4/1/4/4/5/4 | 생체인증 후 Scan·unlink | Scan 즉시 신뢰 형성 | QR-001~007 | ADAPT |
| REF-QR-04 | Google Passkey Cross-device | QR auth | QR+근접성+기기 unlock | 4/1/5/1/4/4/5/3 | QR 뒤 기기 검증 | 인증을 Consent/Grant로 확대 해석 | QR-001~010 | ADAPT |
| REF-ADM-01 | Entra Private Network Connectors | Connector admin | Health/list/detail | 5/1/5/5/5/3/4/3 | heartbeat·상태·version | 제품별 운영값 복제 | ADM-004~007 | ADOPT |
| REF-ADM-02 | Cloudflare Tunnel Observability | Connector health | Healthy/degraded/inactive | 4/1/4/4/5/4/5/3 | 상태+권장 조치 | `Healthy`를 E2E 보안 PASS로 오인 | ADM-004, 007, 010 | ADOPT |
| REF-ADM-03 | HashiCorp Vault PKI Rotation | Certificate admin | Rotation lifecycle | 4/1/5/4/4/3/4/2 | 회전 절차 분리 | UI 사례가 제한적 | ADM-006 | ADOPT |
| REF-ADM-04 | Azure Service Health | Operations | Incident list/detail | 4/1/4/5/5/4/5/3 | 영향범위·severity·timestamp | 공급자 장애와 병원 장애 혼합 | 006, ADM-010 | ADOPT |

# 4. Reference 상세 분석

## 4.1 의료영상 Viewer와 PACS

### REF-IMG-01 — OHIF Study List

- **제품/운영/유형:** OHIF Viewer / Open Health Imaging Foundation / Open-source Web DICOM Viewer, 공식·실제 제품.
- **URL/확인일/공개성:** [Study List](https://docs.ohif.org/user-guide/) / 2026-09-24 / 공개.
- **관찰 화면·Component·Navigation:** Study table, filter, pagination, Study summary, Series 정보, Viewer mode 진입.
- **상태·오류·접근성:** 결과 수 제한과 필터가 명시되지만 MediQ의 거부·만료·PACS 장애 UX 증거는 부족하다. 문서에서 keyboard/accessibility 완성도는 확인하지 못했다.
- **보안 장점/위험:** bounded list와 modality 기반 mode 선택은 유용하다. Patient Name·MRN·Accession 전체검색은 MediQ P0의 Exchange-bound 조회에 적용하지 않는다.
- **MediQ 적용:** `SAAS-SCR-022~025`, `ADAPT`. 표 구조·Series 요약은 채택하고, 서버가 승인한 단일 Exchange/Study projection으로 제한한다.
- **확인된 사실/추론:** 공식 문서는 Study list, filters, pagination, summary, mode launch를 설명한다. MediQ의 최소 metadata 열 구성은 자체 설계가 필요하다는 판단은 추론이다.
- **License/Copyright:** OHIF 코드는 MIT로 안내되나 문서 Screenshot의 별도 재배포 권리는 확인하지 않았다. 링크만 유지한다.

### REF-IMG-02 — OHIF Modes

- **제품/유형:** OHIF Viewer Modes / 의료영상 작업별 Viewer 구성, 공식·실제 제품.
- **URL:** [Modes Introduction](https://docs.ohif.org/platform/modes/) (확인 2026-09-24).
- **관찰:** task-specific mode, route, side panel, viewport, toolbar, modality validity 구조.
- **상태/오류:** Study modality에 따라 mode 활성 가능 여부를 구분한다. Authorization denial과 session expiry는 제품 mode와 별개다.
- **보안:** 업무별 최소 도구 세트를 구성하기 좋지만 route 또는 mode ID를 권한으로 사용하면 안 된다.
- **MediQ 적용:** `SAAS-SCR-040~047`, `ADAPT`; P0 Basic Viewer mode만 노출하고 Viewer Session guard는 MediQ Backend가 담당한다.
- **확인된 사실/추론:** mode가 특정 업무용 mini-app처럼 구성된다는 점은 확인됨. P0 전용 최소 mode 분리는 MediQ 권고 추론이다.
- **License:** 코드 재사용 전 MIT license와 dependency license를 별도 검토한다. 화면을 복제하지 않는다.

### REF-IMG-03 — OHIF Toolbar

- **제품/유형:** OHIF Basic Viewer Toolbar / 의료영상 조작, 공식·실제 제품.
- **URL:** [Viewer Toolbar](https://docs.ohif.org/user-guide/viewer/toolbar/) (확인 2026-09-24).
- **관찰:** toolbar와 tool group에서 zoom, pan, window/level, stack navigation, reset 등의 작업을 제공한다.
- **상태/오류/접근성:** 영상 도구의 선택 상태는 명확하나 MediQ session countdown과 fail-closed overlay는 별도 설계가 필요하다.
- **보안:** Pixel 조작을 client renderer에 한정할 수 있다. Download·PACS Import를 Viewer 도구와 혼합하지 않는다.
- **MediQ 적용:** `SAAS-SCR-042~044`, `ADOPT`; 도구 구성만 참고하고 MediQ header, Test banner, session 상태를 추가한다.
- **확인된 사실/추론:** 도구 제공은 공식 문서 사실이다. P0 도구 수를 축소해야 한다는 것은 MVP 권고다.
- **License:** 아이콘·문구·배치를 그대로 복제하지 않고 기능 패턴만 참고한다.

### REF-IMG-04 — Cornerstone3D

- **제품/유형:** Cornerstone3D / Web medical imaging rendering library, 공식·실제 소프트웨어.
- **URL:** [Cornerstone3D Overview](https://www.cornerstonejs.org/docs/getting-started/overview/) (확인 2026-09-24).
- **관찰:** viewport, image loader, rendering, tool groups 기반으로 점진적인 영상 표시와 조작을 구성할 수 있다.
- **상태/오류:** library이므로 완성된 PACS 장애·권한 거부·session expiry 화면은 제공하지 않는다.
- **보안:** Viewer rendering component로는 적합하나 network authorization 또는 cache 정책을 대신하지 않는다.
- **MediQ 적용:** `SAAS-SCR-041~046`, `ADAPT`; MediQ Viewer Gateway 외 data source를 금지하고 frame 실패를 session 상태와 분리한다.
- **확인된 사실/추론:** 공식 문서상 rendering/tooling foundation이라는 점은 사실이며, progressive 상태 UI 구성은 구현 추론이다.
- **License:** 라이브러리·codec별 license를 구현 시 재확인한다.

### REF-IMG-05 — Orthanc Explorer 2

- **제품/유형:** Orthanc Explorer 2 / Test PACS 관리 UI, 공식·실제 제품.
- **URL:** [Orthanc Explorer 2](https://orthanc.uclouvain.be/book/plugins/orthanc-explorer-2.html) (확인 2026-09-24).
- **관찰:** Study 중심 목록, configurable UI, theme, permission/sharing integration, remote retrieve/view 관련 기능을 설명한다.
- **상태/오류:** 관리자가 PACS 콘텐츠와 기능을 직접 다루는 관점이다.
- **보안:** Test Orthanc 운영 화면 참고에는 유용하지만 Hospital User가 PACS endpoint를 직접 다루는 패턴은 MediQ에서 금지한다.
- **MediQ 적용:** `SAAS-SCR-021~026`, `SAAS-ADM-004~005`, `STUDY ONLY`; status vocabulary만 참고한다.
- **확인된 사실/추론:** 기능과 configurable UI는 공식 문서 사실이다. MediQ Admin Portal과 분리해야 한다는 것은 기준선에 따른 판단이다.
- **License:** 제품 UI screenshot을 저장소에 복제하지 않는다. Orthanc component license는 도입 시 별도 검토한다.

### REF-IMG-06 — Google Cloud Healthcare DICOM Viewer Integration

- **제품/유형:** Google Cloud Healthcare API / Cloud DICOMweb viewer integration, 공식 제품 문서.
- **URL:** [Integrating a medical viewer](https://docs.cloud.google.com/healthcare-api/docs/how-tos/dicom-viewers) (확인 2026-09-24).
- **관찰:** OHIF·Weasis 같은 Viewer를 DICOM store 및 OAuth/IAM 경계와 연결하는 통합 흐름을 설명한다.
- **상태/오류:** data store 권한과 viewer integration을 분리하지만 MediQ 고유 session expiry UX는 없다.
- **보안:** 인증된 DICOMweb 경계는 참고 가능하다. Cloud DICOM store를 Permanent PACS처럼 사용하는 전제는 MediQ에 적용하지 않는다.
- **MediQ 적용:** `SAAS-SCR-022`, `040~047`, `ADAPT`; MediQ Authorization Gateway와 short-lived Viewer Session으로 치환한다.
- **확인된 사실/추론:** 공식 문서는 viewer integration과 IAM 역할을 설명한다. Source PACS on-demand relay에 맞춘 adapter 설계는 MediQ 추론이다.
- **License:** Google UI/diagram은 링크로만 인용한다.

## 4.2 의료정보 교환과 동의

### REF-CON-01 — Epic Share Everywhere

- **제품/운영/유형:** Share Everywhere / Epic / 환자 주도 의료정보 공유, 공식·실제 제품.
- **URL:** [Share Everywhere FAQ](https://shareeverywhere.epic.com/FAQ) (확인 2026-09-24).
- **관찰:** 환자가 생성한 share code, 수신자의 추가 정보 입력, 일회성·단기 접근, 로그아웃 후 종료 흐름.
- **상태/오류:** 최대 유효시간, 사용 후 재사용 불가, 입력 오류 횟수 제한이 사용자에게 설명된다.
- **보안:** 환자 주도·시간 제한·일회성 패턴은 유효하다. Share code를 MediQ Access Token이나 Consent로 취급해서는 안 된다.
- **MediQ 적용:** `SAAS-SCR-030~039`, `SAAS-QR-001~010`, `ADAPT`; QR은 pairing reference만 담고 claim 뒤 환자가 병원·행위·범위를 다시 승인한다.
- **확인된 사실/추론:** 공식 FAQ의 one-time temporary access 설명은 사실이다. MediQ의 Claim→Consent→Approval→Grant 분리는 자체 기준선 적용이다.
- **License:** 제품 문구·화면을 복제하지 않고 개념만 참고한다.

### REF-CON-02 — Microsoft Entra Admin Consent Request Review

- **제품/유형:** Microsoft Entra / 승인 요청 검토 Workflow, 공식·실제 제품.
- **URL:** [Review admin consent requests](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/review-admin-consent-requests) (확인 2026-09-24).
- **관찰:** Pending queue, 요청자, 앱 상세, 요청 권한, approve/deny/block, 결정 사유를 분리한다.
- **상태/오류:** My Pending과 history를 구분하고 승인 가능한 reviewer 권한을 별도로 검증한다.
- **보안:** 요청과 승인 권한이 분리되는 점은 좋다. 앱 permission consent를 의료정보 Consent 의미로 재사용하지 않는다.
- **MediQ 적용:** `SAAS-SCR-030~039`, `ADAPT`; Consent card, Authorization card, Grant card를 분리하고 각 actor와 expiry를 표시한다.
- **확인된 사실/추론:** review/deny/block 및 requester 상세는 공식 문서 사실이다. 세 카드 구조는 MediQ 추론이다.
- **License:** Microsoft screenshot은 저장하지 않고 URL만 기록한다.

### REF-CON-03 — Microsoft Entra Admin Consent Workflow Configuration

- **제품/유형:** Microsoft Entra / 승인자·만료 정책 관리, 공식·실제 제품.
- **URL:** [Configure admin consent workflow](https://learn.microsoft.com/en-au/entra/identity/enterprise-apps/configure-admin-consent-workflow) (확인 2026-09-24).
- **관찰:** reviewer 지정, 알림, 만료기간, 최소권한 역할, workflow enable/disable.
- **상태/오류:** reviewer 지정만으로 승인 권한이 생기지 않으며 요청 만료를 별도 취급한다.
- **보안:** reviewer와 actual authorization을 분리하는 원칙은 유용하다. Tenant-wide grant 모델은 MediQ Study scope에 맞지 않는다.
- **MediQ 적용:** `SAAS-SCR-031`, `036~039`, `SAAS-ADM-008`, `STUDY ONLY`; expiry·reviewer 표시 방식만 참고한다.
- **확인된 사실/추론:** 구성 옵션은 공식 문서 사실이다. four-eyes 후보 적용은 Productionization 판단이다.
- **License:** 화면 재사용 없이 구조만 참조한다.

### REF-CON-04 — NHS App Health Data Sharing Decision

- **제품/유형:** NHS App / 환자의 데이터 공유 선호 관리, 공식·실제 제품.
- **URL:** [Managing your health data sharing decision](https://www.nhs.uk/nhs-app/help/profile/choosing-your-data-sharing-preferences/) (확인 2026-09-24).
- **관찰:** 현재 선택 확인, 정보 검토, 변경, 제출의 순차 흐름과 언제든 변경 가능함을 설명한다.
- **상태/오류:** 현재 preference와 change action이 구분된다. 기술적 오류 화면은 자료에서 확인하지 못했다.
- **보안:** 선택을 명시적으로 재검토하는 UX는 유용하다. 연구·계획 목적 opt-out을 진료 목적 영상 이동 동의로 해석하면 안 된다.
- **MediQ 적용:** `SAAS-SCR-032~035`, `STUDY ONLY`; active/withdrawn/expired 상태와 철회 영향 설명만 참고한다.
- **확인된 사실/추론:** NHS의 절차는 사실이며 MediQ 동의 version·destination·action 요약은 자체 설계다.
- **License:** NHS 화면·문구는 복제하지 않는다.

## 4.3 Enterprise SaaS와 Workflow

### REF-SAA-01 — Azure Directory and Subscription Switcher

- **제품/유형:** Azure Portal / Multi-tenant Context switch, 공식·실제 제품.
- **URL:** [Filter and view subscriptions](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/filter-view-subscriptions) (확인 2026-09-24).
- **관찰:** 현재 directory, subscription filter, 지속 filter와 일시 filter를 구분한다.
- **상태/오류:** 접근 가능한 directory만 표시하고 context change가 전역 view에 영향을 준다.
- **보안:** 현재 조직을 지속 표시하는 패턴은 적합하다. 선택 UI 자체가 권한을 부여하지 않는다는 점을 MediQ가 더 명시해야 한다.
- **MediQ 적용:** `SAAS-SCR-001~006`, `010`, `ADOPT`; header에 검증된 Tenant/Hospital/Actor를 표시하고 전환 시 cache를 폐기한다.
- **확인된 사실/추론:** directory switch/filter 동작은 공식 문서 사실이다. cache purge는 MediQ 보안 요구다.
- **License:** Azure UI를 복제하지 않고 context pattern만 참고한다.

### REF-SAA-02 — Auth0 Organizations

- **제품/유형:** Auth0 Organizations / B2B multi-tenant identity, 공식·실제 제품.
- **URL:** [Create Organizations](https://auth0.com/docs/manage-users/organizations/configure-organizations/create-organizations) (확인 2026-09-24).
- **관찰:** organization name/display name, branding, metadata, enabled connection을 조직 단위로 관리한다.
- **상태/오류:** API 응답 오류와 conflict를 구분한다.
- **보안:** organization membership 경계는 유용하나 Auth0 Organization이 MediQ Tenant/Hospital Domain 객체를 대체하지 않는다.
- **MediQ 적용:** `SAAS-SCR-003`, `SAAS-ADM-001~003`, `ADAPT`; 인증 context와 의료기관 업무 context를 분리한다.
- **확인된 사실/추론:** organization 생성·branding·connection은 공식 사실이다. 이중 context 표시는 MediQ 추론이다.
- **License:** Auth0 UI 자산을 재사용하지 않는다.

### REF-SAA-03 — Auth0 My Organization

- **제품/유형:** Auth0 My Organization API/UI components / delegated organization administration, 공식 Early Access.
- **URL:** [My Organization API](https://auth0.com/docs/api/myorganization) (확인 2026-09-24).
- **관찰:** 조직 범위의 고객 self-service administration을 별도 API로 제공한다.
- **상태/오류:** Early Access이며 plan·API 활성화 조건이 있다.
- **보안:** organization-scoped admin 경계는 적합하지만 플랫폼 전체 관리자 화면과 병원 관리 화면을 혼합하면 안 된다.
- **MediQ 적용:** `SAAS-ADM-001~003`, `STUDY ONLY`; Hospital Admin Portal 분리 근거로만 참고한다.
- **확인된 사실/추론:** 조직 범위 관리 API라는 점은 사실이다. MediQ role model 적용은 추론이며 아직 API GAP이다.
- **License:** Embeddable UI 사용 여부와 계약 조건은 Productionization에서 재검토한다.

### REF-SAA-04 — AWS Step Functions Execution Details

- **제품/유형:** AWS Step Functions / 장기 Workflow monitor, 공식·실제 제품.
- **URL:** [Viewing execution details](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-view-execution-details.html) (확인 2026-09-24).
- **관찰:** execution summary, graph/table view, step detail, events, failure highlight, retry/redrive history.
- **상태/오류:** In progress, succeeded, failed, aborted 등 상태와 실패 step을 함께 보여준다.
- **보안:** 단계별 증거는 유용하나 원본 input/output JSON을 Hospital User에게 보여주면 PHI·credential 노출 위험이 있다.
- **MediQ 적용:** `SAAS-SCR-015`, `060~070`, `ADAPT`; Preflight→Retrieve→Package→STOW→Verify→Integrity를 안전한 projection으로 표시한다.
- **확인된 사실/추론:** graph/table/step details는 공식 사실이다. MediQ stepper와 `RESULT_UNKNOWN` lane은 자체 설계다.
- **License:** screenshot을 복제하지 않는다.

### REF-SAA-05 — Azure Data Factory Monitor

- **제품/유형:** Azure Data Factory / Pipeline run monitoring, 공식·실제 제품.
- **URL:** [Visually monitor Azure Data Factory](https://learn.microsoft.com/en-us/azure/data-factory/monitor-visually) (확인 2026-09-24).
- **관찰:** run list, status/time filter, activity detail, error, rerun history, Gantt, alerts.
- **상태/오류:** queued/in progress/succeeded/failed/canceled와 activity-level failure를 구분한다.
- **보안:** 진행 복구와 detail drill-down이 유용하다. 일반적인 `Rerun`을 STOW에 적용하면 중복 반입 위험이 있다.
- **MediQ 적용:** `SAAS-SCR-010~016`, `064~070`, `ADAPT`; 재시도는 destination verification 후 missing instance에만 서버가 허용한다.
- **확인된 사실/추론:** monitor 기능은 공식 사실이다. MediQ retry 제한은 DICOM profile에서 도출한 판단이다.
- **License:** Microsoft UI를 복제하지 않는다.

## 4.4 Audit와 Provenance

### REF-AUD-01 — GitHub Organization Audit Log

- **제품/유형:** GitHub Organization Audit Log / Enterprise audit, 공식·실제 제품.
- **URL:** [Reviewing the audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization) (확인 2026-09-24).
- **관찰:** actor, action, timestamp 중심의 목록, 검색/필터, export와 event detail.
- **상태/오류:** 최근 활동을 역시간순으로 탐색하며 관리자 범위를 전제로 한다.
- **보안:** who/what/when 구조는 MediQ Audit에 적합하다. 원문 payload나 다른 Tenant event 노출은 금지한다.
- **MediQ 적용:** `SAAS-SCR-080`, `083~085`, `ADOPT`; 사용자 친화적 activity와 제한된 raw evidence를 역할별로 분리한다.
- **확인된 사실/추론:** 조직 audit 기능은 사실이다. Correlation ID를 1차 검색축으로 추가하는 것은 MediQ 추론이다.
- **License:** GitHub UI/문구는 복제하지 않는다.

### REF-AUD-02 — AWS CloudTrail Event History

- **제품/유형:** AWS CloudTrail / Security audit event console, 공식·실제 제품.
- **URL:** [Viewing recent management events](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events-console.html) (확인 2026-09-24).
- **관찰:** event list, attribute/time filter, configurable columns, event detail, side-by-side compare, CSV/JSON export.
- **상태/오류:** event source/resource/user/time을 분리하고 보존 범위 한계를 명시한다.
- **보안:** 상세 evidence 접근권한과 export 권한을 분리할 수 있다. raw JSON·resource name은 민감정보가 될 수 있다.
- **MediQ 적용:** `SAAS-SCR-080`, `083~085`, `ADAPT`; 기본 화면은 safe projection, 원문 export는 POST-MVP 전용 역할로 제한한다.
- **확인된 사실/추론:** filter/detail/export 기능은 공식 사실이다. 두 단계 audit UI는 MediQ 권고다.
- **License:** AWS screenshot은 링크만 유지한다.

### REF-AUD-03 — Microsoft Purview Lineage

- **제품/유형:** Microsoft Purview / Data lineage visualization, 공식·실제 제품.
- **URL:** [Data lineage user guide](https://learn.microsoft.com/en-us/azure/purview/catalog-lineage-user-guide) (확인 2026-09-24).
- **관찰:** dataset node와 process edge, upstream/downstream 탐색, focus, expand, filter, zoom, asset detail.
- **상태/오류:** 복잡한 graph를 단계적으로 확장하고 현재 asset을 중심으로 표시한다.
- **보안:** Source→Process→Destination provenance 표현에 적합하다. DICOM UID·환자 metadata·object URL은 graph node에 노출하지 않는다.
- **MediQ 적용:** `SAAS-SCR-081~082`, `ADAPT`; Source PACS→Imaging Package→Destination PACS와 integrity evidence만 제한적으로 표시한다.
- **확인된 사실/추론:** node-edge lineage 기능은 공식 사실이다. MediQ 3~5 node 제한은 MVP 권고다.
- **License:** diagram screenshot을 저장하지 않는다.

## 4.5 QR Handoff와 승인 대기

### REF-QR-01 — GitHub OAuth Device Flow

- **제품/유형:** GitHub OAuth Device Flow / Device authorization, 공식·실제 제품.
- **URL:** [Authorizing OAuth apps — Device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) (확인 2026-09-24).
- **관찰:** device code와 user code 분리, verification URI, 15분 expiry 예시, polling interval, 승인·거부·만료 결과.
- **상태/오류:** pending, slow_down, expired, access_denied를 구분한다.
- **보안:** claim과 사용자 승인 완료가 분리되는 상태 모델은 유용하다. OAuth access token 발급 흐름을 의료영상 Grant로 그대로 쓰면 안 된다.
- **MediQ 적용:** `SAAS-QR-001~010`, `ADAPT`; opaque pairing reference, bounded poll, expiry, terminal conflict만 참고한다.
- **확인된 사실/추론:** device flow 단계와 오류는 공식 사실이다. QR scanner 화면으로의 변환은 MediQ 추론이다.
- **License:** 코드·문구를 복제하지 않는다.

### REF-QR-02 — Microsoft Authenticator Number Matching

- **제품/유형:** Microsoft Authenticator / Cross-device approval, 공식·실제 제품.
- **URL:** [How number matching works](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-mfa-number-match) (확인 2026-09-24).
- **관찰:** 시작 화면의 숫자를 승인 기기에서 다시 입력하여 승인 대상을 상호 확인한다.
- **상태/오류:** 단순 push approve보다 명시적인 user interaction을 요구한다.
- **보안:** 잘못된 요청 승인 위험을 낮추는 참고가 된다. Number match는 인증 보조이며 Consent 또는 Grant가 아니다.
- **MediQ 적용:** `SAAS-QR-005~010`, `ADAPT`; pairing reference 일부를 두 화면에 표시하고 병원명·행위·목적 확인을 추가한다.
- **확인된 사실/추론:** number matching 동작은 공식 사실이다. MediQ reference 표시 길이와 방식은 open decision이다.
- **License:** 화면을 복제하지 않는다.

### REF-QR-03 — Signal Linked Devices

- **제품/유형:** Signal / QR device pairing, 공식·실제 제품.
- **URL:** [Linked Devices](https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices) (확인 2026-09-24).
- **관찰:** primary device의 linked devices 목록, 생체인증/기기 unlock 후 scanner, QR scan, link/unlink.
- **상태/오류:** 연결 기기 목록과 해제 경로를 제공한다.
- **보안:** scanner 진입 전 local authentication과 연결 대상 관리가 유용하다. Scan 즉시 신뢰·자료 공개 패턴은 MediQ에서 금지한다.
- **MediQ 적용:** `SAAS-QR-001~007`, `ADAPT`; scanner 진입 보호와 terminal conflict UX만 참고한다.
- **확인된 사실/추론:** 공식 지원 문서의 단계는 사실이다. camera frame 무저장 정책은 MediQ 고유 요구다.
- **License:** Signal QR/UI를 복제하지 않는다.

### REF-QR-04 — Google Passkey Cross-device Sign-in

- **제품/유형:** Google Account Passkeys / QR cross-device authentication, 공식·실제 제품.
- **URL:** [Sign in with a passkey](https://support.google.com/accounts/answer/13548313?hl=en) (확인 2026-09-24).
- **관찰:** PC에 QR 표시, phone scan, Bluetooth 근접성, phone unlock/biometric, 최종 sign-in.
- **상태/오류:** 다른 기기 사용과 기기 소유 검증을 단계화한다.
- **보안:** QR 외에 근접성·기기 unlock을 요구하는 defense-in-depth가 유용하다. 인증 성공을 의료정보 승인으로 확대 해석하면 안 된다.
- **MediQ 적용:** `SAAS-QR-001~010`, `ADAPT`; P1 recent reauthentication 참고만 하고 Bluetooth 요구는 MVP에 도입하지 않는다.
- **확인된 사실/추론:** QR+phone unlock 절차는 공식 사실이다. MediQ에서 미도입 결정은 범위 판단이다.
- **License:** Google UI를 복제하지 않는다.

## 4.6 SaaS Administration, Connector와 Health

### REF-ADM-01 — Microsoft Entra Private Network Connectors

- **제품/유형:** Microsoft Entra Private Network Connector / Connector administration, 공식·실제 제품.
- **URL:** [Private network connectors](https://learn.microsoft.com/en-us/entra/global-secure-access/concept-connectors) (확인 2026-09-24).
- **관찰:** connector list/status, group, machine/version, heartbeat, logs, update와 failover 운영.
- **상태/오류:** active/inactive, heartbeat, version과 troubleshooting 경로를 구분한다.
- **보안:** credential 원문 없이 identity·certificate·health를 관리하는 구조가 유용하다. 제품별 certificate 자동회전 주기를 MediQ 값으로 복제하지 않는다.
- **MediQ 적용:** `SAAS-ADM-004~007`, `ADOPT`; connector identity, last heartbeat, capability, certificate expiry와 안전한 진단만 표시한다.
- **확인된 사실/추론:** connector status와 outbound TLS/certificate 설명은 공식 사실이다. MediQ 필드 집합은 자체 설계다.
- **License:** 관리 화면을 복제하지 않는다.

### REF-ADM-02 — Cloudflare Tunnel Observability

- **제품/유형:** Cloudflare Tunnel / Connector health monitoring, 공식·실제 제품.
- **URL:** [Tunnel observability](https://developers.cloudflare.com/tunnel/observability/) (확인 2026-09-24).
- **관찰:** dashboard/CLI status, Healthy/Inactive/Degraded/Down 의미와 권장 조치, logs/metrics/diagnostics.
- **상태/오류:** 상태마다 operator action을 연결한다.
- **보안:** status와 next action을 함께 보여주는 패턴이 좋다. Network tunnel `Healthy`는 PACS auth, DICOMweb, Consent 또는 E2E PASS를 뜻하지 않는다.
- **MediQ 적용:** `SAAS-ADM-004`, `007`, `010`, `ADOPT`; network, connector, PACS capability, application health를 별도 카드로 분리한다.
- **확인된 사실/추론:** 상태와 진단 기능은 공식 사실이다. 계층형 health card는 MediQ 권고다.
- **License:** Cloudflare UI를 복제하지 않는다.

### REF-ADM-03 — HashiCorp Vault PKI Rotation

- **제품/유형:** HashiCorp Vault PKI / Certificate lifecycle, 공식 제품 문서.
- **URL:** [PKI rotation primitives](https://developer.hashicorp.com/vault/docs/secrets/pki/rotation-primitives) (확인 2026-09-24).
- **관찰:** root/intermediate CA rotation primitives, 새 인증서 발급, 교체, reload/restart의 lifecycle.
- **상태/오류:** rotation을 단일 toggle이 아닌 여러 단계의 운영 절차로 취급한다.
- **보안:** active/next/retiring/revoked 상태 모델에 참고할 수 있다. private key나 full credential을 UI에 표시하면 안 된다.
- **MediQ 적용:** `SAAS-ADM-006`, `ADOPT`; subject, issuer, fingerprint 일부, expiry, rotation status, audit만 표시한다.
- **확인된 사실/추론:** rotation primitive는 공식 사실이다. 구체 UI 배치는 자료 부족으로 MediQ 자체 설계가 필요하다.
- **License:** 제품 문서의 명령과 UI를 무단 복제하지 않는다.

### REF-ADM-04 — Azure Service Health

- **제품/유형:** Azure Service Health / Service incident management, 공식·실제 제품.
- **URL:** [Service issues](https://learn.microsoft.com/en-us/azure/service-health/service-issues-blade) (확인 2026-09-24).
- **관찰:** incident list, severity, status, scope, affected resources, timestamps, recommended action, alert 생성.
- **상태/오류:** 전역 장애와 개인화된 영향 범위를 구분한다.
- **보안:** 최소한의 영향정보와 조치 안내에 적합하다. SaaS, connector, source PACS 장애를 하나의 status로 합치면 원인과 책임이 왜곡된다.
- **MediQ 적용:** `SAAS-SCR-006`, `SAAS-ADM-010`, `ADOPT`; 병원 사용자용 safe message와 운영자용 detail을 분리한다.
- **확인된 사실/추론:** 표시 필드와 filtering은 공식 사실이다. 역할별 메시지 분리는 MediQ 권고다.
- **License:** screenshot은 저장하지 않는다.

# 5. UI Pattern 비교표

| Pattern | Reference | MediQ 적용 화면 | 채택 | MediQ용 변경사항 |
|---|---|---|---|---|
| Header의 현재 Tenant/Hospital | REF-SAA-01, 02 | 001~006, 010~016 | ADOPT | 서버 claim 기반, 전환 시 cache clear |
| Test/Synthetic Banner | 외부 적합 사례 없음 | 모든 P0 | 자체 설계 | 전역 고정, 실제 데이터 오인 방지 |
| Exchange 상태 Timeline | REF-SAA-04, 05 | 012, 015 | ADAPT | Consent/Grant/Transfer lane 분리 |
| Consent·Authorization·Grant 카드 | REF-CON-02, 03 | 030~039 | ADAPT | 한 승인으로 합치지 않음 |
| Study table·summary | REF-IMG-01, 05 | 022~025 | ADAPT | Exchange-bound, 일반 환자검색 금지 |
| Series navigation | REF-IMG-01, 02 | 025, 043 | ADOPT | Viewer Session 후 metadata만 |
| Progressive Viewer loading | REF-IMG-04, 06 | 041~046 | ADAPT | frame/instance 상태와 session 상태 분리 |
| Viewer toolbar | REF-IMG-03, 04 | 042~044 | ADOPT | P0 zoom/pan/WL/reset 중심 |
| Session expiry countdown | REF-QR-01, CON-01 | 041, 045 | ADAPT | 서버 expiry, 0에서 즉시 pixel 제거 |
| Mandatory Preflight checklist | REF-SAA-04 | 062~063 | 자체 변형 | 12개 check, UNKNOWN은 READY 아님 |
| Long-running transfer stepper | REF-SAA-04, 05 | 064~070 | ADAPT | 실제 server state만, 가짜 percent 금지 |
| Result Unknown | REF-SAA-04, 05 | 065~070 | 자체 설계 | destination verify 전 retry 금지 |
| Destination verification card | 직접 사례 없음 | 067 | 자체 설계 | expected/observed와 verified 분리 |
| Integrity evidence card | REF-AUD-03 | 068, 082 | ADAPT | raw DICOM/hash 원문 최소화 |
| Provenance graph | REF-AUD-03 | 081 | ADAPT | Source→Package→Destination 3~5 node |
| Audit event list | REF-AUD-01, 02 | 080, 083~085 | ADOPT | safe projection와 raw evidence 분리 |
| Correlation ID panel | REF-AUD-01, 02 | 005, 006, 084 | ADAPT | stack/endpoint 비노출 |
| QR pairing reference | REF-QR-01, 02 | QR-003~010 | ADAPT | QR payload가 access token이 아님 |
| 환자 승인 대기 | REF-QR-01, CON-01 | QR-005~010 | ADAPT | 승인 전 patient/study/source 비노출 |
| 위험 작업 Confirmation | REF-CON-02, SAA-05 | 034, 038, 063 | ADAPT | immutable destination·scope 재표시 |
| Connector health+next action | REF-ADM-01, 02 | ADM-004~007 | ADOPT | network/PACS/app health 분리 |
| Certificate rotation state | REF-ADM-03 | ADM-006 | ADOPT | private key 비표시, expiry 경고 |
| Incident impact panel | REF-ADM-04 | 006, ADM-010 | ADOPT | Hospital 사용자/운영자 메시지 분리 |

# 6. 화면군 Reference Matrix 요약

개별 79개 화면 매핑은 `SAAS-UI-REFERENCE-MATRIX.md`를 따른다.

| MediQ 화면군 | Primary | Secondary | 핵심 참고 요소 | 금지 요소 |
|---|---|---|---|---|
| 로그인·Context 001~006 | REF-SAA-01 | REF-SAA-02, ADM-04 | 현재 context·안전한 장애 | UI 선택으로 권한 생성 |
| Dashboard·Exchange 010~016 | REF-SAA-05 | REF-SAA-04 | 상태 목록·timeline·복구 | client 추론 success |
| Study 탐색 020~026 | REF-IMG-01 | REF-IMG-05 | table·series summary | 일반 환자검색·PACS 직접접속 |
| Consent·Grant 030~039 | REF-CON-02 | REF-CON-01, 03, 04 | 요청·승인·철회·만료 | Consent=Authorization=Grant |
| Cloud Viewer 040~047 | REF-IMG-03 | REF-IMG-02, 04, 06 | 최소 toolbar·progressive loading | URL/UID 단독 접근권한 |
| Download 050~053 | REF-SAA-05 | REF-QR-01 | 진행·만료·실패 상태 | VIEW Grant 자동승격 |
| PACS Import 060~070 | REF-SAA-04 | REF-SAA-05, AUD-03 | step detail·verify evidence | STOW 응답만으로 완료 |
| QR Hospital Web 001~010 | REF-QR-01 | REF-QR-02, 03, 04 | pairing·countdown·approval separation | QR=token, scan 즉시 PHI 공개 |
| Audit·Provenance 080~085 | REF-AUD-01 | REF-AUD-02, 03 | audit projection·lineage | raw payload·cross-tenant event |
| Tenant·Hospital 관리 ADM | REF-ADM-01 | REF-ADM-02, 03, 04 | connector/cert/health | Hospital User와 Admin 혼합 |

# 7. Gap 분석

| MediQ 화면군 | 공개 Reference 충분성 | 부족한 부분 | 자체 설계가 필요한 항목 |
|---|---|---|---|
| 로그인·Context | 충분 | 의료기관 actor와 Tenant/Hospital 이중 관계 | verified context header, cache purge |
| Dashboard·Exchange | 보통 | 의료영상 교환 단위의 상태 모델 | Consent/Grant/Transfer multi-lane timeline |
| Study 탐색 | 충분 | Exchange-bound 최소 metadata | 일반 환자검색 없는 Study projection |
| Consent·Grant | 부족 | 의료동의·정책인가·행위 Grant의 3분리 | 세 개 status card, version mismatch, fail-closed |
| Cloud Viewer | 충분 | on-demand Source PACS session lifecycle | expiry countdown, revoke 즉시 frame 제거 |
| Download | 보통 | 브라우저 streaming 결과 유실·불명 | `RESULT_UNKNOWN`, 재시도 정책 |
| PACS Import | 부족 | STOW 후 destination verify와 integrity gate | 12-step preflight, unknown/reconcile, dedup |
| QR Hospital Web | 보통 | Claim 후 PHI 비노출 환자 승인 | claim/approve/grant 3단계, immutable destination |
| Audit·Provenance | 충분 | 의료영상 scope에 맞는 최소 evidence | safe audit/raw evidence 분리, 3-node provenance |
| Tenant·Hospital 관리 | 보통 | MediQ connector·PACS capability 조합 | health 계층, certificate, purge evidence |

# 8. 채택 권고 상위 10개

| 순위 | Pattern | Phase | 근거 |
|---:|---|---|---|
| 1 | 서버 검증 Tenant/Hospital Context를 Header에 지속 표시 | P0 필수 | Cross-tenant 오조작 방지 |
| 2 | Consent·Authorization·Grant 분리 Status Card | P0 필수 | 핵심 Domain·Security 불변조건 |
| 3 | Mandatory Preflight checklist에서 UNKNOWN fail-closed | P0 필수 | 잘못된 STOW 차단 |
| 4 | Transfer stepper + `RESULT_UNKNOWN` | P0 필수 | timeout을 success/failure로 오판 방지 |
| 5 | Destination Verification + Integrity completion gate | P0 필수 | `IMPLEMENTED != DONE` 증거화 |
| 6 | Exchange-bound Study table + Series summary | P0 필수 | 일반 환자검색 없이 P0 작업 지원 |
| 7 | 최소 Viewer toolbar + progressive frame state | P0 필수 | 빠른 확인과 안전한 실패 분리 |
| 8 | Audit safe projection + Correlation ID | P0 권장 | 지원·추적성 향상 |
| 9 | QR Claim→환자 확인→Grant 발급 분리 | P1 QR | Scan을 승인으로 오인하지 않음 |
| 10 | Connector/Certificate/Service health 계층 분리 | PRODUCTIONIZATION | 운영 원인과 영향 범위 명확화 |

# 9. 제외 권고

- Browser가 PACS 또는 Orthanc endpoint를 직접 호출하는 Study list/Viewer.
- URL의 Study UID, Viewer Session ID 또는 QR payload를 access authority로 취급하는 구조.
- 일반 환자명·MRN·Accession을 이용한 Tenant-wide 검색.
- Consent 한 번으로 Authorization과 모든 Grant가 자동 발급되는 단일 승인 UI.
- `study:view`에서 Download 또는 PACS Import CTA를 자동 활성화하는 권한 승격.
- STOW HTTP 2xx만으로 `COMPLETED`를 표시하는 진행 화면.
- Integrity 실패를 warning으로 남기고 완료 처리하는 화면.
- QR scan 직후 환자명·Study UID·thumbnail을 Hospital 화면에 표시하는 흐름.
- 장기 작업의 일반적인 전체 `Rerun` 버튼을 PACS Import에 적용하는 UX.
- Audit 원문 JSON, DICOM metadata, token, endpoint, credential 또는 private key를 기본 화면에 노출하는 UI.
- Connector `Healthy` 하나로 네트워크·PACS·Authorization·E2E 전체를 PASS로 표시하는 대시보드.
- 경쟁 제품의 layout, icon, wording 또는 screenshot을 그대로 복제하는 방식.

# 10. MediQ 고유 설계가 필요한 영역

1. **Consent·Authorization·Grant 분리:** 공개 제품은 대체로 consent 또는 approval 한 종류를 중심으로 설계한다. MediQ는 세 객체의 actor, scope, version, expiry와 상태를 한 화면에서 비교하되 합치지 않아야 한다.
2. **Destination Verification:** STOW 응답, destination QIDO 관찰, expected/observed instance count를 별도 카드로 제시해야 한다.
3. **Integrity Completion Gate:** `PENDING`과 `FAILED` 모두 완료를 차단하며, 사용자에게 raw hash 대신 검증 결과와 시각을 보여준다.
4. **QR Claim과 환자 승인 분리:** Hospital claim은 목적지 후보를 고정할 뿐 PHI 접근권한을 만들지 않는다.
5. **Source PACS On-demand Viewer:** Viewer data source는 MediQ Gateway 하나이며 session expiry·withdrawal 때 frame 요청과 표시를 중지한다.
6. **No Permanent Cloud PACS:** 장애 화면에서 Cloud archive fallback을 제안하지 않고 Source PACS unavailable을 정확히 표시한다.
7. **Result Unknown과 중복 STOW 방지:** timeout 또는 response loss 후 destination verification 전에는 성공·실패·전체 retry를 제공하지 않는다.
8. **Synthetic/Test 환경 구분:** 공개 제품에서 직접 대응되는 강한 사례가 없어 MediQ가 전역 banner와 fixture alias를 자체 설계해야 한다.

# 11. Copyright와 License 주의사항

- 이 문서는 URL과 자체 요약만 포함하며 외부 screenshot, logo, icon 또는 제품 문구를 저장소에 복제하지 않는다.
- OHIF처럼 open-source인 제품도 source code license와 documentation/image license가 동일하다고 가정하지 않는다.
- 실제 구현 시 사용하려는 icon set, viewer component, codec, font, sample DICOM의 license를 각각 검토한다.
- 공식 문서 screenshot을 디자인 파일에 붙여 넣어 공유해야 한다면 이용조건을 먼저 확인하고 `REFERENCE ONLY`와 출처를 표시한다.
- 실제 환자정보가 포함되었거나 비식별 여부가 불확실한 화면은 수집·학습·테스트 fixture로 사용하지 않는다.

# 12. Open Questions

| ID | 질문 | 영향 화면 | 결정 필요 시점 |
|---|---|---|---|
| REF-OD-001 | Hospital 주 화면 해상도와 dual-monitor 비율은? | 010~026, 040~047 | P0 UI spike 전 |
| REF-OD-002 | Touch monitor 또는 tablet을 Hospital Web이 지원하는가? | 042~044, QR | P1 QR 전 |
| REF-OD-003 | Dark Viewer와 Light Administration UI를 분리할 것인가? | Viewer, ADM | Design token 확정 전 |
| REF-OD-004 | 의료진 세부 역할별 Dashboard를 P0에서 분리할 것인가? | 010~016 | 현재는 HOSPITAL_USER 유지 권고 |
| REF-OD-005 | 실제 병원 Workflow에서 QR scanner는 어느 workstation에 위치하는가? | QR-001~010 | P1 현장 인터뷰 전 |
| REF-OD-006 | Transfer status는 polling, SSE 또는 operation resource 중 무엇인가? | 064~070 | API 계약 보완 전 |
| REF-OD-007 | Test PACS Import 평균·P95 처리시간은? | 065 | Orthanc benchmark 후 |
| REF-OD-008 | Audit 검색·Export 권한은 누구에게 주는가? | 080~085 | POST-MVP RBAC 전 |
| REF-OD-009 | Provenance graph는 Study, Series, Instance 중 어느 수준까지 보이는가? | 081 | P0은 Study 수준 권고 |
| REF-OD-010 | 장애 시 운영자와 Hospital User에게 다른 메시지를 제공할 API가 있는가? | 006, 026, 046, 070 | Error contract 보완 전 |
| REF-OD-011 | 한국어 기본·영어 표준용어 병기 규칙은? | 전체 | Design system 확정 전 |
| REF-OD-012 | Study 목록의 최소 metadata 필드는 무엇인가? | 023~025 | Privacy review 전 |

# 13. 조사 한계

- 로그인·유료 계정이 필요한 상용 PACS, HIE와 병원 운영 화면은 직접 검증하지 않았다.
- 공식 문서에 보이는 UI가 현재 모든 배포판에서 동일하다고 보장하지 않는다.
- 접근성 점수는 공개 문서에서 확인 가능한 구조와 일반적 component 특성에 대한 제한적 평가이며 WCAG audit 결과가 아니다.
- 의료법·개인정보보호법상의 실제 동의 효력이나 인증 규격을 본 조사에서 판단하지 않았다.
- Reference 제품의 보안성을 평가한 문서가 아니라, 공개된 UI 패턴이 MediQ에 주는 설계 시사점을 평가한 문서다.

# 14. 수정하지 않은 승인 기준 문서

본 조사로 다음 승인 기준을 수정하지 않았다.

- `PRODUCT-BASELINE.md`
- `CAPSTONE-MVP-BOUNDARY.md`
- `REQUIREMENTS.md`
- `SECURITY-REQUIREMENTS.md`
- `SYSTEM-ARCHITECTURE.md`
- `DATA-FLOW.md`
- `OPENAPI.yaml`
- `THREAT-MODEL.md`
- `P0-WEB-UI-UX-SPEC.md`
- `SAAS-SCREEN-DESIGN-SPEC.md`
- `MOBILE-SCREEN-DESIGN-SPEC.md`
- `DICOM-INTEROPERABILITY-PROFILE.md`
- `architecture/qr/QR-HANDOFF-OVERVIEW.md`
- `architecture/qr/QR-UI-UX-SPEC.md`

# 15. PHASE RESULT

**Previous:** MediQ SaaS 화면설계서는 존재하지만 외부 제품·공개 UI 사례와의 체계적인 비교 자료는 없었다.  
**Target:** MediQ 화면군별로 검증된 SaaS·의료영상·보안 UX Reference와 적용 판단을 제공한다.  
**Achieved:** PASS — 문서 조사 산출물 기준. 구현 및 제품 검증은 `NOT IMPLEMENTED / NOT RUN`이다.

1. 조사한 Reference: 26
2. 공식 자료: 26
3. 비공식 Concept: 0
4. 의료영상 Viewer: 6
5. Consent·의료정보 교환: 4
6. Enterprise SaaS: 5
7. Audit·Provenance: 3
8. QR·Pairing: 4
9. Admin·Connector: 4
10. MediQ 화면 연결: 79/79
11. 판단: ADOPT 7 / ADAPT 15 / STUDY ONLY 4 / REJECT 0
12. 권고 Pattern: Context header, 분리 status card, preflight, transfer stepper, verify/integrity gate, bounded Study table, progressive viewer, safe audit, QR 단계 분리, 계층형 health
13. 제외 Pattern: 직접 PACS, 일반 환자검색, 권한 자동승격, STOW 즉시 완료, QR token화, PHI 선노출, blind rerun, raw secret/event 노출
14. Copyright: 외부 이미지 미복제, 링크·자체 요약만 기록
15. 조사 Gap: 상용 PACS/HIE 실사용 화면, MediQ 고유 completion gate와 result unknown
16. Open Questions: `REF-OD-001~012`
17. 승인 기준 문서 수정: 없음

이 조사는 참고자료이며 MediQ의 정식 요구사항이나 화면설계 기준선을 자동 변경하지 않는다.
