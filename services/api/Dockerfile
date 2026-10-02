FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY services/api/tsconfig.json services/api/tsconfig.json
COPY services/api/src services/api/src
RUN npm run build:api

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime

ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev

COPY --from=build --chown=node:node /workspace/services/api/dist services/api/dist
USER node
CMD ["node", "services/api/dist/main.js"]

FROM runtime AS migration

COPY --chown=node:node scripts/run-database-migrations.mjs scripts/run-database-migrations.mjs
COPY --chown=node:node services/api/src/database/migrations services/api/src/database/migrations
CMD ["node", "scripts/run-database-migrations.mjs"]

FROM build AS integration-test

COPY tests/database/patient-reference-runtime.integration.test.mjs tests/database/patient-reference-runtime.integration.test.mjs
COPY tests/database/actor-tenant-context-runtime.integration.test.mjs tests/database/actor-tenant-context-runtime.integration.test.mjs
COPY tests/database/postgres-authorization-evidence-runtime.integration.test.mjs tests/database/postgres-authorization-evidence-runtime.integration.test.mjs
COPY tests/database/patient-mapping-read-runtime.integration.test.mjs tests/database/patient-mapping-read-runtime.integration.test.mjs
COPY tests/database/exchange-session-repository-runtime.integration.test.mjs tests/database/exchange-session-repository-runtime.integration.test.mjs
COPY tests/database/exchange-session-creation-runtime.integration.test.mjs tests/database/exchange-session-creation-runtime.integration.test.mjs
COPY tests/database/consent-persistence-runtime.integration.test.mjs tests/database/consent-persistence-runtime.integration.test.mjs
COPY tests/database/transfer-grant-persistence-runtime.integration.test.mjs tests/database/transfer-grant-persistence-runtime.integration.test.mjs
COPY tests/database/pacs-transfer-operation-runtime.integration.test.mjs tests/database/pacs-transfer-operation-runtime.integration.test.mjs
COPY tests/database/pacs-import-authorization-fence.integration.test.mjs tests/database/pacs-import-authorization-fence.integration.test.mjs
COPY tests/database/consent-request-api-runtime.integration.test.mjs tests/database/consent-request-api-runtime.integration.test.mjs
COPY tests/database/consent-approval-api-runtime.integration.test.mjs tests/database/consent-approval-api-runtime.integration.test.mjs
COPY tests/database/grant-issue-api-runtime.integration.test.mjs tests/database/grant-issue-api-runtime.integration.test.mjs
COPY tests/database/provenance-repository-runtime.integration.test.mjs tests/database/provenance-repository-runtime.integration.test.mjs
COPY tests/database/source-integrity-evidence-runtime.integration.test.mjs tests/database/source-integrity-evidence-runtime.integration.test.mjs
CMD ["node", "--test", "tests/database/patient-reference-runtime.integration.test.mjs", "tests/database/actor-tenant-context-runtime.integration.test.mjs", "tests/database/postgres-authorization-evidence-runtime.integration.test.mjs", "tests/database/patient-mapping-read-runtime.integration.test.mjs"]

FROM build AS dicom-adapter-test

COPY tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs
CMD ["node", "--test", "tests/integration/orthanc-dicomweb.orthanc.integration.test.mjs"]

FROM build AS authorized-source-capture-test

COPY tests/integration/authorized-source-capture.orthanc.integration.test.mjs tests/integration/authorized-source-capture.orthanc.integration.test.mjs
COPY scripts/seed-int001-source-capture-fixture.mjs scripts/seed-int001-source-capture-fixture.mjs
COPY scripts/seed-int001-temporary-orthanc-a.mjs scripts/seed-int001-temporary-orthanc-a.mjs
COPY scripts/probe-int001-temporary-orthanc-b-empty.mjs scripts/probe-int001-temporary-orthanc-b-empty.mjs
COPY scripts/verify-int001-source-capture.mjs scripts/verify-int001-source-capture.mjs
CMD ["node", "--test", "tests/integration/authorized-source-capture.orthanc.integration.test.mjs"]
