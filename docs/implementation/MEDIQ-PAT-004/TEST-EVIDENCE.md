# MEDIQ-PAT-004 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-PAT-004` |
| 제목 | PatientMapping persistence-to-domain negative regression |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` (Ticket scope only) |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows host; PowerShell 7.6.5 |
| Runtime·Toolchain | Node.js v24.18.0; npm 11.16.0; Vitest v5.0.2; TypeScript API build |
| 대상 환경 | Local Vitest mock only; no live DB/PACS |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-PAT-004-PER-001` | 0행 결과는 매핑 누락으로 거부 | Unit / Security | `DENY/MAPPING_MISSING` | 통과 | `PASS` |
| `TC-PAT-004-PER-002` | persisted invalid status/evidence는 fail closed | Unit / Security | 대응하는 고정 DENY reason | 4 상태 case 통과 | `PASS` |
| `TC-PAT-004-PER-003` | 중복행에서 첫 행을 선택하지 않음 | Unit / Security | 고정 persistence error | 통과 | `PASS` |
| `TC-PAT-004-PER-004~005` | DB 오류·세부정보 비노출 | Unit / Security | 고정 persistence error, 상세 없음 | SQL/driver/local-ID 상세 포함 오류 fixture 통과 | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API TypeScript build

- 실행 일시: 2026-09-30 20:29 KST (full regression 중 재실행 포함)
- 목적: API TypeScript 코드 및 import 빌드 확인
- 명령:

```powershell
npm run build:api
```

- 종료 코드: 0
- 핵심 결과: `tsc --project tsconfig.json` 완료
- 판정: `PASS`

### TEST-002 — PAT-004 focused acceptance

- 실행 일시: 2026-09-30 20:30:42 KST
- 목적: PAT-004 mocked persistence-to-domain 거부 경계
- 명령:

```powershell
npx vitest run tests/api/patient-mapping-denial.test.mjs
```

- 종료 코드: 0
- 핵심 결과: 1 file passed; 7 tests passed
- 판정: `PASS`

### TEST-003 — Full API regression

- 실행 일시: 2026-09-30 20:30:52 KST
- 목적: 전체 API 테스트 회귀 확인
- 명령:

```powershell
npm run test:api
```

- 종료 코드: 0
- 핵심 결과: API build 통과; 17 files passed; 330 tests passed
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `PER-001~005` | 매핑 누락·상태 이상·중복행·DB 오류에서 도메인 deny 또는 고정 오류 | 합성 mock Acceptance 통과 | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Live PostgreSQL/RLS | 이 Ticket은 mocked query boundary만 범위 | 실제 runtime/RLS 동작 미검증 | 별도 DB/PAT 통합 게이트 |
| PACS no-STOW | PACS preflight/transfer 구현 없음 | 실제 side effect 차단 미검증 | `MEDIQ-PACS-004` / `AT-SEC-012` |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Test output | 이 문서의 명령·요약 | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` (PAT-004 mocked adapter-to-domain scope only)
- PASS를 주장할 수 있는 범위: 이 문서의 `TC-PAT-004-PER-001~005`와 API regression
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
