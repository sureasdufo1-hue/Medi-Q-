# MEDIQ-DB-008 Test Evidence

| 항목 | 값 |
|---|---|
| Ticket | `MEDIQ-DB-008` |
| 제목 | P0 full database schema constraint and reset validation |
| 분류 | `CAPSTONE-P0` |
| 작성일 | `2026-09-30` |
| 결과 | `PASS` — approved registry policy, schema/reset, and predecessor regressions verified; product authorization remains outside scope |

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows PowerShell host |
| Runtime·Toolchain | Docker Compose PostgreSQL 18.6; Node.js/NPM migration runner |
| 대상 환경 | Existing local DB for regressions; disposable DB for reset test |
| 데이터 | Synthetic/Test only |

## 2. 검증 매트릭스

| 검증 ID | 요구사항·위험 | 유형 | 예상 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|---|
| `TC-DB-008-REG-001` | Exactly 17 approved product tables and complete migration history | Integration | No missing/unapproved table; current migration ledger matches journal | Scratch DB: 17 tables, ledger 8 owned by migrator; repeated apply passed | `PASS` |
| `TC-DB-008-REG-002` | Aggregate PK/FK/UNIQUE/CHECK/index catalog | Integration | Catalog matches approved schema and all DB-002~007 inventories plus approved DB-008 amendment | Scratch aggregate `PK/FK/UNIQUE/CHECK=17/44/14/28`; all per-ticket inventories passed | `PASS` |
| `TC-DB-008-REG-003` | FK references and delete policies | Integration / Security | Declared references resolve and approved RESTRICT rules hold | DB-002~007 exact FK inventories, invalid-parent rejection, and RESTRICT probes passed | `PASS` |
| `TC-DB-008-REG-004` | Required unique constraints | Integration | Approved unique keys reject duplicates; no unapproved unique behavior | DB-002~007 duplicate and catalog probes passed | `PASS` |
| `TC-DB-008-REG-005` | Declared checks and finite allowed values | Integration | Approved values/ranges behave exactly; extensible `organization_type` policy is explicit | Existing finite checks plus approved Hospital/Actor statuses passed; extensible organization types accepted | `PASS` |
| `TC-DB-008-REG-006` | Declared index inventory | Integration | All Data Model indexes exist; no unexplained index | DB-002~007 exact per-ticket index inventories passed | `PASS` |
| `TC-DB-008-REG-007` | Synthetic fixture compatibility and rollback | Integration | Approved fixtures insert and test rows roll back | DB-002~007 synthetic positive/negative/rollback tests passed; zero fixture rows persisted | `PASS` |
| `TC-DB-008-REG-008` | Clean UP/RESET strategy | Integration | Migrations apply to disposable empty PostgreSQL; only ephemeral resources cleaned; second fresh UP succeeds | Clean up twice, owned-resource reset, fresh up, and final cleanup passed | `PASS` |
| `TC-DB-008-REG-009` | Tenant/Organization and Actor/Hospital owner-pair consistency | Security / Design | Mismatched synthetic ownership is rejected by composite FK; nullable Tenant-level Actor remains valid; rollback leaves no rows | Both mismatches rejected; `hospital_id=NULL` Actor accepted; probes rolled back | `PASS` |
| `TC-DB-008-REG-010` | `organization_type`, `hospitals.status`, `actors.status` allowed-values baseline | Schema / Design | `organization_type` remains explicitly extensible; Hospital/Actor statuses accept only approved values | Custom organization type and all three statuses accepted; invalid statuses rejected | `PASS` |

## 3. 실행 명령과 결과

### TEST-001 — Full schema and reset acceptance

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 목적: Verify full disposable UP/RESET, aggregate catalog, repeat migration, and DB-002~007 regressions without modifying the persistent database volume.
- 명령:

```powershell
.\scripts\test-db-008-full-schema.ps1 -EnvFile .env
```

