# MediQ Implementation Records

이 디렉터리는 하나의 승인된 `MEDIQ-*` Ticket 안에서 구현, 실행·시험, 문서화를 함께 완료했다는 증거를 보관한다.

구현 기록은 요구사항·보안·아키텍처 같은 승인 기준 문서를 대체하지 않는다. 실제 구현 결과와 검증 결과를 기준선에 연결하는 실행 기록이다.

## 1. 적용 대상

다음 변경은 작업 시작 시 Ticket별 구현 기록을 생성해야 한다.

- 애플리케이션 코드, 테스트 코드 또는 빌드 코드
- 런타임 설정, 배포·인프라 설정 또는 데이터베이스 Migration
- API, 데이터 모델, 보안 통제 또는 외부 연동
- 실행 가능한 자동화 스크립트

단순 질의, 읽기 전용 조사, 오탈자 정정처럼 실행 가능한 결과물이 없는 문서 작업은 생성을 생략할 수 있다. 여러 Ticket을 한 번에 다루면 Ticket별 디렉터리를 각각 사용한다.

## 2. 필수 작업 흐름

```text
승인 Ticket 확인
→ 구현 기록 생성 또는 열기
→ 요구사항·보안·Acceptance Traceability 기록
→ 코드·설정 변경
→ 필요한 명령과 테스트 실행
→ TEST-EVIDENCE.md에 실제 명령·결과 기록
→ IMPLEMENTATION-REPORT.md에 구현·미구현·위험 기록
→ 관련 승인 기준 문서 동기화
→ 최종 상태 판정
```

코드만 작성한 상태는 완료가 아니다. 실행하지 않은 테스트는 `PASS`로 기록할 수 없으며, 미실행 이유와 잔여 위험을 명시해야 한다.

## 3. 디렉터리 구조

```text
docs/implementation/
├── README.md
├── _templates/
│   ├── IMPLEMENTATION-REPORT.md
│   └── TEST-EVIDENCE.md
└── MEDIQ-<AREA>-<NNN>/
    ├── IMPLEMENTATION-REPORT.md
    └── TEST-EVIDENCE.md
```

PowerShell에서 다음 명령으로 기록을 생성한다.

```powershell
./scripts/new-implementation-record.ps1 `
  -Ticket MEDIQ-API-001 `
  -Title "Exchange session API" `
  -Classification CAPSTONE-P0
```

스크립트는 기존 Ticket 디렉터리를 덮어쓰지 않는다.

## 4. 상태 정의

| 상태 | 의미 |
|---|---|
| `PLANNED` | 범위와 추적성만 정의됨 |
| `IN_PROGRESS` | 구현 또는 검증이 진행 중 |
| `IMPLEMENTED` | 변경은 작성됐으나 필수 검증이 끝나지 않음 |
| `TESTED` | 계획된 검증을 실행하고 결과를 기록함 |
| `ACCEPTED` | 승인된 Acceptance 기준까지 충족함 |
| `PARTIAL` | 일부 결과는 있으나 필수 구현·검증·문서화가 남음 |
| `BLOCKED` | 외부 의존성 또는 결정 부재로 더 진행할 수 없음 |

`IMPLEMENTED != DONE`이며, `PASS`는 해당 Ticket에 필요한 구현·문서·시험 증거가 모두 있을 때만 사용할 수 있다.

## 5. 증거 작성 원칙

- 실행한 명령은 재현 가능한 형태로 정확히 기록한다.
- 종료 코드, 핵심 결과, 실행 일시와 환경을 기록한다.
- 성공·실패·거부 경로를 구분한다.
- 실행하지 못한 시험은 이유, 영향, 후속 조치를 기록한다.
- 실제 환자정보, 운영 DICOM, Credential, Token, Secret, 암호화 키 또는 민감 Payload를 포함하지 않는다.
- 대용량 로그는 안전한 별도 산출물 경로를 연결하고 기록에는 요약과 무결성 정보를 남긴다.

## 6. 구현 기록 색인

| Ticket | 분류 | 제목 | 상태 | 보고서 |
|---|---|---|---|---|
| `MEDIQ-ENV-002` | `CAPSTONE-P0` | API·Worker·Web npm workspace 구조 정렬 | `PASS` (Ticket 범위) | [Implementation Report](MEDIQ-ENV-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-002/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-003` | `CAPSTONE-P0` | PostgreSQL·Orthanc Compose 기준선 | `PASS` (config 범위) | [Implementation Report](MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-003/TEST-EVIDENCE.md) |
| `MEDIQ-ENV-004` | `CAPSTONE-P0` | PostgreSQL startup·health·network 연결 | `PASS` (DB 환경 범위) | [Implementation Report](MEDIQ-ENV-004/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-ENV-004/TEST-EVIDENCE.md) |
| `MEDIQ-GOV-001` | `CAPSTONE-P0` | 구현·실행·문서화 단일 작업 Gate | `TESTED` | [Implementation Report](MEDIQ-GOV-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-GOV-001/TEST-EVIDENCE.md) |
| `MEDIQ-DOC-001` | `CAPSTONE-P1` | 합성 건강정보 연계 Preview 문서 기준선 | `TESTED` | [Implementation Report](MEDIQ-DOC-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DOC-001/TEST-EVIDENCE.md) |
| `MEDIQ-DOC-002` | `CAPSTONE-P1` | 환자 경험 기능 1–9 문서 기준선 | `TESTED` | [Implementation Report](MEDIQ-DOC-002/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-DOC-002/TEST-EVIDENCE.md) |
| `MEDIQ-UI-001` | `CAPSTONE-P1` | 환자 경험 기능 1–9 인터랙티브 HTML 목업 | `PARTIAL` | [Implementation Report](MEDIQ-UI-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-UI-001/TEST-EVIDENCE.md) |
| `MEDIQ-HHP-006` | `CAPSTONE-P1` | 건강검진·혈액·항체검사 합성 Preview | `PARTIAL` | [Implementation Report](MEDIQ-HHP-006/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-HHP-006/TEST-EVIDENCE.md) |
| `MEDIQ-AIQ-001` | `CAPSTONE-P1` | 환자 편의 확장과 합성 AI 질문자료 | `PARTIAL` | [Implementation Report](MEDIQ-AIQ-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-AIQ-001/TEST-EVIDENCE.md) |
| `MEDIQ-RAG-001` | `CAPSTONE-P1` | 합성 환자 설명·질문 준비 RAG 문서 기준선 | `TESTED` | [Implementation Report](MEDIQ-RAG-001/IMPLEMENTATION-REPORT.md) · [Test Evidence](MEDIQ-RAG-001/TEST-EVIDENCE.md) |
