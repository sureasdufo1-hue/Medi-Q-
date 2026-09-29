# MEDIQ-ENV-002 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-ENV-002` |
| 제목 | Repository structure alignment |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-28` |
| 결과 | `PASS` — Ticket scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows / PowerShell |
| Runtime·Toolchain | Node.js `v24.18.0`, npm `11.16.0` |
| 대상 환경 | Local Repository |
| 데이터 | 환자 데이터 미사용; repository manifests만 검사 |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| ENV002-01 | 승인 stack의 npm workspace 구성 | 구조/정적 | API, Worker, Web 각 package가 root workspace에서 해석됨 | 세 package 모두 npm workspace로 표시됨 | `PASS` |
| ENV002-02 | 재현 가능한 무의존성 초기 설치 | 설치 | `npm ci --ignore-scripts --offline` 정상 종료 | 종료 코드 0; 3개 workspace link 설치, registry 접근 불필요 | `PASS` |
| ENV002-03 | 범위·비밀 최소화 | 정적/보안 | 신규 dependency/script/secret 없음; 승인된 계약 파일 미변경 | package scripts/dependencies/devDependencies 비어 있음; API·Domain·OpenAPI 계약 파일 미변경; diff check 종료 코드 0 | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — npm workspace manifest validation

- 실행 일시: 2026-09-28 17:19~17:21 KST
- 목적: root 및 세 package의 workspace 등록·식별 확인
- 명령:

```powershell
npm pkg get name version type --workspaces
npm ls --workspaces --depth=0
```

- 종료 코드: 0
- 핵심 결과: `@mediq/api@0.1.0`, `@mediq/worker@0.1.0`, `@mediq/web@0.1.0` 모두 ESM workspace로 확인됨.
- 판정: `PASS`

### TEST-002 — offline clean install

- 실행 일시: 2026-09-28 17:19 KST
- 목적: lockfile로 dependency-free workspace를 재현 설치
- 명령:

```powershell
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --offline
npm ci --ignore-scripts --offline --no-audit --no-fund
```

- 종료 코드: 0 (두 명령 모두)
- 핵심 결과: lockfile 생성 및 오프라인 clean install 성공. npm 출력은 `added 3 packages`; 이 3개는 registry dependency가 아닌 local workspace link임.
- 판정: `PASS`

### TEST-003 — diff / security boundary check

- 실행 일시: 2026-09-28 17:20~17:25 KST
- 목적: whitespace 오류, package dependency/script 추가, 범위 밖 계약 변경 여부 확인
- 명령:

```powershell
npm pkg get scripts dependencies devDependencies --include-workspace-root --workspaces
git diff --check
```

- 종료 코드: 0 (두 명령 모두)
- 핵심 결과: root와 세 workspace의 scripts/dependencies/devDependencies가 비어 있음. `git diff --check` 통과; Git은 LF→CRLF 변환 경고만 출력했으며 whitespace 오류는 없었음.
- 판정: `PASS`

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| 해당 없음 | Ticket이 제품 접근 제어·데이터 흐름을 구현하지 않음 | 제품 부정/거부 경로는 후속 기능 Ticket의 책임이며 본 Ticket에서 보안 통제 완료를 주장하지 않음 | `NOT APPLICABLE` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Phase 0 통합 Acceptance 및 보안 거부 경로 | 본 Ticket은 package 구조만 변경하며 API/DB/PACS 제품 경로가 아직 없음 | Phase 0 Gate는 미검증 상태로 유지 | 후속 ENV 및 기능 Ticket에서 기록 |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| 실행 콘솔 요약 | 이 문서 | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` — root/workspace manifests, lockfile generation, offline clean install, dependency-free boundary checks only.
- PASS를 주장할 수 있는 범위: `MEDIQ-ENV-002` 구조 정렬만. Phase 0 Acceptance, 서비스 build, product security/integration/E2E는 미실행이며 PASS가 아님.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
