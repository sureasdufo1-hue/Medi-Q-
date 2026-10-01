# MEDIQ-INT-001 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-INT-001` |
| 제목 | Bounded source manifest and pending evidence persistence foundation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-10-02` |
| 결과 | `PARTIAL` — hash and prior pending-persistence sub-gates PASS; authorized source-capture API unit/build tests PASS; DB privilege/RLS and Test Orthanc capture NOT RUN |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows local development workspace |
| Runtime·Toolchain | Node.js 24.18.0; npm 11; TypeScript 6.0.3; Vitest 5.0.2 |
| 대상 환경 | Local synthetic unit/build checks; disposable DB-008 PostgreSQL/RLS scratch |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-INT-001-HASH-001~008` | Canonical digest, exact bytes, completeness, hard/lower-only caps, stream error/abort and isolated dependency boundary | Unit / static scope | Positive known vector; order-independent digest; reject invalid/truncated/oversized/aborted streams; no product I/O | Focused suite 12/12; full API 30 files/541 tests; no DB/Orthanc/route/STOW invoked | `PASS` primitive only |
| `TC-INT-001-DB-001~010` | Operation-bound source evidence persistence, scope derivation, exact replay/conflict, Tenant RLS, rollback, first-write state gate, CHECK, exact temporary grants | Unit / PostgreSQL integration / schema / privilege | PENDING-only row under visible CREATED operation; no scope spoofing, cross-Tenant disclosure, update/delete, verified/destination fields or permanent grant | Repository suite 6/6; DB-008 integration PASS; scratch 12-column SELECT + 12-column INSERT; total 233 during test, restored to 209; migration ledger 22, catalog `18|50|17|40` | `PASS` persistence foundation only |
| `REQ-INT-001` full; `SEC-INT-001/002`; `AT-FUNC-014`; `AT-SEC-018`; `AT-E2E-003` | Authorized source, destination match, failure blocks completion and complete transfer evidence | DB / Integration / Security / E2E | Trusted A source→MediQ→B destination verification and no false completion | Not part of primitive; no product workflow or destination operation | `NOT RUN` |

## 3. 실행 명령과 결과

### TEST-001 — Focused source integrity suite

- 실행 일시: 2026-10-01
- 목적: 8 Acceptance groups covering deterministic manifest construction, exact stream bytes, boundaries, cancellation and sanitized failures
- 명령:

```powershell
npx vitest run tests/api/source-integrity-manifest.test.mjs --reporter=verbose --maxWorkers=1
```

- 종료 코드: 0
- 핵심 결과: 1 test file; 12 tests passed; fixed vector `sha256:855de908102c02a22d8d8c3f86e0096864689848ec77ba64c538878b4d1c0cca`
- 판정: `PASS` primitive only

### TEST-002 — Full API regression and build

- 실행 일시: 2026-10-01
- 목적: TypeScript API build plus all API tests
- 명령:

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: 0
- 핵심 결과: API build passed; 30 test files / 541 tests passed
- 판정: `PASS`

### TEST-003 — API typecheck

- 실행 일시: 2026-10-01
- 명령:

```powershell
npm run typecheck:api
```

- 종료 코드: 0
- 핵심 결과: TypeScript `--noEmit` passed
- 판정: `PASS`

### TEST-004 — DICOM Port type contract regression

- 실행 일시: 2026-10-01
- 명령:

```powershell
npm run test:dicom-port-contract
```

- 종료 코드: 0
- 핵심 결과: Port consumer/adapter contract TypeScript check passed; no adapter was changed or invoked
- 판정: `PASS`

### TEST-005 — Independent fixed-vector calculation

- 실행 일시: 2026-10-01
- 목적: Verify the committed test's digest against a separate inline implementation of the documented framing, not only against the builder itself
- 명령:

