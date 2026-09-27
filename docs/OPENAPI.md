아래는 앞서 확정한 Domain/Data/ERD를 **업무 행위 중심 HTTP API Contract**로 변환한 `OPENAPI.yaml`입니다. 핵심적으로 `organizations`, `consents`, `transfer_grants` 같은 테이블을 그대로 CRUD로 공개하지 않고, MediQ의 실제 Workflow를 API로 노출합니다.

```yaml
openapi: 3.1.0

info:
  title: MediQ API
  version: 1.1.0
  description: |
    MediQ Capstone Technical MVP API.

    MediQ는 Patient-Controlled Medical Imaging Mobility SaaS이며,
    본 API는 Synthetic/Test DICOM 환경의 P0 E2E 의료영상 교환을 지원한다.

    핵심 Workflow:

      Patient Mapping
        → Exchange Session
        → Consent
        → Authorization
        → Transfer Grant
        → VIEW / DOWNLOAD / PACS_IMPORT
        → Provenance / Audit

    설계 원칙:

    - Database CRUD 중심 API를 사용하지 않는다.
    - 모든 보호된 의료영상 Action은 Backend Authorization을 통과한다.
    - Consent != Authorization != Transfer Grant.
    - Hospital-local Patient ID != MediQ PatientReference.
    - Viewer / Download / PACS Import는 독립적인 Scope를 가진다.
    - Hospital PACS는 의료영상의 Source of Record다.
    - MediQ Cloud는 Permanent PACS 또는 장기 영상 Archive가 아니다.
    - Hospital User 및 Synthetic Patient Viewer는 short-lived ViewerSession을 사용한다.
    - Viewer 영상은 Source PACS에서 WADO-RS로 온디맨드 조회한다.
    - PACS endpoint와 credential은 Client에 노출하지 않는다.
    - 보안 검증 실패 시 Fail Closed를 적용한다.
    - 실제 환자 데이터 및 실제 의료기관 Production 데이터는 P0에서 사용하지 않는다.

  x-mediq-baseline-amendment: 2026-09-15-viewer-architecture

servers:
  - url: https://localhost:8443/api/v1
    description: MediQ local capstone environment

security:
  - bearerAuth: []

tags:
  - name: Exchange
    description: Medical imaging exchange workflow
  - name: Patient Mapping
    description: Synthetic patient mapping validation
  - name: Consent
    description: Consent workflow
  - name: Grant
    description: Scoped transfer grants
  - name: Imaging
    description: Study discovery and imaging actions
  - name: Viewer
    description: Short-lived authorized DICOMweb viewer sessions and delivery
  - name: Evidence
    description: Provenance and audit evidence

paths:

  /exchange-sessions:
    post:
      tags: [Exchange]
      operationId: createExchangeSession
      summary: Create medical imaging exchange
      description: |
        새로운 의료영상 교환 업무를 생성한다.

        requester_actor_id 및 caller tenant는 Request Body로 신뢰하지 않고
        인증된 Security Context에서 결정한다.

        ExchangeSession은 ImagingPackage와 별도의 Domain Object다.
      parameters:
        - $ref: '#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateExchangeRequest'
      responses:
        '201':
          description: Exchange created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ExchangeSession'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'

  /exchange-sessions/{sessionId}:
    get:
      tags: [Exchange]
      operationId: getExchangeSession
      summary: Get authorized exchange session
      description: |
        요청자가 조회 권한을 가진 ExchangeSession만 반환한다.

        sessionId를 알고 있다는 사실만으로 접근을 허용하지 않는다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Authorized exchange session
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ExchangeSession'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'

  /exchange-sessions/{sessionId}/patient-mapping/validate:
    post:
      tags: [Patient Mapping]
      operationId: validateDestinationPatientMapping
      summary: Validate destination patient mapping
      description: |
        PACS_IMPORT 전에 Destination Hospital의 PatientMapping을 확인한다.

        VALID 상태만 전송에 사용할 수 있다.

        UNVERIFIED / AMBIGUOUS / REVOKED / NOT_FOUND
        상태에서는 PACS Import가 허용되지 않는다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Mapping validation result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PatientMappingValidation'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'

  /exchange-sessions/{sessionId}/studies:
    get:
      tags: [Imaging]
      operationId: listExchangeStudies
      summary: List studies available to the exchange
      description: |
        ExchangeSession의 Source Hospital 및 PatientReference에 연결된
        허가 가능한 Test DICOM Study 목록을 반환한다.

        내부적으로 QIDO-RS를 사용할 수 있다.

        StudyInstanceUID 자체는 Authorization Credential이 아니다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Available studies
          content:
            application/json:
              schema:
                type: object
                required:
                  - sessionId
                  - studies
                properties:
                  sessionId:
                    type: string
                    format: uuid
                  studies:
                    type: array
                    items:
                      $ref: '#/components/schemas/StudyReference'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '502':
          $ref: '#/components/responses/UpstreamFailure'

  /exchange-sessions/{sessionId}/consents/request:
    post:
      tags: [Consent]
      operationId: requestConsent
      summary: Create consent request
      description: |
        ExchangeSession에 대한 ConsentArtifact를 생성하고
        Session을 CONSENT_PENDING 상태로 전환한다.

        Consent는 단순 Boolean 값이 아니며 별도 Evidence Artifact다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateConsentRequest'
      responses:
        '201':
          description: Consent request created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Consent'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'

  /exchange-sessions/{sessionId}/consents/{consentId}/approve:
    post:
      tags: [Consent]
      operationId: approveConsent
      summary: Approve synthetic technical consent
      description: |
        Capstone Technical Consent Workflow에서 Consent를 ACTIVE로 만든다.

        본 Action은 실제 법률상 의료정보 제공 동의의 유효성을
        주장하지 않는다.

        Consent 승인 자체는 Resource 접근 Authorization이 아니다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/ConsentId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Consent activated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Consent'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'

  /exchange-sessions/{sessionId}/consents/{consentId}/withdraw:
    post:
      tags: [Consent]
      operationId: withdrawConsent
      summary: Withdraw consent
      description: |
        Consent를 WITHDRAWN 상태로 변경한다.

        WITHDRAWN Consent를 근거로 신규 TransferGrant를 발급해서는 안 된다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/ConsentId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Consent withdrawn
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Consent'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'

  /exchange-sessions/{sessionId}/grants/issue:
    post:
      tags: [Grant]
      operationId: issueTransferGrant
      summary: Issue scoped transfer grant
      description: |
        ACTIVE Consent와 Authorization Policy를 평가한 후
        제한된 TransferGrant를 발급한다.

        Grant Scope는 Consent Allowed Action을 초과할 수 없다.

        지원 P0 Scope:

        - study:view
        - study:download
        - study:pacs-transfer
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/IssueGrantRequest'
      responses:
        '201':
          description: Grant issued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransferGrant'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          description: |
            Authorization denied.

            Possible reasons include:
            - no active consent
            - requested scope exceeds consent
            - wrong tenant
            - wrong recipient
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '409':
          $ref: '#/components/responses/Conflict'

  /exchange-sessions/{sessionId}/grants/{grantId}/revoke:
    post:
      tags: [Grant]
      operationId: revokeTransferGrant
      summary: Revoke transfer grant
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/GrantId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Grant revoked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransferGrant'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'

  /exchange-sessions/{sessionId}/actions/view:
    post:
      tags: [Imaging]
      operationId: authorizeViewerAccess
      summary: Authorize web viewer access
      x-mediq-requirements: [REQ-VIEW-004, REQ-VIEW-005, REQ-VIEW-007]
      x-mediq-security: [SEC-VIEW-001, SEC-VIEW-002, SEC-VIEW-004, SEC-VIEW-005]
      x-mediq-acceptance: [TC-VIEW-004, TC-VIEW-005, TC-VIEW-007]
      description: |
        VIEW Action을 수행한다.

        필수 검증:

        - authenticated actor
        - valid tenant
        - valid ExchangeSession
        - ACTIVE Consent
        - ACTIVE TransferGrant
        - study:view
        - correct recipient
        - correct resource
        - actor type and PatientReference binding

        Viewer URL 또는 StudyInstanceUID를 아는 것만으로 접근할 수 없다.
        반환되는 URL은 MediQ가 통제하는 short-lived ViewerSession entry point이며
        Hospital PACS endpoint 또는 credential을 포함하지 않는다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ViewActionRequest'
      responses:
        '200':
          description: Short-lived viewer access granted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ViewerAccess'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '502':
          $ref: '#/components/responses/UpstreamFailure'

  /viewer-sessions/{viewerSessionId}:
    get:
      tags: [Viewer]
      operationId: getViewerSession
      summary: Get authorized viewer session state
      x-mediq-requirements: [REQ-VIEW-007]
      x-mediq-security: [SEC-VIEW-002, SEC-VIEW-004]
      x-mediq-acceptance: [TC-VIEW-007, TC-SEC-VIEW-002]
      description: |
        인증된 Actor가 자신에게 binding된 ViewerSession 상태를 조회한다.
        서버는 매 요청마다 Actor, Tenant, PatientReference, Consent, Grant와 expiry를 재검증한다.
      parameters:
        - $ref: '#/components/parameters/ViewerSessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Viewer session state
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ViewerSession'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '410':
          $ref: '#/components/responses/ViewerSessionExpired'
    delete:
      tags: [Viewer]
      operationId: closeViewerSession
      summary: Close a viewer session
      x-mediq-requirements: [REQ-VIEW-007]
      x-mediq-security: [SEC-VIEW-004]
      x-mediq-acceptance: [TC-VIEW-007]
      parameters:
        - $ref: '#/components/parameters/ViewerSessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '204':
          description: Viewer session closed
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'

  /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}:
    get:
      tags: [Viewer]
      operationId: retrieveViewerDicomInstance
      summary: Retrieve one authorized DICOM instance on demand
      x-mediq-requirements: [REQ-VIEW-006, REQ-VIEW-008, REQ-VIEW-009]
      x-mediq-security: [SEC-VIEW-001, SEC-VIEW-002, SEC-VIEW-003, SEC-VIEW-005]
      x-mediq-acceptance: [TC-VIEW-006, TC-VIEW-008, TC-VIEW-009]
      description: |
        MediQ Backend가 Source Hospital PACS에 WADO-RS 요청을 수행하고 결과를 점진적으로 전달한다.
        Client는 Source PACS endpoint, credential 또는 raw storage reference를 받지 않는다.
        VIEW scope만 검증하며 Download, PACS Import 또는 Mobile Export 권한으로 승격하지 않는다.
      parameters:
        - $ref: '#/components/parameters/ViewerSessionId'
        - $ref: '#/components/parameters/StudyRefId'
        - $ref: '#/components/parameters/SopInstanceUid'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Authorized DICOM instance from the Source PACS
          headers:
            Cache-Control:
              description: Sensitive viewer responses must not be persistently cached
              schema:
                type: string
                const: private, no-store
          content:
            application/dicom:
              schema:
                type: string
                format: binary
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '410':
          $ref: '#/components/responses/ViewerSessionExpired'
        '502':
          $ref: '#/components/responses/UpstreamFailure'

  /viewer-sessions/{viewerSessionId}/studies/{studyRefId}/instances/{sopInstanceUid}/frames/{frameNumber}:
    get:
      tags: [Viewer]
      operationId: retrieveViewerFrame
      summary: Retrieve one authorized rendered frame on demand
      x-mediq-requirements: [REQ-VIEW-006, REQ-VIEW-008, REQ-VIEW-009]
      x-mediq-security: [SEC-VIEW-001, SEC-VIEW-002, SEC-VIEW-003, SEC-VIEW-005]
      x-mediq-acceptance: [TC-VIEW-006, TC-VIEW-008, TC-VIEW-009]
      description: |
        Source PACS의 WADO-RS frame 또는 rendered retrieval을 MediQ Viewer Gateway가 중계한다.
        Source PACS가 unavailable이거나 session binding을 검증할 수 없으면 Fail Closed한다.
      parameters:
        - $ref: '#/components/parameters/ViewerSessionId'
        - $ref: '#/components/parameters/StudyRefId'
        - $ref: '#/components/parameters/SopInstanceUid'
        - $ref: '#/components/parameters/FrameNumber'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Authorized rendered frame from the Source PACS
          headers:
            Cache-Control:
              description: Sensitive viewer responses must not be persistently cached
              schema:
                type: string
                const: private, no-store
          content:
            image/jpeg:
              schema:
                type: string
                format: binary
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '410':
          $ref: '#/components/responses/ViewerSessionExpired'
        '502':
          $ref: '#/components/responses/UpstreamFailure'

  /exchange-sessions/{sessionId}/actions/download:
    post:
      tags: [Imaging]
      operationId: downloadDicomStudy
      summary: Download authorized DICOM study
      description: |
        DOWNLOAD Action을 수행한다.

        반드시 study:download Scope가 필요하다.

        study:view Scope만 가진 Grant로는 다운로드할 수 없다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DownloadActionRequest'
      responses:
        '200':
          description: Authorized DICOM package
          headers:
            Content-Disposition:
              schema:
                type: string
              description: Suggested download filename
          content:
            application/zip:
              schema:
                type: string
                format: binary
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '502':
          $ref: '#/components/responses/UpstreamFailure'

  /exchange-sessions/{sessionId}/actions/pacs-import:
    post:
      tags: [Imaging]
      operationId: importStudyToDestinationPacs
      summary: Transfer study to destination PACS
      description: |
        MediQ P0의 핵심 Hospital-to-Hospital 의료영상 전송 Action.

        필수 검증:

        - valid authentication
        - valid tenant
        - valid ExchangeSession
        - ACTIVE Consent
        - ACTIVE Grant
        - study:pacs-transfer
        - destination matches session
        - destination matches consent
        - destination matches grant
        - VALID destination PatientMapping
        - allowed STOW-RS endpoint

        성공 판정:

        WADO-RS retrieval
          → STOW-RS
          → destination verification
          → integrity VERIFIED
          → provenance COMPLETED
          → audit PACS_TRANSFER_COMPLETED

        Integrity FAILED 상태에서는 COMPLETED를 반환해서는 안 된다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PacsImportActionRequest'
      responses:
        '200':
          description: PACS import completed and verified
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PacsImportResult'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          description: |
            Domain precondition failed.

            Examples:
            - invalid patient mapping
            - invalid session state
            - destination mismatch
            - consent mismatch
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '502':
          $ref: '#/components/responses/UpstreamFailure'

  /exchange-sessions/{sessionId}/provenance:
    get:
      tags: [Evidence]
      operationId: getExchangeProvenance
      summary: Get authorized exchange provenance
      description: |
        해당 Session에서 의료영상이 어디에서 시작하여
        어디로 전달되었는지 Data Movement Evidence를 반환한다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Provenance records
          content:
            application/json:
              schema:
                type: object
                required:
                  - sessionId
                  - records
                properties:
                  sessionId:
                    type: string
                    format: uuid
                  records:
                    type: array
                    items:
                      $ref: '#/components/schemas/ProvenanceRecord'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'

  /exchange-sessions/{sessionId}/audit-events:
    get:
      tags: [Evidence]
      operationId: getExchangeAuditEvents
      summary: Get authorized exchange audit trail
      description: |
        Exchange lifecycle에 대한 허가된 Audit Event를 시간순으로 조회한다.

        DICOM Binary, Password, Raw Token, Private Key는 반환하지 않는다.
      parameters:
        - $ref: '#/components/parameters/SessionId'
        - $ref: '#/components/parameters/CorrelationId'
      responses:
        '200':
          description: Audit trail
          content:
            application/json:
              schema:
                type: object
                required:
                  - sessionId
                  - events
                properties:
                  sessionId:
                    type: string
                    format: uuid
                  events:
                    type: array
                    items:
                      $ref: '#/components/schemas/AuditEvent'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '403':
          $ref: '#/components/responses/Forbidden'

components:

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: |
        MediQ authentication context.

        Token 기반 구현을 사용하는 경우 서버는 최소 다음을 검증한다:

        - issuer
        - audience
        - expiration
        - scope / authority
        - token identifier where applicable

        Tenant identity는 인증된 Actor Context에서 결정하며
        임의의 Request Body tenant_id 값을 Authorization 근거로 신뢰하지 않는다.

  parameters:

    SessionId:
      name: sessionId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    ConsentId:
      name: consentId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    GrantId:
      name: grantId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    ViewerSessionId:
      name: viewerSessionId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    StudyRefId:
      name: studyRefId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    SopInstanceUid:
      name: sopInstanceUid
      in: path
      required: true
      schema:
        type: string
        minLength: 1
        maxLength: 128
        pattern: '^[0-9]+(\.[0-9]+)*$'

    FrameNumber:
      name: frameNumber
      in: path
      required: true
      schema:
        type: integer
        minimum: 1

    CorrelationId:
      name: X-Correlation-ID
      in: header
      required: false
      description: Optional request correlation identifier
      schema:
        type: string
        format: uuid

  responses:

    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    Unauthenticated:
      description: Authentication required or invalid
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    Forbidden:
      description: Authorization denied
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    NotFound:
      description: Resource not found or not visible to the caller
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    Conflict:
      description: Domain state or invariant conflict
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    UpstreamFailure:
      description: DICOMweb Source PACS or destination PACS operation failed; no permanent cloud copy fallback is used
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    ViewerSessionExpired:
      description: Viewer session expired, revoked or closed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

  schemas:

    CreateExchangeRequest:
      type: object
      additionalProperties: false
      required:
        - patientRefId
        - sourceHospitalId
        - destinationHospitalId
        - purpose
      properties:
        patientRefId:
          type: string
          format: uuid
        sourceHospitalId:
          type: string
          format: uuid
        destinationHospitalId:
          type: string
          format: uuid
        purpose:
          type: string
          minLength: 1
          maxLength: 255
        requestedStudyInstanceUIDs:
          type: array
          uniqueItems: true
          items:
            type: string
            minLength: 1
            maxLength: 128
          description: |
            Optional source study selection.
            When supplied, the application may register the corresponding
            ImagingPackage and StudyReference metadata.

    ExchangeSession:
      type: object
      additionalProperties: false
      required:
        - sessionId
        - patientRefId
        - sourceHospitalId
        - destinationHospitalId
        - state
        - createdAt
      properties:
        sessionId:
          type: string
          format: uuid
        patientRefId:
          type: string
          format: uuid
        sourceHospitalId:
          type: string
          format: uuid
        destinationHospitalId:
          type: string
          format: uuid
        purpose:
          type: string
        state:
          $ref: '#/components/schemas/ExchangeSessionState'
        imagingPackageId:
          type: string
          format: uuid
        createdAt:
          type: string
          format: date-time
        expiresAt:
          type: string
          format: date-time
        completedAt:
          type: string
          format: date-time

    ExchangeSessionState:
      type: string
      enum:
        - REQUESTED
        - CONSENT_PENDING
        - CONSENTED
        - AUTHORIZED
        - READY
        - ACTIVE
        - COMPLETED
        - REJECTED
        - EXPIRED
        - REVOKED
        - FAILED
        - CANCELLED

    PatientMappingValidation:
      type: object
      additionalProperties: false
      required:
        - sessionId
        - patientRefId
        - destinationHospitalId
        - status
        - pacsImportAllowed
      properties:
        sessionId:
          type: string
          format: uuid
        patientRefId:
          type: string
          format: uuid
        destinationHospitalId:
          type: string
          format: uuid
        localPatientId:
          type: string
        status:
          type: string
          enum:
            - VALID
            - UNVERIFIED
            - AMBIGUOUS
            - REVOKED
            - NOT_FOUND
        pacsImportAllowed:
          type: boolean

    StudyReference:
      type: object
      additionalProperties: false
      required:
        - studyRefId
        - studyInstanceUID
        - sourceHospitalId
      properties:
        studyRefId:
          type: string
          format: uuid
        studyInstanceUID:
          type: string
          maxLength: 128
        sourceHospitalId:
          type: string
          format: uuid
        modality:
          type: string
          maxLength: 16
        seriesCount:
          type: integer
          minimum: 0
        instanceCount:
          type: integer
          minimum: 0

    CreateConsentRequest:
      type: object
      additionalProperties: false
      required:
        - allowedActions
      properties:
        imagingPackageId:
          type: string
          format: uuid
        allowedActions:
          type: array
          minItems: 1
          uniqueItems: true
          items:
            $ref: '#/components/schemas/ConsentAction'
        expiresAt:
          type: string
          format: date-time

    ConsentAction:
      type: string
      enum:
        - VIEW
        - DOWNLOAD
        - PACS_IMPORT

    Consent:
      type: object
      additionalProperties: false
      required:
        - consentId
        - sessionId
        - patientRefId
        - sourceHospitalId
        - destinationHospitalId
        - status
        - consentVersion
        - allowedActions
      properties:
        consentId:
          type: string
          format: uuid
        sessionId:
          type: string
          format: uuid
        patientRefId:
          type: string
          format: uuid
        sourceHospitalId:
          type: string
          format: uuid
        destinationHospitalId:
          type: string
          format: uuid
        imagingPackageId:
          type: string
          format: uuid
        status:
          $ref: '#/components/schemas/ConsentStatus'
        consentVersion:
          type: integer
          minimum: 1
        allowedActions:
          type: array
          items:
            $ref: '#/components/schemas/ConsentAction'
        issuedAt:
          type: string
          format: date-time
        expiresAt:
          type: string
          format: date-time
        withdrawnAt:
          type: string
          format: date-time

    ConsentStatus:
      type: string
      enum:
        - PENDING
        - ACTIVE
        - WITHDRAWN
        - EXPIRED
        - REJECTED

    IssueGrantRequest:
      type: object
      additionalProperties: false
      required:
        - consentId
        - recipientHospitalId
        - scopes
        - expiresAt
      properties:
        consentId:
          type: string
          format: uuid
        recipientHospitalId:
          type: string
          format: uuid
        recipientActorId:
          type: string
          format: uuid
        imagingPackageId:
          type: string
          format: uuid
        scopes:
          type: array
          minItems: 1
          uniqueItems: true
          items:
            $ref: '#/components/schemas/GrantScope'
        expiresAt:
          type: string
          format: date-time

    GrantScope:
      type: string
      enum:
        - study:view
        - study:download
        - study:pacs-transfer

    TransferGrant:
      type: object
      additionalProperties: false
      required:
        - grantId
        - sessionId
        - consentId
        - recipientTenantId
        - recipientHospitalId
        - scopes
        - status
        - issuedAt
        - expiresAt
      properties:
        grantId:
          type: string
          format: uuid
        sessionId:
          type: string
          format: uuid
        consentId:
          type: string
          format: uuid
        recipientTenantId:
          type: string
          format: uuid
        recipientHospitalId:
          type: string
          format: uuid
        recipientActorId:
          type: string
          format: uuid
        imagingPackageId:
          type: string
          format: uuid
        scopes:
          type: array
          items:
            $ref: '#/components/schemas/GrantScope'
        status:
          $ref: '#/components/schemas/GrantStatus'
        issuedAt:
          type: string
          format: date-time
        expiresAt:
          type: string
          format: date-time
        revokedAt:
          type: string
          format: date-time

    GrantStatus:
      type: string
      enum:
        - ACTIVE
        - EXPIRED
        - REVOKED
        - CONSUMED

    ViewActionRequest:
      type: object
      additionalProperties: false
      required:
        - grantId
        - studyRefId
        - actorType
      properties:
        grantId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid
        actorType:
          $ref: '#/components/schemas/ViewerActorType'

    ViewerAccess:
      type: object
      additionalProperties: false
      required:
        - viewerSessionId
        - sessionId
        - studyRefId
        - viewerUrl
        - deliveryMode
        - sourceOfRecord
        - expiresAt
      properties:
        viewerSessionId:
          type: string
          format: uuid
        sessionId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid
        viewerUrl:
          type: string
          description: |
            Short-lived application-controlled Viewer entry point.
            It must not expose PACS endpoints, credentials or raw storage_ref values.
        deliveryMode:
          type: string
          const: ON_DEMAND_DICOMWEB
        sourceOfRecord:
          type: string
          const: SOURCE_HOSPITAL_PACS
        expiresAt:
          type: string
          format: date-time

    ViewerActorType:
      type: string
      enum:
        - HOSPITAL_USER
        - PATIENT

    ViewerSessionStatus:
      type: string
      enum:
        - ACTIVE
        - EXPIRED
        - REVOKED
        - CLOSED
        - FAILED

    ViewerSession:
      type: object
      additionalProperties: false
      required:
        - viewerSessionId
        - sessionId
        - studyRefId
        - actorType
        - status
        - deliveryMode
        - expiresAt
      properties:
        viewerSessionId:
          type: string
          format: uuid
        sessionId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid
        actorType:
          $ref: '#/components/schemas/ViewerActorType'
        status:
          $ref: '#/components/schemas/ViewerSessionStatus'
        deliveryMode:
          type: string
          const: ON_DEMAND_DICOMWEB
        expiresAt:
          type: string
          format: date-time
        closedAt:
          type: string
          format: date-time

    DownloadActionRequest:
      type: object
      additionalProperties: false
      required:
        - grantId
        - studyRefId
      properties:
        grantId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid

    PacsImportActionRequest:
      type: object
      additionalProperties: false
      required:
        - grantId
        - studyRefId
      properties:
        grantId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid
        verifyDestination:
          type: boolean
          default: true
          description: |
            P0에서는 true 사용을 권장한다.
            성공한 STOW-RS 이후 Destination Study 존재 여부를 확인한다.

    PacsImportResult:
      type: object
      additionalProperties: false
      required:
        - sessionId
        - studyRefId
        - sourceHospitalId
        - destinationHospitalId
        - transferStatus
        - destinationVerified
        - integrityStatus
      properties:
        sessionId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid
        sourceHospitalId:
          type: string
          format: uuid
        destinationHospitalId:
          type: string
          format: uuid
        transferStatus:
          type: string
          enum:
            - COMPLETED
            - FAILED
        destinationVerified:
          type: boolean
        integrityStatus:
          $ref: '#/components/schemas/IntegrityStatus'
        provenanceId:
          type: string
          format: uuid

    IntegrityStatus:
      type: string
      enum:
        - PENDING
        - VERIFIED
        - FAILED
        - NOT_APPLICABLE

    ProvenanceRecord:
      type: object
      additionalProperties: false
      required:
        - provenanceId
        - sessionId
        - packageId
        - sourceHospitalId
        - transferType
        - transferStatus
      properties:
        provenanceId:
          type: string
          format: uuid
        sessionId:
          type: string
          format: uuid
        packageId:
          type: string
          format: uuid
        studyRefId:
          type: string
          format: uuid
        sourceHospitalId:
          type: string
          format: uuid
        destinationHospitalId:
          type: string
          format: uuid
        integrityId:
          type: string
          format: uuid
        transferType:
          type: string
          enum:
            - VIEW
            - DOWNLOAD
            - PACS_IMPORT
        transferStatus:
          type: string
          enum:
            - PENDING
            - IN_PROGRESS
            - COMPLETED
            - FAILED
        ingestedAt:
          type: string
          format: date-time
        transferredAt:
          type: string
          format: date-time

    AuditEvent:
      type: object
      additionalProperties: false
      required:
        - auditEventId
        - occurredAt
        - action
        - result
      properties:
        auditEventId:
          type: string
          format: uuid
        occurredAt:
          type: string
          format: date-time
        actorId:
          type: string
          format: uuid
        tenantId:
          type: string
          format: uuid
        sessionId:
          type: string
          format: uuid
        resourceType:
          type: string
        resourceId:
          type: string
          format: uuid
        action:
          type: string
          enum:
            - SESSION_CREATED
            - CONSENT_REQUESTED
            - CONSENT_APPROVED
            - CONSENT_WITHDRAWN
            - AUTHENTICATION_FAILURE
            - AUTHORIZATION_GRANTED
            - AUTHORIZATION_DENIED
            - GRANT_CREATED
            - GRANT_DENIED
            - VIEWER_OPENED
            - VIEWER_INSTANCE_RETRIEVED
            - VIEWER_FRAME_RETRIEVED
            - VIEWER_EXPIRED
            - VIEWER_CLOSED
            - DOWNLOAD_STARTED
            - DOWNLOAD_COMPLETED
            - DOWNLOAD_FAILED
            - PACS_TRANSFER_STARTED
            - PACS_TRANSFER_COMPLETED
            - PACS_TRANSFER_FAILED
            - INTEGRITY_VERIFIED
            - INTEGRITY_FAILURE
            - ACCESS_DENIED
            - SESSION_COMPLETED
        result:
          type: string
          enum:
            - SUCCESS
            - FAILURE
            - ALLOW
            - DENY
        reasonCode:
          type: string
        correlationId:
          type: string
          format: uuid

    ErrorResponse:
      type: object
      additionalProperties: false
      required:
        - code
        - message
      properties:
        code:
          type: string
          examples:
            - AUTHORIZATION_DENIED
            - INVALID_SESSION_STATE
            - CONSENT_REQUIRED
            - GRANT_EXPIRED
            - GRANT_SCOPE_DENIED
            - TENANT_MISMATCH
            - PATIENT_MAPPING_INVALID
            - DICOMWEB_FAILURE
            - INTEGRITY_FAILURE
        message:
          type: string
          description: Safe client-facing error message
        correlationId:
          type: string
          format: uuid
        details:
          type: object
          additionalProperties: true
          description: |
            Non-sensitive diagnostic context only.
            Passwords, raw access tokens, private keys,
            DICOM binaries and secrets must never be returned.
```

