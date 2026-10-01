# MEDIQ-AUT-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-AUT-002` |
| 제목 | Default-deny authorization evaluator contract |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — scoped evaluator contract only; actual business authorization is not implemented |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development environment |
| Runtime·Toolchain | Node.js `v24.18.0`, npm `11.16.0`, TypeScript workspace build, Vitest `5.0.2` |
| 대상 환경 | Local compile and API unit/contract tests; no DB/API service write |
| 데이터 | Synthetic UUIDs and in-memory test doubles only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-AUT-002-DD-001` | null/undefined, malformed, copied or forged Context | Negative unit/security | Deny before policy invocation | Five invalid/forged Context cases denied before policy call | `PASS` |
| `TC-AUT-002-DD-002` | Missing policy or evaluator | Negative unit | Deny; no implicit fallback | Both absent policy and missing evaluator return `DENY` | `PASS` |
| `TC-AUT-002-DD-003` | Policy explicitly returns `DENY` | Unit | Preserve `DENY` | Exact `DENY` returned | `PASS` |
| `TC-AUT-002-DD-004` | Fake policy explicitly returns exact `ALLOW` | Contract unit | Exact `ALLOW` maps to `ALLOW`; no business access claim | Contract passes with test double only | `PASS` |
| `TC-AUT-002-DD-005` | Unsupported/truthy/coercible results | Negative unit/security | Every non-exact result denies | Eight unsupported results return `DENY` | `PASS` |
| `TC-AUT-002-DD-006` | Synchronous throw, async rejection or policy accessor exception | Negative unit/security | Return only `DENY`; do not propagate internal detail | All three failure paths return `DENY` | `PASS` |
| Build/regression | Compile API and run all API unit/contract suites | Build + regression | Build succeeds; no regressions | 10 files / 147 tests passed | `PASS` |
| Diff whitespace check | Inspect current tracked diff for whitespace errors | Static check | Exit 0 | Exit 0; Git emitted only existing LF→CRLF informational warnings | `PASS` |
| New-file whitespace scan | Inspect AUT-002 source, test and evidence files for trailing spaces | Static check | No trailing whitespace | No matches | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build and regression suite

- 실행 일시: 2026-09-30 16:10 KST (local)
- 목적: API TypeScript build 및 모든 API unit/contract suite 회귀 검증
- 명령:

```powershell
npm run test:api
```

- 종료 코드: `0`
- 핵심 결과: TypeScript build 성공; Vitest 10 test files passed, 147 tests passed.
- 판정: `PASS` for API unit/contract regression scope

### TEST-002 — Focused AUT-002 suite

- 실행 일시: 2026-09-30 16:10 KST (local)
- 목적: default-deny evaluator 경계와 `TC-AUT-002-DD-001~006` 독립 검증
- 명령:

```powershell
npx vitest run tests/api/authorization-engine.test.mjs
```

- 종료 코드: `0`
- 핵심 결과: 1 test file passed, 20 tests passed.
- 판정: `PASS` for scoped evaluator contract

### TEST-003 — Diff whitespace check

- 실행 일시: 2026-09-30 16:10 KST (local)
- 목적: 현재 tracked patch의 whitespace 오류 점검
- 명령:

```powershell
git diff --check
```

- 종료 코드: `0`
- 핵심 결과: whitespace 오류 없음. Git은 작업트리 파일의 LF가 이후 CRLF로 바뀔 수 있다는 정보성 경고를 출력함.
- 범위: Git이 추적하는 diff. 신규 파일은 아래 TEST-004에서 별도 검사.
- 판정: `PASS`

### TEST-004 — AUT-002 신규 파일 trailing-whitespace scan

- 실행 일시: 2026-09-30 16:10 KST (local)
- 목적: Git diff에 아직 포함되지 않는 신규 AUT-002 소스·테스트·기록 파일의 trailing whitespace 확인
- 명령:

```powershell
$paths = @(
  'services/api/src/authorization/domain/authorization-context.ts',
  'services/api/src/authorization/domain/authorization-effect.ts',
  'services/api/src/authorization/application/authorization-policy.port.ts',
  'services/api/src/authorization/application/authorization-engine.ts',
  'tests/api/authorization-engine.test.mjs',
  'docs/implementation/MEDIQ-AUT-002/IMPLEMENTATION-REPORT.md',
  'docs/implementation/MEDIQ-AUT-002/TEST-EVIDENCE.md'
)
Select-String -Path $paths -Pattern '[ \t]+$'
```

- 종료 코드: `0`
- 핵심 결과: trailing whitespace match 없음.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-AUT-002-DD-001` | nullish, malformed, structural copy 또는 prototype-forged Context | Policy 호출 전에 `DENY` | `PASS` |
| `TC-AUT-002-DD-002` | policy 또는 `evaluate` 누락 | `DENY`; fallback allow 없음 | `PASS` |
| `TC-AUT-002-DD-003` | Policy가 정확히 `DENY` 반환 | `DENY` | `PASS` |
| `TC-AUT-002-DD-005` | `true`, nullish, lowercase/whitespace/unknown 결과 | truthiness/coercion 없이 `DENY` | `PASS` |
| `TC-AUT-002-DD-006` | sync throw, async rejection, throwing accessor | 오류 내용 전파 없이 `DENY` | `PASS` |