```powershell
node --input-type=module -e "import {createHash} from 'node:crypto'; const hash=createHash('sha256'); hash.update(Buffer.from('MEDIQ-DICOM-MANIFEST\0V1\0','ascii')); const count=Buffer.alloc(4); count.writeUInt32BE(2); hash.update(count); for (const [uid,data] of [['1.2.3',Buffer.from([1,2,3])],['1.2.4',Buffer.from([16,32])]]) { const id=Buffer.from(uid,'ascii'); const idLen=Buffer.alloc(4); idLen.writeUInt32BE(id.length); const size=Buffer.alloc(8); size.writeBigUInt64BE(BigInt(data.length)); hash.update(idLen).update(id).update(size).update(createHash('sha256').update(data).digest()); } console.log('sha256:'+hash.digest('hex'))"
```

- 종료 코드: 0
- 핵심 결과: independent result `sha256:855de908102c02a22d8d8c3f86e0096864689848ec77ba64c538878b4d1c0cca`, matching the fixed unit vector
- 판정: `PASS`

### TEST-006 — Pending source-evidence repository unit tests

- 실행 일시: 2026-10-02
- 명령:

```powershell
npx vitest run tests/api/source-integrity-evidence-repository.test.mjs --reporter=dot --maxWorkers=1
```

- 종료 코드: 0
- 결과: 1 file / 6 tests passed; exact operation/session/package/Study binding, PENDING-only SQL, exact replay, conflict, invisible operation, strict input surface and sanitized DB error covered
- 판정: `PASS` unit scope

### TEST-007 — API build and full regression

- 실행 일시: 2026-10-02
- 명령:

```powershell
npm run test:api -- --reporter=dot
```

- 종료 코드: 0
- 결과: API build passed; 33 test files / 571 tests passed
- 판정: `PASS`

### TEST-008 — API typecheck, migration journal and migration runner

- 실행 일시: 2026-10-02
- 명령:

```powershell
npm run typecheck:api
npm run db:migrations:check
npm run test:db-migrations
npm run test:dicom-port-contract
```

- 종료 코드: all 0
- 결과: TypeScript no-emit, Drizzle journal consistency, 6 migration-runner tests and DICOM Port type contract passed
- 판정: `PASS`

### TEST-009 — Full disposable PostgreSQL/RLS/regression gate

- 실행 일시: 2026-10-02
- 명령:

```powershell
./scripts/test-db-008-full-schema.ps1
```

- 종료 코드: 0
- 결과:
  - DB-008 fresh-schema and reset/reapply PASS; 18 product tables, 22 migration-ledger rows, PK/FK/UNIQUE/CHECK catalog `18|50|17|40`
  - New `INT-001` PostgreSQL/RLS Acceptance PASS: operation-derived binding, exact replay, changed-manifest conflict, rollback, no Tenant context, third-Tenant isolation, unknown/late-first-write denial, direct invalid-row CHECK rejection
  - Scratch-only 12-column SELECT + 12-column INSERT grant was revoked; persistent runtime inventory restored to 209; UPDATE/DELETE and table-level/PUBLIC rights absent
  - DB-002~007 regressions PASS and owned disposable resources cleaned
- 판정: `PASS` schema/persistence sub-gate only

