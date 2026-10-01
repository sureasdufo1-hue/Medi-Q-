# Local Infrastructure

이 디렉터리는 Hospital A/B Test Orthanc와 로컬 개발 의존 서비스를 둔다.

현재 파일:

- `docker-compose.yml`

Compose는 PostgreSQL 18.6 및 Hospital A/B Test Orthanc 1.13 계열을 각각 별도 internal network와 persistent volume으로 정의한다. PostgreSQL과 A/B Orthanc는 host port를 공개하지 않는다. ENV-005/006에서 A와 B의 internal network에 컨테이너 peer만 접근할 수 있고 A/B 간 service-network 경로가 격리됨을 확인했다. A/B에는 서로 다른 로컬 test password를 사용한다. `TLS-001-DEC-001`에 따라 local Synthetic profile의 API↔Orthanc에는 Orthanc 내장 HTTPS, A/B별 인증서, 로컬 Test CA, strict CA/hostname validation을 적용했으며 `MEDIQ-TLS-001` local Acceptance는 scoped PASS다. 이는 production TLS topology 결정이 아니다. 상세 version/digest와 config 경계는 [`../docs/implementation/MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md`](../docs/implementation/MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md)를, A/B runtime 검증은 [`../docs/implementation/MEDIQ-ENV-005/TEST-EVIDENCE.md`](../docs/implementation/MEDIQ-ENV-005/TEST-EVIDENCE.md) 및 [`../docs/implementation/MEDIQ-ENV-006/TEST-EVIDENCE.md`](../docs/implementation/MEDIQ-ENV-006/TEST-EVIDENCE.md)를 따른다.

`.env.example`을 root `.env`로 복사하고 PostgreSQL bootstrap 및 Orthanc A/B placeholder를 로컬 전용 값으로 교체한다. Orthanc를 기동하기 전에 `./scripts/new-local-test-orthanc-certs.ps1`을 실행해 ignored `data/local-tls/` 아래 CA와 A/B 인증서를 만든다. 이 private key는 합성 로컬 테스트 전용이며 다른 환경에서 재사용하지 않는다. 그 다음 `./scripts/setup-local-postgres-roles.ps1`을 실행해 별도 `mediq_runtime`·`mediq_migrator` 암호와 URL을 생성·동기화하고 권한을 적용한다. API는 runtime URL만 받고, bootstrap 계정은 초기화/로컬 role provisioning 전용, migration 계정은 승인된 Migration 전용이다. `.env`는 Git에서 제외된다. 이 Compose는 synthetic/test 데이터 전용이며 실제 PACS 주소·Credential·운영 데이터에 연결하지 않는다. `docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet`는 구성 해석만 하며 container 실행·health·DICOMweb capability를 입증하지 않는다. 경계 검사는 `./scripts/validate-compose-baseline.ps1 -EnvFile .env.example`로 재현할 수 있다.