## API 설계에서 고정된 핵심 결정

이 API의 중심은 다음 흐름입니다.

```text
POST /exchange-sessions
        ↓
POST /{session}/consents/request
        ↓
POST /{session}/consents/{consent}/approve
        ↓
POST /{session}/grants/issue
        ↓
┌────────────────────────────────────────┐
│                                        │
▼                    ▼                   ▼
actions/view     actions/download   actions/pacs-import
```

즉 DB 관점의 다음과 같은 API는 **의도적으로 만들지 않았습니다.**

```text
POST /audit-events
PUT  /transfer-grants/{id}
DELETE /consents/{id}
PUT /provenance-records/{id}
POST /integrity-evidence
```

이 객체들은 사용자 CRUD 대상이 아니라 **업무 수행 결과 시스템이 생성·관리하는 Domain/Evidence 객체**이기 때문입니다.

특히 PACS 전송 경로는 API 수준에서도 다음 불변조건을 유지합니다.

```text
Authentication
        +
Tenant
        +
ExchangeSession
        +
ACTIVE Consent
        +
ACTIVE TransferGrant
        +
study:pacs-transfer
        +
Correct Destination
        +
VALID PatientMapping
        ↓
      STOW-RS
        ↓
Destination Verification
        ↓
Integrity VERIFIED
        ↓
Provenance
        ↓
Audit
        ↓
COMPLETED
```

