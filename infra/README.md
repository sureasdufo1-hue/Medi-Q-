# Local Infrastructure

이 디렉터리는 Hospital A/B Test Orthanc와 로컬 개발 의존 서비스를 둔다.

현재 파일:

- `docker-compose.yml`

Compose는 PostgreSQL 18.6 및 Hospital A/B Test Orthanc 1.13 계열을 별도 internal network와 persistent volume으로 정의한다. PostgreSQL은 호스트 포트를 공개하지 않고 `postgres:5432`를 같은 DB network에 연결된 컨테이너에서만 사용한다. Orthanc DICOM·HTTP host port는 설정상 `127.0.0.1`에 publish되도록 선언되어 있으나, internal network와 함께 쓸 때의 runtime 도달성은 ENV-005/006에서 검증 전이다. 상세 version/digest와 초기 경계 검증은 [`../docs/implementation/MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md`](../docs/implementation/MEDIQ-ENV-003/IMPLEMENTATION-REPORT.md)를, Postgres runtime 검증은 [`../docs/implementation/MEDIQ-ENV-004/IMPLEMENTATION-REPORT.md`](../docs/implementation/MEDIQ-ENV-004/IMPLEMENTATION-REPORT.md)를 따른다.

`.env.example`을 root `.env`로 복사하고 placeholder를 교체한 뒤 사용한다. `MEDIQ_DATABASE_URL`의 암호는 `MEDIQ_POSTGRES_PASSWORD`와 일치시켜야 하며 Orthanc A/B에는 서로 다른 암호를 설정한다. `.env`는 Git에서 제외된다. 이 Compose는 synthetic/test 데이터 전용이며 실제 PACS 주소·Credential·운영 데이터에 연결하지 않는다. `docker compose --env-file .env.example -f infra/docker-compose.yml config --quiet`는 구성 해석만 하며 container 실행·health·DICOMweb capability를 입증하지 않는다. 경계 검사는 `./scripts/validate-compose-baseline.ps1 -EnvFile .env.example`로 재현할 수 있다.

로컬 Postgres만 기동하고 readiness·인증 연결을 확인하려면 다음을 실행한다. 이 명령은 Orthanc A/B를 시작하지 않으며, Postgres는 호스트에 port를 공개하지 않는다.

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait postgres
docker compose --env-file .env -f infra/docker-compose.yml ps postgres
docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "SELECT 1;"'
```

Postgres container healthcheck는 `pg_isready`가 설정된 사용자·DB에서 응답하는지를 확인한다. 인증된 SQL 연결은 별도로 검증한다. 같은 `database` network의 API container는 `postgres:5432`를 사용한다. Host에서 실행하는 애플리케이션의 연결 프로파일은 ENV-008에서 확정하며, 내부 전용 DB에 맞지 않는 `localhost` 포트 우회는 하지 않는다. Compose의 `--wait` 또는 health 상태는 앱 schema, Migration, API 연결이나 Phase 0 Acceptance 통과를 뜻하지 않는다. 현재 시험 결과는 [`MEDIQ-ENV-004`](../docs/implementation/MEDIQ-ENV-004/TEST-EVIDENCE.md)에서 확인한다.

PostgreSQL startup·health·restart·internal-network 연결은 ENV-004에서 검증했다. Orthanc A/B startup·health/DICOMweb capability와 Synthetic DICOM seed는 ENV-005~007에서 단계별로 확인한다. MediQ API/Worker가 아직 포함되지 않으므로 현재 정의만으로 Phase 0 Acceptance Gate를 충족하지 않는다.

DICOMweb endpoint, Orthanc capability, TLS, size 및 retry 기준은 [`../docs/DICOM-INTEROPERABILITY-PROFILE.md`](../docs/DICOM-INTEROPERABILITY-PROFILE.md)를 따른다.