- 종료 코드: `0`
- 핵심 결과:

  ```text
  db008_policy_conformance=PASS hospital_owner_mismatch=rejected actor_owner_mismatch=rejected hospital_statuses=3 actor_statuses=3 custom_org_type=accepted tenant_level_actor=null synthetic_rows_persisted=0
  db008_clean_up=PASS product_tables=17 ledger=8 catalog=17|44|14|28
  db008_reset=PASS only_owned_ephemeral_compose_resources_removed=true
  db008_reset_postgres=PASS role_bootstrap=PASS
  db008_policy_conformance=PASS hospital_owner_mismatch=rejected actor_owner_mismatch=rejected hospital_statuses=3 actor_statuses=3 custom_org_type=accepted tenant_level_actor=null synthetic_rows_persisted=0
  db008_reset_reapply=PASS product_tables=17 ledger=8
  db008_policy_conformance=PASS hospital_owner_mismatch=rejected actor_owner_mismatch=rejected hospital_statuses=3 actor_statuses=3 custom_org_type=accepted tenant_level_actor=null synthetic_rows_rolled_back=true
  db008_prior_schema_regressions=PASS tickets=DB-002,DB-003,DB-004,DB-005,DB-006,DB-007
  db008_ephemeral_cleanup=PASS
  db008_schema_validation=PASS complete_gate=GATE-IMP-02 baseline_decisions_pending=false
  ```
- Additional output: migration ledger repeatedly `rows=8 owner=mediq_migrator`; the persistent database accepted additive migration 0007 while the runtime role remained unable to read the migration ledger. DB-002~007 each reported schema/constraints/rollback PASS.
- 판정: `PASS` for the database schema/reset gate and approved structural policy. Runtime authorization/RLS and the product exchange flow are not covered by this gate.

During harness refinement, earlier invocations exited before the full acceptance run due to readiness/catalog assertion issues. Their `finally` cleanup removed the uniquely named DB-008 resources; final checks confirmed no DB-008 container, volume, or network remained. Only the successful exit-0 run above is counted as final acceptance evidence.

### TEST-002 — Repository and migration regressions

- 실행 일시: 2026-09-30 (Asia/Seoul)
- 명령·결과:
  - `npm run db:migrations:check` — exit 0.
  - `npm run test:db-migrations` — 6/6 passed.
  - `npm run typecheck:api` — exit 0.
  - `npm run test:api` — 3/3 passed.
  - `npm run typecheck:app-config` — exit 0.
  - `npm run test:app-config` — 8/8 passed.
  - `scripts/validate-compose-baseline.ps1 -EnvFile .env` — PASS.
  - `docker compose --env-file .env -f infra/docker-compose.yml config --quiet` — exit 0.
  - PowerShell AST parse of `scripts/test-db-008-full-schema.ps1` — zero parse errors.
  - `git diff --check` — exit 0; LF→CRLF normalization warnings only.
- 판정: `PASS` for listed checks.

## 4. 실패·거부 경로

| 검증 ID | 경로 | 결과 | 판정 |
|---|---|---|---|
| Cross-owner mismatches | Organization/Tenant or Actor/Hospital pair belongs to inconsistent owners | Composite FK rejected both synthetic mismatches; post-ROLLBACK canary count was 0 | `PASS` |
| Hospital/Actor status | Status outside the approved finite set | Invalid values rejected; `ACTIVE`, `SUSPENDED`, `INACTIVE` accepted | `PASS` |
| Extensible organization type | New non-empty organization type code | Custom synthetic type accepted as intended; no database CHECK constrains the extensible code | `PASS` |

해당되지 않으면 적용되지 않는 이유를 기록한다.

## 5. 실행하지 않은 시험

| 시험 | 미실행 이유 | 잔여 위험 | 후속 조치 |
|---|---|---|---|
| Application authorization / tenant isolation | Not a schema-only behavior | Catalog does not prove authorization | Implement and test in downstream service tickets |

## 6. 증거 산출물

| 산출물 | 위치·식별자 | 민감정보 점검 |
|---|---|---|
| DB-008 console summary | Recorded above; no raw database/credential output | PHI·Secret 없음 |

## 7. 결론

- 결과: `PASS` for `GATE-IMP-02` and the scoped DB-008 Ticket.
- PASS를 주장할 수 있는 범위: Disposable UP/RESET/reapply, 17-table allowlist, aggregate catalog 17 PK / 44 FK / 14 UNIQUE / 28 CHECK, approved owner-pair/status policy, DB-002~007 schema regressions, and listed static/type/config checks only.
- PASS에 포함되지 않는 범위: Runtime authorization, RLS/table grants, Consent/Grant enforcement, product APIs, Viewer/Download, or Hospital A→B product transfer.
- 실제 환자정보, 운영 Credential, Secret 및 운영 DICOM을 증거에 포함하지 않는다.