가짜 정책의 exact `ALLOW`는 결과 매핑 계약시험이며 authorization 승인을 입증하지 않는다. 실제 정책 또는 보호된 자원 경로에는 연결되지 않았다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Actual Consent/Grant existence, state, scope, tenant, object, action, recipient and expiry binding | AUT-002는 evaluator 결과 계약만 구현하고 business policy/repository가 없음 | evaluator 계약만으로 실제 요청의 권한을 판정할 수 없음 | AUT-003 business policy Acceptance 및 Consent/Grant gates |
| HTTP/API test proving deny/error cannot return protected data or continue side effects | Authorization provider/route에 등록되지 않음; fail-closed integration은 AUT-004 범위 | caller가 결과를 잘못 사용하면 API 데이터 반환/side effect 위험 | AUT-004에서 HTTP response 및 DB/PACS side-effect 부재 검증 |
| Live DB privilege/RLS or PatientMapping runtime authorization | DB access 및 PAT-002 path 변경이 범위 밖 | 데이터 경계의 end-to-end authorization 미확인 | AUT-003/004 및 관련 DB/PAT Acceptance 이후 별도 통합시험 |
| Orthanc/PACS, DICOMweb or A→B E2E | 본 Ticket은 PACS 기능 또는 route를 추가하지 않음 | 제품의 최상위 P0 영상교환 성공은 증명되지 않음 | DICOM/P0 E2E ticket에서 별도 검증 |

이 미실행 항목은 본 Ticket의 제한된 evaluator 계약 완료를 막지는 않지만 전체 Authorization, PAT-002 또는 P0 E2E를 PASS로 만들지 않는다.

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| API build/regression result | `npm run test:api` — exit 0, 10 files / 147 tests | 합성 fixture만; PHI/secret 없음 |
| Focused evaluator result | `npx vitest run tests/api/authorization-engine.test.mjs` — exit 0, 20 tests | 합성 UUID/in-memory double만 |
| Static diff check | `git diff --check` — exit 0 | 소스 검사만 |
| Acceptance mapping | `docs/ACCEPTANCE-TESTS.md`, `TC-AUT-002-DD-001~006` | 증거에 임상 payload/credential 없음 |

## 7. 결론

- 결과: `PASS` for scoped MEDIQ-AUT-002 evaluator contract only.
- PASS 범위: 위조·누락 context 및 policy, 비정확 결과, 명시적 거부, policy exception에 대한 default-deny; API build와 regression suite.
- 실제 권한 또는 제품 접근으로 주장할 수 있는 범위: 없음. Fake-policy ALLOW는 evaluator mapping만 증명한다.
- 미검증·미구현: business Consent/Grant/object/Tenant binding, HTTP deny/no-side-effect, live DB, PAT-002, Orthanc/PACS 및 A→B E2E.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않았다.
