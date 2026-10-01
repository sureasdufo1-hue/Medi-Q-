# MEDIQ-GRT-006 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-GRT-006` |
| 제목 | TransferGrant API Payload Allowlist |
| 분류 | `CAPSTONE-P0` |
| 실행일 | `2026-10-01` |
| 결과 | `PASS` — metadata serialization scope only |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 Education |
| Node.js / npm | `v24.18.0` / `11.16.0` |
| 대상 | Local API build and Vitest unit/controller tests |
| 데이터 | Synthetic identifiers and synthetic forbidden-field marker values only |

## 2. Acceptance 결과

| 검증 ID | 실제 결과 | 판정 |
|---|---|---|
| `TC-GRT-006-PAY-001` | Domain snapshot has only approved IDs/references/scopes/status/timestamps | `PASS` |
| `TC-GRT-006-PAY-002` | Grant issue controller returns exact metadata allowlist | `PASS` — controller unit boundary |
| `TC-GRT-006-PAY-003` | Grant revoke controller returns the same metadata allowlist plus `revokedAt`; injected unknown/sensitive properties are excluded | `PASS` — controller unit boundary |
| `TC-GRT-006-PAY-004` | Both controllers use the same explicit shared mapper | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — API build

```powershell
npm run build:api
```

- 종료 코드: `0`
- 결과: TypeScript API build passed.

### TEST-002 — Dedicated payload allowlist tests

```powershell
npm exec vitest -- run tests/api/grant-response.test.mjs --reporter=dot
```

- 종료 코드: `0`
- 결과: `1` file passed; `4` tests passed.

### TEST-003 — API typecheck

```powershell
npm run typecheck:api
```

- 종료 코드: `0`
- 결과: API `tsc --noEmit` passed.

### TEST-004 — Full API regression

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: `0`
- 결과: `25` files passed; `465` tests passed.

## 4. 민감 필드 비노출

Synthetic source objects were assigned forbidden fields representing raw DICOM payload, DICOM UID, DEK, KEK, password, private key, long-lived secret, and a future unknown property. Neither issue nor revoke controller output included any of these fields. No actual secret/key/payload values were used.

## 5. 실행하지 않은 시험과 범위 경계

| 시험 | 이유 | 잔여 위험 |
|---|---|---|
| Live HTTP/JWKS/PostgreSQL serialization integration after shared-mapper change | Ticket is limited to the pure mapper/controller return boundary; no request/auth/database behavior changed. Existing GRT-003/004 integration evidence remains linked separately. | Framework/network and live deployment serialization are not newly re-proven by these unit tests. |
| DB migration/privilege/RLS or DB-008 | No schema, persistence query or runtime grant changed | No database impact introduced |
| DICOM/Capsule encryption or transfer | Grant is metadata, not an image payload container | Image/key lifecycle remains separate product work |

## 6. 결론

- 결과: `PASS` for `MEDIQ-GRT-006` domain and controller allowlist scope.
- Issue and revoke controllers share a field-by-field serializer; no generic entity spreading is used.
- This does not establish image encryption, DICOM delivery, key custody or overall P0 completion.