반대로 아래 중 하나라도 실패하면 `200 COMPLETED`를 반환하면 안 됩니다.

```text
Wrong Tenant
Wrong Recipient
Wrong Scope
Expired Grant
Withdrawn Consent
Invalid Mapping
Destination Mismatch
STOW-RS Failure
Integrity Failure
```

### OpenAPI Baseline Decision

```text
PROJECT:
MediQ

OPENAPI VERSION:
3.1.0

API VERSION:
v1

DESIGN STYLE:
Domain Action Oriented

DATABASE CRUD EXPOSURE:
REJECTED

PRIMARY WORKFLOW:
Create Exchange
→ Consent
→ Grant
→ View / Download / PACS Import

AUTHENTICATION:
Bearer Security Context

AUTHORIZATION:
Backend Explicit Authorization

VIEW SCOPE:
study:view

DOWNLOAD SCOPE:
study:download

PACS IMPORT SCOPE:
study:pacs-transfer

PATIENT MAPPING:
Validated before PACS Import

DICOM BINARY:
Not exposed as database entity

PROVENANCE:
Read-only evidence API

AUDIT:
Read-only evidence API

P1 MOBILE API:
DEFERRED

PRODUCTION API:
DEFERRED

OPENAPI BASELINE STATUS:
APPROVED
```

다음 순서는 **`THREAT-MODEL.md`**가 적절합니다. 이제 API와 Trust Boundary가 구체화됐기 때문에 `Browser → MediQ`, `MediQ → Orthanc A`, `MediQ → Orthanc B`, `MediQ → Temporary Storage`별로 **Asset → Threat → Existing Control → Residual Risk → Security Requirement → Test**를 연결할 수 있습니다.

---

## Viewer API Amendment — 2026-09-15

`OPENAPI.yaml` v1.1.0에 다음 P0 계약을 반영했다.

- Hospital User 및 Synthetic Patient의 actor-aware ViewerSession
- MediQ가 통제하는 short-lived Viewer entry point
- Source PACS WADO-RS 기반 DICOM Instance/Frame 온디맨드 전달
- ViewerSession 조회·종료·만료 상태
- `Cache-Control: private, no-store`
- Browser 응답에서 PACS endpoint, credential, raw storage reference 제외
- Source PACS 장애 시 영구 Cloud Copy fallback 없이 upstream failure

Mobile Vault Viewer API는 P1로 유지하며 이번 P0 계약에 포함하지 않는다.
