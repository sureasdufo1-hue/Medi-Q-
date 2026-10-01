# MEDIQ-CON-008 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-CON-008` |
| 제목 | Missing and withdrawn Consent operation denial Acceptance |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` (Asia/Seoul) |
| 결과 | `PASS` — scoped internal Authorization operation boundary |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows PowerShell |
| Runtime·Toolchain | Node.js `v24.18.0`; npm `11.16.0`; Docker Compose scratch PostgreSQL |
| 대상 환경 | Local disposable DB-008 Compose project; no production services |
| 데이터 | Synthetic-only fixture; no DICOM payload/PHI/secret in evidence |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-CON-008-AUT-001` | Consent 부재 + `VIEW` | PostgreSQL integration/security | evidence row 없음, DENY, callback 미호출 | DB-008 AUT-005 runtime integration 통과 | `PASS` |
| `TC-CON-008-AUT-002` | Consent 부재 + `DOWNLOAD` | PostgreSQL integration/security | evidence row 없음, DENY, callback 미호출 | DB-008 AUT-005 runtime integration 통과 | `PASS` |
| `TC-CON-008-AUT-003` | Consent 부재 + `PACS_IMPORT` | PostgreSQL integration/security | evidence row 없음, DENY, callback 미호출 | DB-008 AUT-005 runtime integration 통과 | `PASS` |
| `TC-CON-008-AUT-004` | `WITHDRAWN` Consent + `ACTIVE` Grant + `VIEW` | PostgreSQL integration/security | 두 상태 확인, DENY, callback 미호출 | persisted Consent=`WITHDRAWN`, Grant=`ACTIVE`; denied | `PASS` |
| `TC-CON-008-AUT-005` | `WITHDRAWN` Consent + `ACTIVE` Grant + `DOWNLOAD` | PostgreSQL integration/security | 두 상태 확인, DENY, callback 미호출 | persisted Consent=`WITHDRAWN`, Grant=`ACTIVE`; denied | `PASS` |
| `TC-CON-008-AUT-006` | `WITHDRAWN` Consent + `ACTIVE` Grant + `PACS_IMPORT` | PostgreSQL integration/security | 두 상태 확인, DENY, callback 미호출 | persisted Consent=`WITHDRAWN`, Grant=`ACTIVE`; denied | `PASS` |
| `TC-CON-008-REG-001` | API regression | Build/unit/contract | 기존 API 전체 regression 통과 | 20 files, 373 tests passed | `PASS` |
| `TC-CON-008-REG-002` | Full schema + existing DB tickets | Disposable DB integration | reset/reapply, schema/role, DB-002~007 regression, ephemeral cleanup 통과 | `db008_schema_validation=PASS`; `db008_ephemeral_cleanup=PASS` | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API typecheck

- 실행일: 2026-10-01
- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 핵심 결과: `tsc --project services/api/tsconfig.json --noEmit` 통과
- 판정: `PASS`

### TEST-002 — API 회귀

- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: API build 성공; 20 test files passed, 373 tests passed
- 판정: `PASS`

### TEST-003 — 격리 DB 전체 schema/Acceptance gate

- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과:
  - 임의 이름의 disposable Compose project를 사용하고 소유권 확인 뒤 해당 임시 자원만 cleanup
  - schema reset/reapply 통과; 제품 테이블 17, migration ledger 16, catalog `17|44|15|29`
  - runtime column privilege inventory 126 유지; DB-009 경계와 DB-002~007 회귀 통과
  - 내장 api-db-integration-test는 성공 시 `pass 4`를 요구하며, failure/denial이면 전체 gate가 실패하도록 구성됨. 수정된 AUT-005 integration test가 포함되어 여섯 CON-008 assertions를 실제 PostgreSQL에서 실행함
  - 최종 `db008_ephemeral_cleanup=PASS`, `db008_schema_validation=PASS`
- 판정: `PASS`

### TEST-004 — diff whitespace check

- 명령:

```powershell
git diff --check
```

- 종료 코드: `0`
- 핵심 결과: whitespace error 없음. Git이 기존 working tree 파일들의 LF/CRLF normalization warning을 표시했으나 이 검사는 통과함
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-CON-008-AUT-001~003` | Persisted Consent row가 없는 UUID; 유효한 Session/기본 Grant/Study context의 나머지 연결값은 유지 | Reader returns `null`; each P0 action denied before callback | `PASS` |
| `TC-CON-008-AUT-004~006` | Persisted `WITHDRAWN` Consent에 연결된 unexpired `ACTIVE` Grant | Evidence contains both facts; each P0 action denied before callback | `PASS` |

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Grant 발급 API의 no-consent/withdrawn denial 및 concurrent issue/withdrawal | Grant issue service/API 미구현; 이번 결정은 기존 internal operation executor 경계로 제한 | 신규 Grant가 철회와 race할 가능성은 제품 경계에서 아직 검증되지 않음 | 별도 `MEDIQ-GRT-*` 권고안·Acceptance 후 검증 |
| HTTP BOLA, Viewer/Download/PACS 실제 side effect, `AT-E2E-003` | 해당 product route/flow가 미완성 | 내부 callback denial만으로 실제 제품 경로를 보증하지 않음 | HTTP/Preflight/PACS 통합 게이트에서 검증 |
| 법적 동의 및 이미 전달된 자료 회수 | 본 Ticket의 기술 검증 범위 밖 | 법률·운영 정책과 remote recall은 보장되지 않음 | 별도 정책/운영 결정 필요 |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| 실행 결과 | 이 문서의 명령 요약과 종료 코드 | Secret/credential/PHI/DICOM 없음 |
| Acceptance 기록 | `docs/ACCEPTANCE-TESTS.md`, `TC-CON-008-AUT-001~006` | Synthetic identifiers만 사용 |
| 통합시험 코드 | `tests/database/postgres-authorization-evidence-runtime.integration.test.mjs` | Test fixture 외 민감정보 없음 |

## 7. 결론

- 결과: `PASS` — CON-008의 내부 PostgreSQL→Authorization→protected callback Acceptance에 한정
- 실제 누락/철회 Consent는 `VIEW`, `DOWNLOAD`, `PACS_IMPORT` 모두에서 DENY; 철회 Consent에 연결된 Grant가 ACTIVE여도 보호 callback은 호출되지 않음
- 이 결과는 Grant 발급 API, 제품 HTTP/Viewer/Download/PACS 동작, 법적 동의 또는 전체 P0 E2E의 PASS를 뜻하지 않음
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않음
