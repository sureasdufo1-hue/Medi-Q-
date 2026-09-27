# Development Scripts

## 구현 기록 생성

`new-implementation-record.ps1`은 승인된 Ticket의 구현 보고서와 시험 증거 문서를 함께 생성한다. 기존 Ticket 디렉터리는 덮어쓰지 않는다.

```powershell
./scripts/new-implementation-record.ps1 `
  -Ticket MEDIQ-API-001 `
  -Title "Exchange session API" `
  -Classification CAPSTONE-P0
```

생성 결과:

- `docs/implementation/<TICKET>/IMPLEMENTATION-REPORT.md`
- `docs/implementation/<TICKET>/TEST-EVIDENCE.md`

구현 전 추적성을 작성하고, 구현 후 실제 실행 명령과 결과를 같은 Ticket 기록에 반영한다.

scaffold 자체의 구문, 생성, 토큰 치환, 중복·잘못된 Ticket 거부 동작은 다음 명령으로 검증한다.

```powershell
./scripts/test-new-implementation-record.ps1
```

## 예정 스크립트

- Test Orthanc 기동 및 health check
- Synthetic DICOM seed
- Acceptance test 실행
- Audit/integrity 검증 리포트 생성