One earlier aggregate attempt stopped on a synthetic UID fixture range error; a later intermediate run reported only a generic assertion. The fixture and probe were revised, and the final full run above passed. The intermediate assertion’s exact originating check was not independently established, so no specific root cause is claimed.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| `TC-INT-001-HASH-004~006` | Invalid UID/count/media type/Content-Length, size overflow, thrown/read error, abort | Reject with fixed code/generic message; active body cancelled where applicable; no result | `PASS` — focused tests |
| `TC-INT-001-HASH-008` | Check external-effect and sensitive-data boundary | No concrete DICOM adapter, database, route, audit/provenance or STOW integration in helper; no PatientID/payload/credential/per-instance digest in output | `PASS` — code/dependency review and isolated synthetic tests |
| `TC-INT-001-DB-006~010` | Missing Tenant/other Tenant, unknown operation, late first-write, invalid source status/binding and privilege probes | Fail closed; no returned identifiers or unauthorized changes; temporary grants removed | `PASS` — final DB-008 PostgreSQL/RLS run |
| Product Authorization/tenant/Consent/Grant denial | Not implemented in this hash primitive and no route calls it | No Authorization claim; later caller must gate retrieval/persistence separately | `NOT RUN` — required integration prerequisite |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Authorized Hospital A QIDO/WADO source retrieval and source PatientMapping/Consent/Grant/Authorization binding | This sub-gate deliberately stops at an internal hash primitive and a pending persistence foundation; there is no authorized product retrieval caller | A persisted pending baseline alone is not proof that bytes came from the authorized source | Separate recommendation/Acceptance before authorized source-capture integration |
| Reauthorization and atomic Audit for source retrieval/persistence; permanent runtime grant | No product caller, complete authorization fence or atomic producer exists; temporary test grants were revoked | No durable product-level source capture/failure Audit claim; no transfer-completion enforcement | Define separate recommendation/Acceptance and security review before wiring |
| Orthanc A/B product integration, destination hash, no-STOW/B-unchanged coordinator tests, production-like performance benchmark | Primitive is tested with small synthetic streams only; this task did not invoke Test Orthanc or STOW | No interoperability, 2 GiB throughput, destination or end-to-end claim | Later Test Orthanc integration after complete Mandatory Preflight |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| Synthetic unit output only | Test process output; no DICOM fixture file generated or persisted | PHI·Secret 없음 |
| Fixed known digest vector | `TC-INT-001-HASH-001` | Synthetic bytes and synthetic UIDs only |

## 7. 결론

- 결과: `PARTIAL`
- PASS를 주장할 수 있는 범위: canonical streaming hash primitive and operation-bound `SOURCE_CAPTURE/PENDING` persistence/schema/RLS/exact scratch-grant regression only
- No PASS claim for source authenticity, PACS retrieval, business Authorization/PatientMapping/Consent/Grant, permanent runtime grant, Audit/Provenance atomicity, destination comparison, transfer completion, or A→B E2E.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.

## 8. Authorized Source-Capture Sub-gate — Current Checkpoint

`INT-001-DEC-003` and 14 Acceptance cases were recorded before code changes. The internal source-capture service, resolved authorization/session-fence executor path, Audit allowlist, and mocked API tests are implemented. This section records only tests actually run; mocked tests do not satisfy PostgreSQL/RLS or live Test Orthanc Acceptance.

| Verification | Command/evidence | Actual result | Status |
|---|---|---|---|
| API build + complete API regression, including new source-capture/executor/Audit unit tests | `npm run test:api -- --reporter=dot` | Exit 0; TypeScript API build passed; 34 test files / 584 tests passed | `PASS` — API/unit scope only |
| Focused authorization, Audit, source-capture test invocation via direct `npx vitest` | `npx vitest run tests/api/authorized-source-capture.test.mjs tests/api/authorization-gated-operation.test.mjs tests/api/audit-event-writer.test.mjs --reporter=dot --maxWorkers=1` | Did not start: external npx cache failed to resolve `@jridgewell/sourcemap-codec`; repository-owned `npm run test:api` subsequently ran the full suite successfully | `TOOLING ERROR` — no test result |
| Exact permanent runtime privilege migration/catalog inventory, RLS and atomicity | Planned: `./scripts/test-db-008-full-schema.ps1` after adding the migration | Not run; required migration is not yet present | `NOT RUN` |
| Real Test Orthanc A WADO retrieval, B zero-write and no open DB transaction during WADO | Planned test-only integration using synthetic A/B and disposable PostgreSQL | Not run; current service tests use a mocked DICOM gateway | `NOT RUN` |

### Current boundary

- New application-service tests exercise mocked authorization, operation scope, PatientMapping, metadata/count checks, source errors, in-flight revocation/mapping changes, and audit/evidence rollback behavior. They do not prove PostgreSQL grants/RLS or real PACS endpoint behavior.
- `TC-INT-001-CAP-001~014` remain `PLANNED`; no source-capture Acceptance case is marked PASS.
- The permanent runtime grant migration is outstanding. The new service is internal-only and not reachable through HTTP, but it is not ready for least-privilege runtime execution until the exact grants are added and validated.
- No STOW, B write, destination verification or full A→B E2E was run or claimed.
