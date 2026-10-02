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

## Synthetic CT fixture (MEDIQ-ENV-007)

## Local Test Orthanc HTTPS (MEDIQ-TLS-001)

The local Synthetic Compose profile requires a local Test CA and two distinct Orthanc certificates before starting the Orthanc containers. This is test-only PKI, not production trust material. The script is non-destructive: it never overwrites existing certificate files. The ignored `data/local-tls/` folder contains private keys; do not copy it into Git or another environment.

```powershell
./scripts/new-local-test-orthanc-certs.ps1
./scripts/validate-compose-baseline.ps1 -EnvFile .env.example
```

API and DICOM test clients use `NODE_EXTRA_CA_CERTS` to trust only the mounted test CA while retaining normal Node TLS chain and hostname validation. Orthanc healthchecks use the certificate-validating Python probe, not the upstream probe that disables verification. Run `./scripts/test-orthanc-a.ps1` and `./scripts/test-orthanc-b.ps1` for authenticated HTTPS and network-boundary checks. `MEDIQ-TLS-001` does not configure Client↔MediQ ingress TLS, mTLS, production PKI, or permit STOW through a product workflow.

## Synthetic CT fixture (MEDIQ-ENV-007)

Python 3.10+이 필요하다. Fixture와 pydicom은 로컬 ignored 경로에만 생성/설치하며 Git에 추가하지 않는다.

```powershell
python -m venv .venv-env007
.\.venv-env007\Scripts\python.exe -m pip install --disable-pip-version-check --require-hashes --only-binary=:all: -r scripts/requirements-dicom-fixture.txt
.\.venv-env007\Scripts\python.exe scripts/generate-synthetic-ct.py
.\.venv-env007\Scripts\python.exe scripts/validate-synthetic-ct.py
```

`generate-synthetic-ct.py`는 결정론적 3-instance CT fixture와 manifest를 `data/synthetic-ct-env007/`에 만든다. 같은 명령의 재실행은 바이트가 동일한지 검사하며, 예상 밖 파일이 있으면 덮어쓰지 않고 실패한다.

Hospital A/B Test Orthanc가 healthy하고 root `.env`의 A/B test credential이 각각 설정되어 있을 때만 seed한다.

```powershell
./scripts/seed-synthetic-ct.ps1
```

이 명령은 A/B 상태·격리를 확인하고 B가 비어 있음을 먼저 검사한다. A가 비었을 때만 STOW-RS로 A에 seed하며, 동일 fixture가 이미 있으면 STOW 없이 QIDO 검증만 한다. 예상 밖 데이터가 A/B에 있으면 자동 삭제하지 않고 중단한다. B는 계속 비어 있어야 한다. A seed는 테스트 fixture provisioning이지 MediQ의 승인·인가된 A→B 제품 전송이 아니다. 실제 결과와 제한은 [MEDIQ-ENV-007 evidence](../docs/implementation/MEDIQ-ENV-007/TEST-EVIDENCE.md)를 따른다.

## Local app configuration and PostgreSQL roles (MEDIQ-ENV-008)