로컬 Postgres만 기동하고 readiness·인증 연결을 확인하려면 다음을 실행한다. 이 명령은 Orthanc A/B를 시작하지 않으며, Postgres는 호스트에 port를 공개하지 않는다.

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait postgres
docker compose --env-file .env -f infra/docker-compose.yml ps postgres
docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "SELECT 1;"'
```

Postgres container healthcheck는 `pg_isready`가 설정된 사용자·DB에서 응답하는지를 확인한다. ENV-008에서 app config loader는 container profile만 허용하며 runtime role은 `postgres:5432`를 사용한다. Host에서 실행하는 앱 프로파일은 아직 승인·구현되지 않았으므로 내부 전용 DB에 맞지 않는 `localhost` 포트 우회는 하지 않는다. Compose의 `--wait` 또는 health 상태는 앱 schema, Migration, API 연결이나 Phase 0 Acceptance 통과를 뜻하지 않는다. PostgreSQL startup 증거는 [`MEDIQ-ENV-004`](../docs/implementation/MEDIQ-ENV-004/TEST-EVIDENCE.md), role/config 경계는 [`MEDIQ-ENV-008`](../docs/implementation/MEDIQ-ENV-008/TEST-EVIDENCE.md)에서 확인한다.

PostgreSQL startup·health·restart·internal-network 연결은 ENV-004에서 검증했다. ENV-008은 app config validation 및 bootstrap/runtime/migration role 분리와 least-privilege를 다룬다. A/B Orthanc readiness·인증·네트워크/볼륨 경계는 ENV-005/006 범위에서 검증했다. `MEDIQ-TLS-001`은 local API↔Test Orthanc HTTPS Acceptance를 scoped PASS로 완료했다; Client↔MediQ TLS와 production certificate architecture는 미완료다. ENV-007은 결정론적 합성 CT를 A에 STOW seed하고 A의 QIDO에서 1 Study/1 Series/3 Instance, B의 QIDO에서 0 Study를 확인했다. 재실행은 A에 추가 STOW를 하지 않는다. ENV-009는 health-only API와 DB/A/B operational readiness를 확인했다. ENV-010의 통합 환경 smoke는 [`../scripts/test-environment-smoke.ps1`](../scripts/test-environment-smoke.ps1)로 수행한다. fixture/environment PASS는 B 반입, MediQ 제품 전송 또는 Phase 0 Acceptance가 아니다. product/business API와 Worker 흐름은 아직 구현되지 않았다. 재현 방법은 [`../scripts/README.md`](../scripts/README.md)를 따른다.

## P0 migration framework (MEDIQ-DB-001)

Drizzle Kit은 migration SQL 생성과 journal consistency 검사에만 사용한다. DB 적용은 dedicated one-shot `mediq_migrator` 이미지/role이 맡는다. Role은 `public` schema 내부 객체 변경만 가능하며 database-level `CREATE`는 없다. API/Worker 설정에는 migration URL이 없고, migrator는 default Compose run에 포함되지 않는다.

제품이 아닌 baseline/migration을 명시적으로 확인하려면 다음을 실행한다. 스크립트는 기존 PostgreSQL volume을 유지하고, 승인된 baseline migration history를 확인하기 위해 두 번 적용한다.

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile migration run --build --rm migrator
./scripts/test-database-migrations.ps1 -EnvFile .env
```

Migration SQL은 먼저 `npm run db:generate`로 생성하고 검토 후 commit한다. `drizzle-kit push` 또는 기본 `drizzle-kit migrate`를 사용하지 않는다. 상태·제약·미검증 범위는 [`MEDIQ-DB-001`](../docs/implementation/MEDIQ-DB-001/IMPLEMENTATION-REPORT.md)과 [시험 증거](../docs/implementation/MEDIQ-DB-001/TEST-EVIDENCE.md)를 따른다. 이 시점에는 framework ledger만 존재하며 17개 제품 테이블은 아직 없다.

DICOMweb endpoint, Orthanc capability, TLS, size 및 retry 기준은 [`../docs/DICOM-INTEROPERABILITY-PROFILE.md`](../docs/DICOM-INTEROPERABILITY-PROFILE.md)를 따른다.

PostgreSQL·Hospital A/B와 health-only API의 전체 operational readiness를 재검증하려면 다음을 실행한다.

```powershell
./scripts/test-environment-health.ps1
```

이 명령은 runtime-role `SELECT 1`, A/B 인증 QIDO·격리 probe, API liveness/readiness를 확인한다. 현재 ENV-009 결과는 operational health scope PASS다. API는 health 전용이며 product/business endpoint가 아니고, 이 결과는 schema/migration·Tenant RLS·WADO·A→B 제품 교환·P0 Acceptance를 의미하지 않는다. 자세한 재현 결과는 [`../docs/implementation/MEDIQ-ENV-009/TEST-EVIDENCE.md`](../docs/implementation/MEDIQ-ENV-009/TEST-EVIDENCE.md)를 따른다.