Root `.env`는 ignored 로컬 파일이어야 한다. `.env.example`을 복사하고 `MEDIQ_POSTGRES_*` bootstrap 및 Orthanc A/B test 설정을 로컬에서 입력한 뒤 Postgres 서비스를 기동한다. API/Worker가 아직 없으므로 이 절차는 환경과 권한 경계만 준비한다.

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait postgres
./scripts/setup-local-postgres-roles.ps1
./scripts/validate-app-config.ps1
```

Role setup은 기존 PostgreSQL volume을 reset하지 않는다. 기존 역할이 없거나 placeholder라면 독립적인 로컬 runtime/migration 암호를 만들고 전용 설정·URL만 동기화하며, `mediq_runtime`에는 DDL 또는 상위 DB 권한을 부여하지 않는다. `mediq_migrator`는 빈 개발 schema의 schema-level DDL을 받으며, 향후 table grants는 검토된 migration에서 명시해야 한다. Bootstrap credential은 이 로컬 provisioning script에만 사용한다. Secret 값과 `.env` 파일은 Git, log, screenshot 또는 구현 증거에 넣지 않는다.

`validate-app-config.ps1`은 config typecheck와 unit test를 실행하고 URL/credential 대응을 값 출력 없이 검증하며 allowlist된 runtime 설정만 loader에 전달한다. 현재 loader는 container profile (`postgres:5432`, `orthanc-a`, `orthanc-b`)만 허용한다. 이는 제품 API 연결 검증이 아니다. 결과와 한계는 [MEDIQ-ENV-008 evidence](../docs/implementation/MEDIQ-ENV-008/TEST-EVIDENCE.md)를 따른다.

## P0 DB migration runner (MEDIQ-DB-001)

Drizzle Kit generates committed SQL and validates migration journal consistency; `scripts/run-database-migrations.mjs` applies the reviewed files using the dedicated `mediq_migrator` role. The runner validates the local container profile and PostgreSQL service alias, verifies the schema-only permission boundary, serializes runs with a PostgreSQL advisory lock, checks journal/file/hash history, and commits each migration plus its ledger row in the same transaction. Diagnostic output contains fixed error codes/SQLSTATE only, not connection URLs or SQL payloads.

```powershell
npm run db:migrations:check
npm run test:db-migrations
docker compose --env-file .env -f infra/docker-compose.yml --profile migration run --build --rm migrator
./scripts/test-database-migrations.ps1 -EnvFile .env
```

The migration profile is opt-in and joins only the isolated `database` network. It is not an API startup dependency. Do not grant database-level `CREATE` to make an alternative migrator work, and do not use `drizzle-kit push` or the default `drizzle-kit migrate` command. The ticket currently installs framework metadata only; schema/table grants, Tenant RLS, clean-volume provisioning, production secret rotation, and all business tables remain later gates. See [MEDIQ-DB-001 report](../docs/implementation/MEDIQ-DB-001/IMPLEMENTATION-REPORT.md) and [test evidence](../docs/implementation/MEDIQ-DB-001/TEST-EVIDENCE.md).

## P0 database schema integration tests (MEDIQ-DB-002~007)

The following repeatable scripts run the migration smoke check and exercise each additive schema with synthetic rows, negative constraints, delete restrictions, and transaction rollback. They require the ignored local root `.env` and an already-running local PostgreSQL Compose service. They do not reset or recreate the database volume.

```powershell
./scripts/test-db-002-registry.ps1 -EnvFile .env
./scripts/test-db-003-patient.ps1 -EnvFile .env
./scripts/test-db-004-exchange.ps1 -EnvFile .env
./scripts/test-db-005-consent-grant.ps1 -EnvFile .env
./scripts/test-db-006-imaging.ps1 -EnvFile .env
./scripts/test-db-007-evidence.ps1 -EnvFile .env
```

These checks establish persistence-schema behavior only. They do not prove Consent/Authorization/Grant policy enforcement, Tenant RLS/table grants, DICOM access, PACS transfer, or end-to-end product readiness. Ticket-specific outcomes belong in each linked implementation evidence record.

## Verified Actor/Tenant context acceptance (MEDIQ-IAM-002)

After the local Postgres service and synthetic Organization/Tenant/Hospital A/B/C registry are ready, execute the policy-approved additive migration and runtime-only context acceptance:

```powershell
./scripts/test-iam-002.ps1 -EnvFile .env
```

The harness invokes the migration profile with the migration-only URL, creates a uniquely tagged synthetic Actor for Hospital A, then runs the integration-test container using only the `mediq_runtime` URL. It verifies exact Actor/Tenant/Hospital resolution, the 11-column SELECT inventory, forced RLS, cross-Tenant denial and pool context cleanup. The unique test Actor (including stale fixtures from an interrupted run) is deleted in a narrowly scoped cleanup using its test-only subject prefix. IAM-002 alone does not grant PatientMapping/Exchange access; the later `PAT-002-DEC-002` separately authorizes only the exact eight-column internal synthetic mapping read. Do not use this procedure with production or real-patient data; see [IAM-002 evidence](../docs/implementation/MEDIQ-IAM-002/TEST-EVIDENCE.md).

### Full schema gate (MEDIQ-DB-008)

The full gate `./scripts/test-db-008-full-schema.ps1 -EnvFile .env` uses a uniquely generated disposable Compose project for clean migration UP, repeat application, RESET and fresh re-application, then runs DB-002~007 regression scripts against the persistent local `mediq` development database. Those regressions apply pending migrations and update its schema/ledger (but roll back their synthetic data); the full command is therefore **not scratch-only** and must not be run against production. For schema/RLS acceptance without touching that persistent project, use `./scripts/test-db-008-full-schema.ps1 -EnvFile .env -ScratchOnly`. This mode still validates the disposable DB-008 clean/repeat/reset/re-apply, exact runtime privilege/RLS catalog, and ticket-specific PostgreSQL integration tests, then removes only its verified uniquely named scratch project and skips DB-002~007 persistent regressions. Current schema baseline after PACS-001-DEC-008/009 remains 18 product tables, 24 migrations, catalog `18|50|17|42`, and 244 exact runtime column-privilege rows. StudyReference runtime privileges are exactly 10 SELECT + 4 UPDATE on the four temporary-payload metadata columns; no INSERT/DELETE/table privilege is granted. The ticket-specific integration now verifies DEC-009's filesystem purge/restart/Audit retry sequence using only synthetic bytes and the scratch database. This does not register a runtime storage path or prove real patient identity/legal consent, product authorization, DICOM transfer, STOW, or A→B completion.

## Synthetic Organization/Tenant seed (MEDIQ-ORG-001)

After DB-008 has passed and the local PostgreSQL service is healthy, seed the three synthetic hospital organizations and their isolated test tenants:

```powershell
./scripts/seed-org-001-registry.ps1 -EnvFile .env
./scripts/test-org-001-seed.ps1 -EnvFile .env
```

The seed uses the local ignored `.env`, the dedicated `mediq_migrator` role and PostgreSQL's isolated Compose network. It inserts only Organization/Tenant rows. Stable synthetic IDs/codes make repeat runs deterministic. Existing rows are never updated or deleted; incompatible identity, metadata or owner-pair conflicts abort the transaction. The test executes insert, repeat/no-op, Organization conflict, Tenant owner-pair conflict and post-rollback state checks. It does not create Hospitals, endpoints, Actors, Patients or PACS data, and does not establish runtime authorization or RLS. See [MEDIQ-ORG-001 implementation report](../docs/implementation/MEDIQ-ORG-001/IMPLEMENTATION-REPORT.md) and [test evidence](../docs/implementation/MEDIQ-ORG-001/TEST-EVIDENCE.md).

## Synthetic Hospital registry seed (MEDIQ-ORG-002)

ORG-001과 DB-008의 local Test PostgreSQL 기준선이 준비된 뒤 Hospital A/B 및 별도 negative-test Hospital C를 등록한다.

```powershell
./scripts/seed-org-002-hospital-registry.ps1 -EnvFile .env
./scripts/test-org-002-seed.ps1 -EnvFile .env
```

Seed는 안정된 synthetic ID/code로 `hospitals` 테이블만 INSERT하고, 기존 Organization/Tenant 소유 관계와 Hospital metadata를 exact-verify한다. 기존 값이 달라져 있으면 전체 transaction을 rollback하며 UPDATE/DELETE하지 않는다. 테스트는 첫 실행·반복·metadata drift·owner-pair drift와 쓰기대상 정적 검사를 수행한다. Hospital C는 registry fixture일 뿐 접근권한이나 endpoint가 아니다. 이 절차는 Endpoint/Actor/Patient/DICOM, Authorization/RLS 또는 제품 A→B 교환을 만들지 않는다. 정책은 [ORG-002-DEC-001](../docs/POLICY-DECISION-LOG.md#org-002-dec-001--synthetic-hospital-registry-fixture와-seed-동작), 결과와 한계는 [구현 보고서](../docs/implementation/MEDIQ-ORG-002/IMPLEMENTATION-REPORT.md) 및 [시험 증거](../docs/implementation/MEDIQ-ORG-002/TEST-EVIDENCE.md)를 따른다.

## DICOMweb endpoint registry seed (MEDIQ-ORG-003)

ORG-002 Hospital seed와 DB-008 local Test PostgreSQL 기준선 이후 역할별 endpoint metadata를 등록한다.

```powershell
./scripts/seed-org-003-dicomweb-endpoints.ps1 -EnvFile .env
./scripts/test-org-003-endpoint-seed.ps1 -EnvFile .env
```

A에는 QIDO/WADO, B에는 QIDO/STOW를 등록하고 C에는 endpoint를 만들지 않는다. Test Orthanc의 environment QIDO probe만 확인된 범위이므로 QIDO 두 개만 enabled이며, WADO와 B STOW는 disabled로 남긴다. `.env`의 HTTP URL은 `orthanc-a/b:8042` allowlist와 URL component를 검사하고 `/dicom-web` base를 추가한다. Seed는 URL을 metadata로만 저장하며 Orthanc에 연결하지 않고 credential도 database에 넣지 않는다. 기존 metadata drift는 rollback하며 UPDATE/DELETE하지 않는다. 정책은 [ORG-003-DEC-001](../docs/POLICY-DECISION-LOG.md#org-003-dec-001--role-aligned-dicomweb-endpoint-registry와-활성화-기준), 결과는 [구현 보고서](../docs/implementation/MEDIQ-ORG-003/IMPLEMENTATION-REPORT.md)와 [시험 증거](../docs/implementation/MEDIQ-ORG-003/TEST-EVIDENCE.md)를 따른다. `enabled`는 endpoint readiness나 authorization이 아니며, WADO/B-STOW 및 제품 전송은 별도 capability/Acceptance가 필요하다.

현재 제공 서비스의 readiness를 한 번에 재검증하려면 다음을 실행한다.

```powershell
./scripts/test-environment-health.ps1
```

이 명령은 PostgreSQL runtime role로 `SELECT 1`, Hospital A/B 인증·QIDO·격리 probe, health-only API의 liveness/readiness를 검사한다. 현재 ENV-009 operational scope에서 전체 gate가 PASS한다. API route는 운영 상태 확인만 제공하며 제품 권한·업무 API가 아니다. 의존성만 확인해야 하는 경우 `-DependenciesOnly`를 사용할 수 있으며, 그 결과는 전체 PASS가 아니라 scoped dependency-only 결과로 기록된다. 자세한 증거는 [MEDIQ-ENV-009 evidence](../docs/implementation/MEDIQ-ENV-009/TEST-EVIDENCE.md)를 확인한다.

## 후속 스크립트

- `./scripts/test-environment-smoke.ps1` — Compose 경계 검사, 합성 CT manifest/hash validation, API/DB/A/B health 및 A-only fixture 상태를 하나의 실행으로 확인 (MEDIQ-ENV-010)
- 제품 API/Worker 통합 smoke test
- DICOMweb WADO·Hospital B STOW·destination verification Acceptance
- Audit/integrity 검증 리포트 생성
