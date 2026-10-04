# MediQ Acceptance Test Specification

### DEC-028 one-Study repository terminalizer persistence sub-gate — before test code

CAPSTONE-P0 / MEDIQ-PACS-001. `PACS-001-DEC-028` decomposes the already approved DEC-024 persistence Acceptance; it does not change product scope or weaken the DEC-024 trusted-coordinator prerequisites.

| ID (`TC-PACS-001-TERM-*`) | Required evidence |
|---|---|
| 030 | In disposable PostgreSQL under `mediq_runtime` and forced Tenant RLS, invoke the actual compiled `PostgresPacsTransferTerminalizationRepository.finalize()` with an issued `AuthorizationContext`, active current Consent/Grant/Session and one legal VERIFYING/version3 Study operation. Set up source Integrity/Provenance, transition Audits, destination evidence link, destination-verification Audit and PURGED metadata/purge Audit only as clearly labeled synthetic test preconditions. The test does not claim actual STOW, destination-byte comparison, or physical deletion. |
| 031 | Commit the caller's outer Tenant transaction and use an independent read-only observer to prove exactly the bound `PACS_IMPORT` Provenance becomes COMPLETED with equal non-null `ingested_at`/`transferred_at`; operation becomes COMPLETED/version4 with equal positive source/destination count; exactly one `PACS_TRANSFER_COMPLETED`, `INTEGRITY_VERIFIED`, operation COMPLETED Audit and one `SESSION_COMPLETED` Audit share the expected correlation; the sole-Study Session becomes COMPLETED with matching timestamp; no unrelated Tenant/Study rows change; exact262, forced RLS and the terminal-correlation guard remain. Classify this as repository persistence acceptance only; it does not satisfy TERM-011 or full TERM-012/017 product prerequisites. |

Initial status: recommendation and these bounded criteria recorded before test changes; implementation and runtime proof NOT RUN. This sub-gate excludes failure injection, replay/concurrency, multiple-Study Session behavior, the remaining TERM-014 negative matrix, persistent DB regressions, application STOW and product A→MediQ→B E2E; each remains required by its parent Acceptance.

### DEC-027 terminal Audit correlation binding — before code

CAPSTONE-P0 / MEDIQ-PACS-001. `PACS-001-DEC-027` is accepted under the standing recommendation-first instruction and recorded before migration/application/test edits. Preserve exact262 runtime column grants, forced Tenant RLS, and DEC-020-R3's explicit exclusion of `audit_events.correlation_id` from runtime SELECT.

| ID (`TC-PACS-001-TERM-*`) | Required evidence |
|---|---|
| 024 | Append-only migration 0029 replaces all terminal validator SQL that otherwise reads `audit_events.correlation_id`; no terminal validator performs a SQL SELECT/predicate read of that column. All other tenant/actor/session/resource/action/result/reason/timestamp/cardinality/source/destination/purge/authorization predicates remain. Exact prior migrations and journal entries remain byte-identical. |
| 025 | `PostgresPacsTransferTerminalizationRepository` validates and normalizes the supplied correlation UUID, sets `mediq.terminal_correlation_id` once using transaction-local `set_config(..., true)` inside its existing savepoint and before terminal Audit inserts, and uses that same UUID for transfer, integrity, operation-state, and (single-Study only) Session completion Audit rows. Unit/static or actual repository evidence proves call order and normalized value. |
| 026 | Under actual disposable PostgreSQL/RLS as `mediq_runtime`, each of the four terminal Audit action forms is rejected when the transaction-local value is absent, malformed, or differs from `NEW.correlation_id`; SQLSTATE is exactly `23514` and the constraint is exactly `audit_events_terminal_correlation_guard`. Exact matching values are accepted. Rejected writes are rolled back to savepoints; no unexpected Audit row remains. |
| 027 | Actual terminal guard denial probes still reach their intended trigger and return SQLSTATE `23514` with the exact existing Provenance/operation/Session constraint names; exact262 catalog equality, excluded-column denial, no-context/cross-Tenant denial, forced RLS, and all previous database regressions remain unchanged. |
| 028 | Transaction-local setting is cleared by both COMMIT and ROLLBACK and does not leak through pooled connection reuse. Terminal writes remain atomic; no GUC state is retained as durable authorization or replay state. |
| 029 | The same-principal limitation remains explicit: a holder of the runtime credential can set a GUC and issue coherent SQL, so this correlation check is not caller identity or Authorization attestation. DEC-025 TERM-020~023 and no-false-completion/source/destination/provenance/purge invariants remain in force. Run the clean/repeat/reset/reapply scratch wrapper, exact privilege and independent observer gates, existing required regressions, and cleanup/stack/input preservation before scoped PASS. |

Initial status: pre-code recommendation and Acceptance recorded; implementation and tests NOT RUN. This changes no permission, table schema, product scope, API route, PACS behavior, or persistent environment.

**Actual bounded result (2026-10-04):** TERM-024~028 passed in the disposable PostgreSQL/RLS ScratchOnly run: migration 0029 retained exact262 and avoided runtime SELECT of the excluded correlation column; all four terminal Audit forms denied missing/malformed/mismatched context with exact SQLSTATE/constraint and accepted matching context; finalizer binding order, rollback/commit/pool-reset cleanup, existing terminal denials, RLS and included DB regression gates passed. The wrapper completed its clean/repeat/reset/reapply and owned scratch cleanup with its final `db008_schema_validation=PASS` marker. The run did not exercise a valid internal terminal commit, injected terminal rollback/concurrency or one-/multi-Study completion, persistent DB regressions, or product STOW/A→B. Overall MEDIQ-PACS-001/P0 remains PARTIAL. See implementation report §64 and test evidence §100.

### DEC-025 shared-runtime enforcement boundary — before code

CAPSTONE-P0 / MEDIQ-PACS-001. Recommendation `PACS-001-DEC-025` is accepted under the user's standing recommendation-first instruction and recorded before DEC-024 code. `mediq_runtime` is a shared application database principal; invoker triggers cannot attest which internal method issued DML by that same principal.

| ID (`TC-PACS-001-TERM-*`) | Required evidence |
|---|---|
| 020 | Runtime direct Provenance/operation/Session updates with missing, mismatched, cross-Tenant, wrong-Study, missing linked destination proof, absent purge/Audit, wrong state/version/count, or incomplete terminal Audit are denied by RLS/constraints/triggers; the entire failed finalization savepoint has no terminal rows/Audits. |
| 021 | In an isolated scratch-only test, a controlled SQL sequence using the same `mediq_runtime` role can create a fully coherent terminal fact set if it inserts every otherwise-valid audit/evidence row. Record this as evidence that PostgreSQL enforces relational facts but cannot distinguish a Repository caller from equivalent SQL under the same principal. This is not product-path authorization, successful STOW evidence, or permission to expose the runtime credential. |
| 022 | Migration 0028 preserves exactly262 runtime column privilege tuples, forced RLS, no table/PUBLIC/DELETE/DDL/ownership/BYPASSRLS privilege, no new database role, and no `SECURITY DEFINER`; migration reset/reapply remains repeatable. |
| 023 | Implementation/Security/Threat/Acceptance records state the shared-principal residual risk and API-only credential boundary; no test/operator/untrusted client is given a production runtime credential. Productionization must separately reassess whether direct DML should be replaced with a distinct authenticated DB execution boundary. |

Historical DEC-026 diagnosis: migration 0028's invoker function reads `audit_events.correlation_id`, excluded by exact262; session 85707's 42501 does not dynamically identify the column. The initial exact263 expansion proposal was superseded by DEC-027, which preserves exact262 and adds transaction-local correlation consistency without granting column SELECT. Session 85707's failure remains historical evidence. TERM-024~028 now have bounded actual ScratchOnly evidence as summarized above; TERM-029's shared-principal residual is documented, not eliminated. Full positive finalization/atomicity/concurrency, the remaining TERM-020~023 coherent-SQL boundary probe, TERM-017 matrix, persistent DB regressions and product A→B transfer remain NOT RUN/NOT ACCEPTED.

### DEC-024 terminal transfer persistence — before code

CAPSTONE-P0 / MEDIQ-PACS-001. Recommendation `PACS-001-DEC-024` is accepted under the user's standing recommendation-first instruction. This gate defines an internal terminal writer after DEC-023; it does not itself authorize or invoke STOW, register a route, or claim full-transfer acceptance. The pre-code policy and this Acceptance are recorded before terminal-writer/schema/grant/coordinator edits.

| ID (`TC-PACS-001-TERM-*`) | Required evidence |
|---|---|
| 011 | Terminalization can only be reached by the trusted coordinator's original service-owned one-Study handoff after one fully parsed successful STOW result whose stored SOP set exactly equals the frozen expected set with no warning/failure/foreign/duplicate/missing instance; exact destination hierarchy and raw per-instance length/hash/count/total/aggregate have been independently compared; DEC-023 destination evidence is persisted and linked; physical temporary payload purge and its success Audit are committed. JSON/caller-built receipt, a STOW status alone, or a cloned/restarted handoff cannot authorize completion. |
| 012 | Under one short verified-Tenant transaction and the canonical Session fence, the exact `PACS_IMPORT` Provenance changes only from the bound linked `PENDING` state to `COMPLETED` with `ingested_at=transferred_at=now`; the operation changes by legal CAS from `VERIFYING` to `COMPLETED` with matching positive source/destination count; required `PACS_TRANSFER_COMPLETED`, `INTEGRITY_VERIFIED`, and operation-state Audit rows commit atomically. Any failure rolls back all terminal writes/audits. No PACS, network, crypto, or filesystem I/O occurs in the transaction. |
| 013 | Database CHECK/trigger rules independently require exact Tenant/Actor/Session/Package/Study/source/destination and operation binding; distinct immutable `SOURCE_CAPTURE/PENDING` plus exact linked `DESTINATION_VERIFY/VERIFIED` with equal canonical digests/counts; committed `PURGED` metadata and matching purge Audit; correct dispatch/preflight/verification Audit; only legal one-time terminal status/timestamp changes. Incomplete/mismatched direct runtime SQL is denied; source evidence, immutable Provenance bindings, and destination proof cannot be rewritten/deleted. The shared-runtime principal cannot provide repository-caller attestation against equivalent fully coherent same-principal SQL; see DEC-025/TERM-020~023. |
| 014 | No `RESULT_UNKNOWN`, `PARTIAL`, `FAILED`, incomplete/malformed/202 warning/failed STOW result, missing/extra/duplicate SOP, changed destination, hash mismatch, absent proof/link, uncommitted/missing purge, stale or revoked authority, changed Tenant/Session/Study graph, expired grant, failed Audit, or CAS/version conflict can produce operation/Provenance `COMPLETED`. Terminalization never invokes or retries STOW. Lost response/commit acknowledgement is read-only status/evidence reconciliation; it never replays PACS I/O. |
| 015 | When the Session has exactly the one persisted StudyReference being finalized, transition `ACTIVE→COMPLETED`, set `completed_at` and append exactly one `SESSION_COMPLETED` Audit atomically with the Study terminal result. If any sibling StudyReference exists in a Package bound to that Session, the finalized Study operation/Provenance may complete, but Session remains `ACTIVE`, `completed_at` stays NULL and no `SESSION_COMPLETED` Audit is added. No inferred or caller-supplied “all studies requested” assertion is accepted. |
| 016 | Actual runtime privilege catalog equals exactly the existing258 tuples plus `UPDATE provenance_records(transfer_status, ingested_at, transferred_at)` and `UPDATE exchange_sessions(completed_at)` =262 tuples. No extra/missing column tuple, table/PUBLIC privilege, DELETE, ownership, superuser, BYPASSRLS, forced-RLS relaxation, or SECURITY DEFINER is accepted. Existing operation columns and Session state/updated_at grants remain exact and unchanged. |
| 017 | Actual isolated PostgreSQL/RLS cases cover valid internal terminal commit, one/multiple Study Session behavior, replay/concurrency/CAS loss, wrong Tenant/Actor/Session/Study/evidence/provenance/digest/count/destination, no-context, source mutation, premature status/date updates, missing or wrong purge/dispatch/verification Audit, and injected Provenance/operation/Session/Audit failure. Independent read-only observer proves exact committed or fully rolled-back rows/Audits; ambiguous COMMIT is never followed by another STOW. TERM-020~023 separately prove/document that same-principal direct SQL cannot be distinguished from Repository DML; no caller-attestation claim is made. |
| 018 | Migration 0028 applies on clean schema, follows the project's repeat/reset/reapply lifecycle without editing old migration or journal bytes, and leaves forced RLS/expected schema/role inventory intact. Exact262 catalog equality, runtime denial/positive transactions and synthetic DB compatibility suite pass; owned scratch resources are independently absent, the existing MediQ stack and frozen inputs are unchanged. |
| 019 | Terminal-writer tests and current API/build/type/Port/contract/Node/PowerShell regressions pass; DEC-024, report/evidence, index and all affected normative Domain/Data/ERD/Security/Threat/Data Flow docs agree. This is still a persistence-component result only: full Preflight, one real application STOW, destination observer, recovery, security negatives, route/API composition and original A→MediQ→B E2E stay separately NOT RUN until actually exercised. |

Initial status: NOT IMPLEMENTED / NOT RUN. These cases define the design before code; no terminal state, new runtime privilege, migration, route, or STOW is claimed by this pre-code record. The multi-Study rule intentionally prevents false Session completion; no multi-Study closure API/scope manifest is introduced by this Ticket.

### DEC-023 append-only destination evidence persistence — before code

CAPSTONE-P0 / MEDIQ-PACS-001. Recommendation `PACS-001-DEC-023` is accepted under the user's standing direction to proceed with documented recommendations. This is a persistence slice after the DEC-022 source-owned comparison and actual physical-purge saga. It does not claim full product delivery: current B objects in its real integration case are independently seeded fixtures.

| ID (`TC-PACS-001-TERM-*`) | Required evidence |
|---|---|
| 001 | Only the original same-service captured handoff with a privately stored successful whole-comparison proof can enter persistence. Missing, cloned, cross-service, forged, stale (>5 minutes), expired, or replayed proof is denied before writes. Caller-supplied proof/IDs/digest/count/timestamp are not accepted. |
| 002 | A fresh verified signed actor/Tenant identity, active Consent, Authorization and exact scoped `PACS_IMPORT` Grant, destination mapping, current Session fence, operation `VERIFYING/version=3`, current source row and exact bound Provenance/transition audits are rechecked. Revocation, mapping/source/graph change, wrong Tenant or wrong action fails closed. No transaction spans PACS, payload, or filesystem I/O. |
| 003 | The exact scoped synthetic payload has a committed `PURGED` timestamp and matching `PACS_TEMPORARY_OBJECT_PURGED/SUCCESS` Audit after the physical purge; missing/mismatched/uncommitted purge proof rejects destination evidence persistence. |
| 004 | One `DESTINATION_VERIFY/VERIFIED` row is appended with exact operation/Session/package/Study/source Integrity binding, canonical algorithm and matching source/destination digest and object count. Existing `SOURCE_CAPTURE/PENDING` row remains byte-for-byte unchanged; duplicate stage is rejected. |
| 005 | In the same transaction, only the bound `PACS_IMPORT` Provenance `integrity_id` changes from NULL to the new destination evidence ID. All identity/binding fields remain unchanged; `transfer_status` remains `PENDING`; `ingested_at` and `transferred_at` remain NULL. No source/destination transfer completion is implied. |
| 006 | One `PACS_DESTINATION_INTEGRITY_RECORDED/SUCCESS/DESTINATION_MATCH` Audit is committed atomically with the evidence append and Provenance link. Injected evidence insert, Provenance trigger/update, or Audit insert failure leaves all three persisted effects absent. A lost COMMIT acknowledgement returns unavailable and consumes the one handoff attempt; independently observe actual transaction outcome, never retry/refetch. |
| 007 | Append-only and immutable-binding rules are enforced by database constraints/triggers, not only repository checks. Runtime cannot update/delete evidence, promote source evidence, modify Provenance status/dates/bindings, or link a wrong operation/Study/source/destination row. No-context and cross-Tenant requests return no graph/effect; Tenant B legitimate access remains limited to approved bilateral RLS visibility. |
| 008 | Exact runtime catalog is the prior independent253 tuple set plus only five tuples: SELECT/INSERT for the two destination-evidence columns and UPDATE for `provenance_records.integrity_id` (258 total). No table/PUBLIC/DELETE privilege, ownership, superuser, BYPASSRLS or forced-RLS change. Actual catalogue equality rejects any missing or extra tuple. |
| 009 | New append-only migration applies on a clean schema, re-applies idempotently as required by the migration harness, resets and reapplies with historical migration/journal bytes preserved. Actual PostgreSQL tests cover positive insert/link, all check/trigger denials, concurrency/duplicate, injected Audit rollback, pool reset, forced RLS, exact privileges, and unchanged original source constraints. Disposable scratch resources are independently absent afterward. |
| 010 | Extend the owned signed A/B synthetic integration and independent read-only observer: existing valid byte-comparison case physically purges and then persists exactly one linked destination row/Audit; negatives leave no destination row/link/success Audit and keep original source pending. B is purged to empty and all earlier source58/dispatched18 gates, privacy, fixture restoration, frozen-input and owned-resource cleanup remain passing. Observer proves operation stays VERIFYING and Session ACTIVE/uncompleted, Provenance stays PENDING and payload quota returns0. This is not application STOW or full Preflight. |

Initial status: NOT IMPLEMENTED / NOT RUN. Required local API/build/type/Port/script regressions and actual fresh DB/Orthanc tests must be recorded in `MEDIQ-PACS-001/TEST-EVIDENCE.md`. Scope PASS on TERM-001~010 does not complete step3/4/5: full Mandatory Preflight, real application one-Study STOW, exact destination verification after that STOW, terminal Provenance/Audit/operation/Session state, recovery/security/E2E remain required by the P0 Golden Path.

### DEC-022-B actual owned destination matrix — before code

Current ACTDEST001–008 **scoped PASS**, actual original95264 terminal0 (source58+dispatch18+destination14+2+2+2 and independent16-case observer, exact Audit/source pending/provenance/noncompletion/quota0/privacy/restoration/B EMPTY/cleanup); independent zero owned resources, same306 frozen inputs and development inventory. Local API1175/contract21/Node257/PS107/build/type/Port PASS. Evidence§84/report§48. Actual signed internal service/real SQL/RLS/HTTPS B only; B seed is fixture setup. This does not close AUTHDEST007/DESTBYTES007/full terminal/Preflight/application STOW/coordinator/API/security/E2E or whole P0; those remain NOT RUN/PARTIAL. Historical initial status and failures below are retained, not current verdict.

CAPSTONE-P0/MEDIQ-PACS-001, AUTHDEST-006/DESTBYTES-006; initial NOT RUN. Existing20 dirty paths and original58+18 assertions preserved.

| ID (`TC-PACS-001-ACTDEST-*`) | Required actual evidence |
|---|---|
| 001 | Optional owned temporary profile, separate fixture/observer migrator processes, app runtime-only credentials. Signed synthetic OIDC/JWKS and exact253 privileges/NOSUPER/NOBYPASS/forced RLS; no-context/cross-Tenant graph invisible. |
| 002 | Original source-owner capture + real VERIFYING/version3/digest/count/source pending AVAILABLE/provenance/three Audits. Genuine HTTPS B QIDO/WADO byte comparison matches independently known fixture hash/count/total/identity; all11 checkpoints committed and no own transaction spans network/body I/O. |
| 003 | Independent real B fixtures: same-length raw-byte tamper, missing SOP, extra SOP; exact B inventory/hash before test, no application B write/STOW/normalization/retry/completion. Zero proof and appropriate bounded B calls on faults. |
| 004 | Wrong digest/count, missing pending Provenance/transition Audit, cross-Tenant denied before B reads; real mid-byte Grant/Consent revocation prevents subsequent proof. |
| 005 | Actual DB Audit failure and real committed acknowledgement-loss injection before first B read yield no read/proof; same handoff cannot refetch. Tests never replace SQL results/authority. |
| 006 | Independent read-only observer verifies exact per-case Audits/source pending rows/provenance/state, physical and metadata purge/committed quota0; no VERIFIED/COMPLETED or source promotion. |
| 007 | Original58+18/observers/privacy/restoration/source compatibility, new actual summary counts, helper/app privacy, B EMPTY after fixture-only purge, automatic owned cleanup and independently frozen input/development inventories. |
| 008 | Current local fixture/helper/wrapper contracts, API/build/type/Port/parsed contract/Node/PS/syntax and report/normative/index sync. Failed runs preserved. Scope is actual comparison prerequisite, not original full Preflight/STOW/terminal evidence/coordinator/security/E2E. |

### DEC-022-A owned authorized whole verifier — before code

Current local outcome: real service/model-DB/engine/crypto/hash66 new cases (focused287 total), destination Audit8 negative cases, full API1175/build/type/Port/contract21/Node232/PS107 scoped PASS. Positive/late-phase tests assert actual controlled B reads and committed checkpoints, not negative-only green tests. AUTHDEST-001~005 local prerequisite accepted, not actual SQL/RLS/PACS acceptance. Original95503 terminal0 verifies changed-source58+dispatch18/independent observers/B EMPTY/privacy/cleanup/current302-input hash/development inventory; AUTHDEST-006 changed-source prerequisite only PASS. Its new destination SQL/RLS/B positive/tamper/identity gate and007 terminal/coordinator/E2E remain NOT RUN. No live handle, full step2/P0 PARTIAL.

CAPSTONE-P0/MEDIQ-PACS-001. Initial NOT IMPLEMENTED/NOT RUN; linked REQ-PACS-BYTES-002, SEC-PACS-BYTES-001/002 and DESTBYTES-004/006/007. Model/transport and actual SQL/PACS acceptance must stay separate.

| ID (`TC-PACS-001-AUTHDEST-*`) | Required evidence |
|---|---|
| 001 | Original service-issued handoff only; closed data input, no Proxy/getter/symbol/permit/endpoint execution. Cloned/restarted/foreign handoff, wrong owner/Tenant/Grant/action/scope/Consent, expired/revoked or changed graph/mapping/source metadata denied before B I/O. |
| 002 | Real fenced authorization engine composition with exact VERIFYING/version3, semantic digest/count, original SOURCE_CAPTURE/PENDING AVAILABLE/TTL, pending bound Provenance and committed three transition Audits. Each identity operation and raw-instance before/after has current authorization and committed checkpoint Audit; failures/commit loss cannot produce proof. No transaction spans I/O. |
| 003 | Exact identity before/after; sequential raw bytes, every original per-instance length/hash and canonical count/total/aggregate equal. Changed/truncated/extra/missing identity/bytes/representation fail closed, no partial proof. No payload output/persistence, source evidence unchanged. |
| 004 | One5min deadline includes identity, authorization, all bytes and final gate; pre-abort, mid-stream abort, expiry, clock faults and I/O failure release readers/timers/admission. Same handoff concurrency/replay and first-gate Audit/commit loss do not refetch. |
| 005 | Actual implementation focused tests, current full API/build/type/Port/parsed contract and normative/report/evidence synchronization. Existing CREATED/STOW_STARTED source-read gates unchanged; controlled-stream/model DB verdict is explicitly local only. |
| 006 | Actual isolated synthetic B plus changed-source gate with signed identity, real PostgreSQL/RLS exact predicates/Audit commits, HTTPS QIDO/WADO, tamper/revocation/denial/TLS/privacy/cleanup/independent inventories. Model queries and simulated VERIFYING fixture do not satisfy actual transfer/Preflight acceptance. |
| 007 | Separate destination/terminal writers and minimal-rights real DB gate, full Preflight/one actual Study STOW/exact B proof/persisted Integrity/Provenance/Audit/purge/terminal Session/security/E2E. Required for full P0, not implemented by a read-only comparison proof. |

### DEC-022 exact destination bytes — recorded before code

CAPSTONE-P0, MEDIQ-PACS-001. Initial NOT IMPLEMENTED/NOT RUN; plan step2 prerequisite, not full transfer acceptance.

Current initial component (2026-10-04): DESTBYTES-001/002/003 **transport-local scoped PASS** only;005 local regressions scoped PASS (focused20/full API1101/contract21/Node232/PS107/build/type/Port).001's actual signed authority is NOT IMPLEMENTED/NOT RUN;004 aggregate comparison/whole deadline/current owner,006 actual B/new source and007 DB/terminal/full coordinator/E2E remain NOT IMPLEMENTED/NOT RUN. Raw sample hash equality proves unit byte delivery only, not actual B or original source integrity. Overall step2/PACS-001/P0 PARTIAL; evidence§79, no completion or public route.

| ID (`TC-PACS-001-DESTBYTES-*`) | Required evidence |
|---|---|
| 001 | Distinct B-only VERIFY_INSTANCE_BYTES, A denied; B generic WADO metadata/instance/frame remain denied and source behavior unchanged. No user URL/credential/selectors beyond exact closed identity/context. Transport profile is not authority; future coordinator rechecks signed Session/destination/Consent/Authorization/exact Grant before each read. |
| 002 | Data-only exact request/context snapshots; invalid/duplicate/oversized inventory, forged fields, getter/Proxy or mutated selectors fail before fetch without getter/trap execution. No client permit or public route. |
| 003 | Positive byte stream uses HTTPS/server-resolved endpoint, same multipart/Explicit VR LE/bounds/deadline/cancellation/EOF parser; corrupted MIME/length/syntax/multipart/error/abort cannot yield proof and releases admission. No generalized B content response. |
| 004 | Trusted original source manifest/inventory, canonical ordered sequential B hashing, exact before/after identity and every length/hash/count/total/aggregate match; one5min total bound and all instance/Study ceilings. Changed/truncated/extra/missing bytes, UID hierarchy, source contradiction or race cannot complete. No re-fetch/retry/STOW/state mutation or payload retention. Unit/model tests not actual PACS proof. |
| 005 | Current focused actual implementations + complete API/build/type/Port + Node/PS/parsed-contract regressions, no schema/grant/runtime dependency/route mutation, evidence and normative boundary sync. |
| 006 | Actual owned isolated Test Orthanc B contains only explicitly seeded synthetic fixture; real HTTPS WADO source/destination byte hash equality and deliberately tampered/missing/extra identity rejection, strict TLS/endpoint/no-retry/cancellation/log privacy, independent exact cleanup/input/dev inventory. Changed shared source parser needs fresh actual source integration before full acceptance. No unowned stack mutation; sample import alone is not full Preflight/E2E. |
| 007 | Append-only DESTINATION_VERIFY with narrow immutable terminal Provenance binding/rights, actual forced RLS/exact-delta/denial/concurrency/Audit rollback, complete signed Preflight/coordinator/one B Study dispatch/destination raw proof/terminal Audit/session/physical purge/security/E2E. Source pending constraints unchanged. Required before original P0 PASS, NOT RUN in component slice. |

### DEC-021 PACS Import submission/replay/status contract — before implementation

CAPSTONE-P0/MEDIQ-PACS-001, initial NOT IMPLEMENTED/NOT RUN; no protected route registration in this slice. R3 actual prerequisite evidence remains §75, not full transfer proof.

Current DEC-021/021-A result (2026-10-04, supersedes initial labels): API-001/002/005 **scoped PASS** (actual data-only production validators55, strict real contract21, API46files/1081/build/type/Port, Node232/PS107, normative/UI identity preservation). API-003 **PARTIAL**: actual digest unit agrees across canonical fields, but no new signed HTTP/durable replay/concurrency gate. API-004/006/007 **NOT IMPLEMENTED/NOT RUN** in this slice. Standard JSON Schema structurally permits foreign result/envelope IDs; the actual production validator separately rejects them. Neither validates physical destination facts. Whole PACS-001/P0 PARTIAL; report§42/evidence§78. Previous actual R3 proof is not new-code E2E evidence.

DEC-021-A additional pre-code conditions: remove only the orphan Viewer path fragment (no method); preserve all original real operation IDs including authorizeViewerAccess/approveConsent/withdrawConsent. Production data-only status validator must reject mismatched completion envelope/result IDs, false or missing evidence literals, forged fields, noncanonical UTC timestamps and getter/Proxy input without executing it; freeze copied output. JSON-schema structural proof does not prove cross-field binding or destination facts. Validate each HTTP error-code partition with positive/negative real schema fixtures, without coercion/default/property removal or disabling strict schema checks. Current overall PARTIAL; evidence §78/report §42 opened before edits.

| ID (`TC-PACS-001-API-*`) | Required evidence |
|---|---|
| 001 | Strict normalized UUID session/Tenant-candidate/key/correlation and exact grantId/studyRefId body; verifyDestination absent or literal true only. Reject missing/duplicate-array/null/false/type coercion, unknown fields, endpoint/credentials/actor/consent/action claims, non-plain object, symbol/non-enumerable/accessor/Proxy without executing getters or Proxy traps. Freeze copied output, independent from later input mutation. Status parser uses same Session/Tenant/key/correlation, no unknown operationId required after lost POST response. Parsing is not authorization. |
| 002 | Parse the real entire OpenAPI YAML with unique keys; validate all internal refs, paths/parameters/operationId uniqueness/security, actual JSON Schema request/result/status/noncompleted response fixtures with no coercion/default insertion/property removal. Synchronous200 only verified success; false verification, incomplete/failed integrity, missing provenance/Audit/purge, unknown/completed envelope mismatch and nonmatching error-code/state reject. All failures have no-store contract; no async202, resend/reconcile endpoint or automatic retry. |
| 003 | Idempotency semantics match existing server digest and durable UQ: same normalized identity+meaning replays, any Tenant/Actor/Session/Study/Consent/Grant/action change conflicts. Tests of contract/parser are not actual DB concurrency evidence; existing PACS-007 actual persistence proof is separate, future route must exercise it. |
| 004 | Status metadata permission limited to current active Hospital USER plus exact Tenant/Actor/destination Hospital/Session/key ownership. Grant revocation does not revive image permission; missing/foreign row concealed404. No payload/UID/PatientID/endpoint/credential/digest/raw reason, no PACS/business state/quota effect; GET does not reconcile or authorize resend. Actual signed API/RLS/ownership/Audit tests are required before route acceptance, not satisfied by this parser slice. |
| 005 | Compile production parsers, focused actual implementation cases, parsed YAML/schema negative fixtures, current full API/build/type/Port and Node/PS regression PASS. Development tools pinned and lock reproducible, no runtime dependency/DB/grant change; evidence states exact commands/results and prior failures. |
| 006 | Before response/route acceptance, real coordinator must prove full fresh Mandatory Preflight, one durable dispatch/one Study STOW, raw destination bytes/identity, terminal Integrity/Provenance/Audit/state/purge. Ledger/JSON literals alone cannot mint success. Definite failure vs uncertain result separated; replay/concurrency/lost response cannot cause another capture/STOW. NOT RUN in contract slice. |
| 007 | Original A-to-B success and no consent/invalid scope/cross-Tenant/wrong destination/mapping/expiry/withdrawal/tamper/duplicates/concurrency/lost response/terminal evidence fault tests, Viewer/Download separation, runtime maintenance and full P0/E2E remain necessary. Do not close P0 with contract-only PASS. |

### DEC-020-R3-B observer-only quota scope — recorded before implementation

Current evidence (2026-10-04): R3-B-001–004 and R3-005 scoped PASS, actual76676 exit0/full58+18+independent quota/Audit/Provenance/B-empty/privacy/cleanup, independent empty resources/frozen301 hash; prior unchanged API81864 and complete scratch18484 in PACS-001 evidence§72, current§75. This does not close the full coordinator/Preflight/STOW/destination/security/E2E or whole P0. Historical53311 remains failed; initial NOT RUN/FAILED labels below are historical.

CAPSTONE-P0/MEDIQ-PACS-001; original53311 FAILED, exact failing SQL not observed. Fix independently identified NOINHERIT quota-role omission without weakening predicates or expanding app grants.

| ID (`TC-PACS-001-DISPREAD-R3-B-*`) | Required evidence |
|---|---|
| 001 | Helper runs only inside existing repeatable-read/read-only transaction as mediq_migrator, then fixed SET LOCAL ROLE mediq_quota_owner using already approved membership. Guard role/read-only/isolation before scope change and owner/read-only afterward. Runtime role/app environment never receives membership or fixture URL. No grant/schema/RLS/product change. |
| 002 | Three exact final quota projections require zero reservations, package quotas and reserved environment bytes; missing/malformed singleton or nonzero state denies. Model fault injection at every query must fail; no success on failed SET or missing role check. Outer rollback must precede release, and COMMIT resets local role, checked before emitting exact success marker. |
| 003 | Actual helper AST tests plus current fixture/wrapper/privilege/script/PS guards and syntax/diff checks PASS. Models are not actual role/SQL/RLS proof. Prior failure and development-schema mismatch remain explicitly recorded. |
| 004 | Fresh frozen full58+18 real wrapper exits0 including independent exact graph/Audit/Provenance/purge/quota observer, old live/final observers and six restorations, output/helper privacy, B EMPTY before/after, owned cleanup, independent empty inventories and unchanged input/development resources. Unchanged exact253 runtime catalog required; whole P0 additionally needs full Preflight/real B transfer/destination/security/E2E. |

### DEC-020-R3 grant prerequisite — recorded before implementation

CAPSTONE-P0; adopted recommendation, initial **NOT IMPLEMENTED / NOT RUN**. Actual R2 39941/82055 FAILED/cleaned; independent current runtime exact Audit projection denied with SQLSTATE 42501. R3 supersedes R2's unchanged-244 constraint only after its explicit additive migration, not historical results. Preserve original claim predicates and all 17 scenarios/18 tests.

| ID (`TC-PACS-001-DISPREAD-R3-*`) | Required evidence |
|---|---|
| 001 | Append-only migration/journal validated; historical applied SQL/hash ledger unchanged; clean/reapply scratch and migration smoke PASS. No unrecorded persistent/deployed schema change. |
| 002 | Independently compare all exact runtime column/privilege tuples: previous 244 plus only nine Audit SELECT tuples = 253. Exact Audit SELECT fields resource_id/resource_type/exchange_session_id/actor_id/tenant_id/action/result/reason_code/occurred_at; INSERT 12 unchanged. No table/PUBLIC/Audit UPDATE/DELETE or SELECT audit_event_id/correlation_id/created_at. NOSUPER/NOBYPASS/forced RLS unchanged. Count-only proof insufficient. |
| 003 | Runtime, without Tenant context or with another Tenant, cannot read protected Audit rows or owned operations; correct Tenant can inspect needed minimized metadata. No image authority from Audit visibility. Excluded-column SELECT, full projection and Audit UPDATE/DELETE deny. No elevated credentials in application process. |
| 004 | Relevant prior DB exact-inventory/role/RLS/regression expectations deliberately updated and run, rather than broad accepted ranges or disabling guards. Current full API/build/type/Port, fixture/wrapper/helper contracts PASS. |
| 005 | Fresh frozen original 58 + new 18 real signed-source/runtime SQL/RLS/crypto tests and independent exact Audit/provenance/purge/quota observer PASS; B EMPTY before/after, mutation restoration, log privacy, owned cleanup and existing resources/input hashes unchanged. Both prior failures remain recorded. Full P0 success requires original Preflight/real B import/destination/evidence/security/E2E separately. |

DEC-020-R2-A diagnostic Acceptance (before edits): fixed projection must retain only allowlisted assertion label, fixed code and numeric source line; arbitrary message/path/fields are suppressed. CASE markers must not exhaust the ORIGIN/CHECK/QUERY budget. Original 58+18 outcomes, actual SQL/RLS, no-retry, privacy and cleanup conditions remain unchanged. Model projection tests cannot close actual dispatch-read acceptance. Run 39941 is FAILED/cleaned, not PASS; diagnostic rerun required.

## PACS-001 DEC-020 — committed-operation source reads (before implementation)

### DEC-020-R2 actual SQL/RLS gate (recorded before code; initial NOT RUN)

| ID (`TC-PACS-001-DISPREAD-SQL-*`) | Required actual evidence |
|---|---|
| 001 | Signed principal/JWKS, exact runtime NOSUPERUSER/NOBYPASSRLS/244 unchanged column rights and forced RLS. Original source-only 58-case gate remains intact. New disjoint fixtures/seed are test-only; no migration/admin URL in application process. No-context protected rows hidden; cross-Tenant owned operation hidden and dispatched plaintext access denied. Existing bilateral Study/Session/Provenance metadata visibility is not operation ownership or payload authority and must not be silently changed. |
| 002 | Positive original capture handoff + exact committed repository transitions/provenance execute actual dispatched SQL twice/object and return known original DICOM bytes; zero before EOF/next object, no source refetch/STOW/B access. One actual query/match count per verifier is independently tracked. Wrong digest/count/no or mismatched provenance/no preflight or dispatch audit/non-dispatch state denies with zero consumer calls. Missing-audit fixture state updates are not full product Preflight evidence. |
| 003 | Actual runtime Grant/Consent revocation or legal operation transition after first check commits and denies second-check delivery. No own Tenant transaction spans file/consumer. Return only fixed read error, no patient/token/payload diagnostics. |
| 004 | Original handed-off objects read once; cloned handoff and cross-Tenant/caller substitution deny. Consumer failure or real DB Audit insertion failure before decrypt cannot restore read retry. A test transport reports lost acknowledgement only after the real COMMIT succeeds; committed before-decrypt audit remains independently visible, no bytes delivered and retry denies. No fake SQL success/receipt/verifier. |
| 005 | Independent observer verifies exact state/version/digest/count/timestamps, required/missing audit partition, provenance binding/status, SOURCE_CAPTURE PENDING evidence only, audited metadata PURGED/physical absence and zero quota/reservations; unchanged privileges and no COMPLETED. Test output privacy and B EMPTY before/after, owned resource cleanup/existing stack preservation/frozen input integrity must pass. |
| 006 | Current focused wrapper/fixture/seed/observer checks plus full API/build/type/Port and opt-in actual wrapper exit 0. SQL/read gate cannot certify full Mandatory Preflight, permission to POST or full destination/security/E2E; keep DISPREAD-006/whole P0 PARTIAL until those original gates are implemented and tested. |

CAPSTONE-P0. Initial all NOT RUN. Scope is read/metadata integration; it does not authorize STOW or close STUDY-006/full P0.

Current DEC-020/R1 (2026-10-04 00:54 KST): DISPREAD-001/005 source representation/current regression and actual source scope PASS (focused 294, full 1026/build/type/Port, updated actual 58-case gate with independent observers/B EMPTY/cleanup/frozen input integrity). DISPREAD-003/004/004-B/004-C are scoped modeled-SQL/real engine+crypto+bridge PASS, not actual dispatch RLS evidence. DISPREAD-002 PARTIAL until actual new SQL predicates/RLS are tested; 006 full Preflight/dispatch/STOW/destination/security/E2E NOT IMPLEMENTED/NOT RUN. Seven added cases retain held-admission/zeroing and complete outcomes; earlier checkpoint failures remain recorded and are superseded only by evidence §67. Whole P0 PARTIAL.

| ID (`TC-PACS-001-DISPREAD-*`) | Required behavior / evidence |
|---|---|
| 001 | Validated source metadata CT SOP Class and actual WADO Explicit VR Little Endian syntax are copied/frozen onto each original expected/temp instance. Reject unsupported class/metadata syntax before payload; absent/wrong WADO syntax or contradictory metadata denies and closes active stream before evidence/handoff. Metadata absent syntax is allowed only when actual WADO supplies the approved syntax. Ordinary result remains four fields/no identifying transport metadata. |
| 002 | Separate dispatched read requires original handoff and freshly committed exact operation STOW_STARTED/version 2/actor/Tenant/semantic digest/source count/timestamp, pending bound Provenance and both dispatch-state Audits. CREATED/PREFLIGHT/VERIFYING/terminal or missing/stale/wrong/malformed claim/provenance/Audit denies before plaintext delivery. Existing pre-dispatch read rejects STOW_STARTED. Exact PostgreSQL/RLS proof is separate from modeled predicates. |
| 003 | Fresh two-phase current identity/Consent/Authorization/action/scope/recipient/Session/mapping/TTL/AVAILABLE/source-integrity checks apply to dispatched reads. Mutation or SQL/Audit/commit failure at either phase prevents delivery, returns only fixed error and zeroes any borrowed plaintext. No active Tenant transaction spans crypto/consumer. |
| 004 | One attempted dispatched read per captured object. Duplicate/concurrent replay denies; consumer failure/cancel does not enable retry. Object clones/restart/caller verifier/claim/metadata substitutions reject. Hold borrowed lifetime until consumer settles and then zero; permit distinct objects in canonical future transport sequence. No transport or operation transition occurs here. |
| 004-B | Internal owned-stream bridge starts no read at construction; snapshots principal/selectors; on demand copies ≤64-KiB chunks without sharing the borrowed Buffer, holds until EOF/cancel/consumer settlement and waits for zero/release before EOF. Stable copied bytes survive borrowed zeroing. Parent/purge abort stops delivery; no leaked admission, source refetch, network or transition. Real crypto + engine + Study transport fixture proves linkage, modeled SQL remains explicitly unproven as RLS/full Preflight. Lost first-check commit acknowledgement or Audit failure never enables retry after positively reserved ownership. |
| 004-C | DEC-020-R1: real encrypted-store caller/purge/TTL abort propagates via a combined signal; a consumer ignoring abort retains nonzero borrowed bytes and the single admission until actual settlement, then zero/release before a queued healthy verifier. Purge after final verifier denies with ABORTED before consumer delivery; queued pre-read purge remains PACKAGE_NOT_FOUND. Actual source/crypto-owned bridge package purge or TTL abort errors further reads and settles/zeroes its holding consumer; copied chunks remain stable and replay denies. Lazy construction/cancel starts no read; invalid/accessor/extra-field inputs reject without invoking getters or source. Multi-chunk input emits ≤64-KiB independent chunks in exact order. Timers/resources are cleaned. No acceptance based on signal object identity, weaker cancellation or incomplete Study outcome. |
| 005 | Focused actual crypto/engine tests and full API/build/type/Port pass. Privacy/no source refetch/no STOW/no schema/grant/API mutation review. Current actual source/Orthanc coverage is NOT RUN until the changed capture path is rerun with independent observers/B/privacy/cleanup; old results are not new-code evidence. |
| 006 | Before full coordinator release, actual PostgreSQL/RLS predicates plus fresh full Preflight/atomic dispatch and stable transport-owned chunks/borrowed lifetime must feed one real Test B Study STOW, followed by destination identity/hash and atomic integrity/provenance/Audit/terminal purge/security/E2E. Keep NOT IMPLEMENTED/NOT RUN until those actual gates; no completion from dispatched read alone. |

## PACS-001 DEC-019 — bounded single-attempt Study transport (before implementation)

CAPSTONE-P0 internal prerequisite for the full transfer coordinator. Initial status all NOT RUN; fake-fetch evidence does not prove real Orthanc import, authority, memory SLO or P0.

Current (2026-10-03 23:55 KST): STUDY-001–005 PASS within component/native-loopback protocol scope; new 50-test suite and full 45-file/962-test API/build/type/Port run 98976 exited 0. Dense inventory rejection and unread-body terminal/cancel-hook regressions included. STUDY-006 NOT IMPLEMENTED, whole P0 PARTIAL. No new live Orthanc, crypto borrowed-lifetime, TLS/RLS, production-memory or full-transfer claim. Evidence §64 distinguishes reused DEC-018 source/persistence from current transport tests.

| ID (`TC-PACS-001-STUDY-*`) | Required behavior / verification |
|---|---|
| 001 | Validate and snapshot context/Study/unique dense data-only Series-SOP inventory, profile, exact positive lengths, 2,000-object/64-MiB-instance/2-GiB-Study ceilings before fetch or opener. Reject A/wrong destination, malformed/duplicate inventory and unsupported profile before effects. Invalid/locked lazy streams deny delivery when opened; after dispatch their outcome is UNKNOWN (004), not a pre-effect claim. Caller mutations while waiting cannot change the validated target/inventory/opener. No caller URL/credential authority. |
| 002 | Multiple synthetic instances produce exactly one configured B multipart POST, canonical inventory order, exact bytes and complete framing. At most one input reader open; each exact-length EOF precedes opening the next. Body construction has highWaterMark 0, no eager opener or Study Buffer. Test downstream stall/backpressure and caller mutation. |
| 003 | Parse exact stored/warning/failed partition for all expected SOPs. Preserve well-formed 202 partial/warning outcomes; reject missing/duplicate/foreign/overlapping results or malformed response as unknown after one call. No COMPLETED inference. |
| 004 | Mid-body error, too-short/long/empty/non-byte chunk, opener error/late opener, abort, idle/total deadline, early HTTP response and response loss fail closed as unknown after dispatch. Abort the request, cancel/release active input and close multipart. Unopened instances stay unopened; no retry. Deadline must bound fetch that ignores signal. Semaphore is released on every path; follow-up operation succeeds. |
| 005 | Typed port rejects raw buffers/URL/credentials; full API/build/type/Port regression passes. Existing single-instance transport and source-only behavior remain unchanged. Sanitized results/errors only; no payload/PatientID/path/credential/raw upstream exception logging. |
| 006 | Before full product PASS, connect fresh full Preflight and durable fenced dispatch ownership to a separately specified authorized post-dispatch read, validated transport metadata, real Test Orthanc Study STOW, destination byte/identity verification, atomic Integrity/Provenance/Audit/terminal state, terminal purge and full security/E2E. This clause stays NOT IMPLEMENTED until those actual tests; component 001–005 cannot satisfy it. |

## PACS-001 DEC-018 runtime storage composition — before implementation

Classification: CAPSTONE-P0. All RUNTIME cases start NOT RUN. This new gate permits private provider/volume registration after DEC-017's internal evidence reconciliation (§61); it does not rewrite the historical no-registration Acceptance or permit public import/STOW.

**Current verification (2026-10-03 23:24 KST):** RUNTIME-001–008 PASS within the specified private DI/crypto/signed-token/SERVICE-denial/model/actual-volume validation scope. Final full API 44/912/build/type/Port and 189 script checks PASS; actual 4526 source/Orthanc 58 cases/observers/B/privacy/restorations/cleanup PASS, independent zero resources/unchanged frozen inputs verified. The volume probe's recovery is synthetic primitive evidence; actual registry/RLS/Audit proof remains the separately recorded unchanged persistence baseline, not modeled SQL. New maintenance deployment to real DB, unattended scheduling/credential refresh/shutdown and full product transfer/security/E2E are still required later work. Existing development stack not redeployed. Overall P0 PARTIAL; evidence §§61–62.

| ID (`TC-PACS-001-RUNTIME-*`) | Required behavior and evidence |
|---|---|
| 001 | Actual Nest module compilation resolves one encrypted-store instance; the source provider and the expiry runner use that same object. Source coordinator capture receives all required lifecycle methods, scoped quota stays per invocation, and no controller/import route/timer is added. Exercise behavior, not provider-name snapshots alone. |
| 002 | Await real root initialization before returning the provider. A private root works; a root symlink, regular file, unwritable mount or initialization error prevents successful bootstrap with a fixed storage error. No new constructor rejection is left unhandled. |
| 003 | Maintenance verifies a signed OIDC token with configured issuer/audience/JWKS before invoking the expiry runner. Missing verifier, invalid/expired/wrong-audience token or caller-supplied principal denies before candidate SQL/physical purge. Validate exact data-only input fields, token ≤8 KiB, UUID selectors and batch 1–100; snapshot selectors before await. |
| 004 | A verified token still requires current active Tenant-level SERVICE membership in the existing runner's discovery/mark/finalization transactions. USER, hospital-bound/inactive/missing/wrong-Tenant actor remains denied. Healthy one-shot results expose only aggregate counts/hasMore; verifier/runner exceptions return a fixed error without token/identifier/path/raw exception. Model tests and existing real signed registry/RLS evidence remain distinguished. |
| 005 | A restarted store over the private persisted ciphertext has no original key and blocks staging/read; initialization never deletes files or releases DB quota. Only the exact ref from verified Tenant metadata may enter existing purge-only recovery. Retain original repeat/purge/Audit/fault tests. |
| 006 | Runtime image and Compose mount use the fixed private directory; non-root user can initialize it on a new dedicated volume, mode 0700 directories/0600 ciphertext, read-only root filesystem/cap-drop/no-new-privileges preserved. No key/plaintext/token volume, host port, broad directory mount or environment credential addition. Actual network-disabled disposable-container volume probe and exact-owned cleanup required. |
| 007 | Full current API/build/type/Port and current 58-case isolated source/Orthanc/observer/B/privacy/cleanup pass. Existing DB/schema/grants remain byte-identical; separately recorded DB 51950 evidence covers that unchanged persistence baseline only. New runtime wiring is exercised separately; old results do not certify it. |
| 008 | Source provider still exposes no import route or STOW call; ordinary capture/error allowlists and final dispatch gates remain intact. Record deployed scheduling/coordinator, final Preflight/STOW/verification/P0 as NOT IMPLEMENTED until actual later Acceptance. No readiness/PURGED/completion claim from initialization or process exit. |

**Project:** MediQ
**Product:** Patient-Controlled Medical Imaging Mobility SaaS
**Document:** `ACCEPTANCE-TESTS.md`
**Version:** v1.15 PACS Transfer Operation State and Coordinator Preconditions
**Current Phase:** Capstone Technical MVP
**Primary Scope:** CAPSTONE-P0
**Status:** Approved Baseline

---

# 1. Purpose

본 문서는 MediQ P0 구현의 **최종 합격 기준**을 정의한다.

## 1.1 P1 편의·AI 질문자료 Acceptance 묶음

- `TC-PXE-CX-001~009`: Timeline, 최신성 구분, 쉬운 모드, 검색, 추세, 정정, 방문 꾸러미, 수동 일정, 응급카드 Gate.
- `TC-AIQ-001~008`: 합성 Allowlist, 식별자 제거, 실제 Record 거부, Copy 경고, 외부 네트워크 미호출, Watermark Capture, 고위험 Prompt 미생성, 응답 재수입 거부.
- 현재 결과는 모두 `NOT RUN`이다. HTML 정적 검사는 제품 Acceptance PASS를 의미하지 않는다.

## 1.2 Synthetic RAG Acceptance 묶음

`TC-RAG-001~020`은 합성 Marker, 식별정보 제거, Citation, 철회·충돌 Source, 금지 Intent, Prompt Injection, Timeout, 외부 Network 0건, 복사 고지와 P0 독립 실패경계를 검증한다. 현재 Runtime과 Test Harness가 없으므로 모두 `NOT RUN`이다.

지금까지 작성된:

```text
PROJECT-CHARTER.md
CAPSTONE-MVP-BOUNDARY.md
PRODUCT-BASELINE.md
REQUIREMENTS.md
SECURITY-REQUIREMENTS.md
DOMAIN-MODEL.md
SYSTEM-ARCHITECTURE.md
DATA-FLOW.md
DATA-MODEL.md
ERD.md
OPENAPI.yaml
THREAT-MODEL.md
```

의 내용을 실제 실행 가능한 Acceptance Test로 변환한다.

본 문서부터는 새로운 Architecture나 Product Scope를 설계하지 않는다.

---

# 2. Acceptance Contract

P0 Requirement는 다음 Traceability Chain을 가져야 한다.

```text
REQ-*
  ↓
SEC-*
  ↓
THR-*
  ↓
API / Domain Action
  ↓
AT-*
  ↓
PASS / FAIL
```

P0 `MUST` Requirement가 Acceptance Test 없이 남아 있으면:

```text
P0 BASELINE
→ PARTIAL
```

로 판단한다.

---

# 3. Test Categories

Acceptance Test를 세 그룹으로 구분한다.

## Category A — Functional Acceptance

정상 업무기능이 동작하는지 검증한다.

```text
AT-FUNC-*
```

---

## Category B — Security Negative Acceptance

잘못된 Context에서 반드시 차단되는지 검증한다.

```text
AT-SEC-*
```

---

## Category C — End-to-End Golden Path

전체 의료영상 Exchange가 실제로 완료되는지 검증한다.

```text
AT-E2E-*
```

---

# 4. Acceptance Test Format

모든 핵심 Test는 다음 형식을 따른다.

```text
Test ID:
AT-XXX-NNN

Objective:
...

Traceability:
REQ-...
SEC-...
THR-...
API ...

Given:
...

When:
...

Then:
...

Expected HTTP:
...

Expected Domain State:
...

Expected Audit:
...

Expected Evidence:
...

Result:
PASS / FAIL
```

---

# 5. P0 Test Environment

Acceptance Test는 다음 환경을 기준으로 한다.

```text
Browser / Test Client

MediQ Web

MediQ Backend API

PostgreSQL

Hospital A Test Orthanc

Hospital B Test Orthanc

Temporary Imaging Storage
```

권장 Deployment:

```text
Docker Compose
```

---

# 6. Synthetic Test Fixtures

실제 환자 데이터는 사용하지 않는다.

## Tenant / Hospital

```text
Tenant A
Hospital A
Source Hospital

Tenant B
Hospital B
Destination Hospital

Tenant C
Hospital C
Unauthorized Third Party
```

---

## Patient

```text
MediQ Patient Reference:
MQ-TEST-0001

Hospital A Local Patient ID:
TEST-A-001

Hospital B Local Patient ID:
TEST-B-982
```

---

## Test Imaging

최소 하나의:

```text
Synthetic CT Study
```

또는:

```text
Synthetic MRI Study
```

를 Hospital A Orthanc에 등록한다.

---

# 7. Test Identity Fixtures

최소 다음 Actor를 준비한다.

```text
ACTOR-A
Tenant A / Hospital A

ACTOR-B
Tenant B / Hospital B

ACTOR-C
Tenant C / Hospital C

SERVICE-MEDIQ
MediQ internal service context
```

---

# 8. Core Expected Audit Actions

Acceptance Test에서 확인 가능한 주요 Audit Event:

```text
SESSION_CREATED

CONSENT_REQUESTED
CONSENT_APPROVED
CONSENT_WITHDRAWN

AUTHENTICATION_FAILURE

AUTHORIZATION_GRANTED
AUTHORIZATION_DENIED

GRANT_CREATED
GRANT_DENIED

VIEWER_OPENED

DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
DOWNLOAD_FAILED

PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
PACS_TRANSFER_FAILED

INTEGRITY_VERIFIED
INTEGRITY_FAILURE

ACCESS_DENIED

SESSION_COMPLETED
```

---

# 9. Functional Acceptance — Exchange

## AT-FUNC-001 — Exchange Session 생성

**Objective**

정상적인 의료영상 Exchange Session을 생성한다.

**Traceability**

```text
REQ-EXC-001
REQ-EXC-002
REQ-SYS-001
```

API:

```text
POST /exchange-sessions
```

### Given

* verified active `USER` ACTOR-B가 IAM-002에서 목적지 Hospital B의 활성 membership으로 확인됨
* `MQ-TEST-0001` 존재
* Hospital A 존재
* Hospital B 존재
* Source와 Destination이 서로 다름
* 필수 `X-Tenant-ID` membership selector와 UUID `Idempotency-Key` 제공

### When

정상적인 Exchange 생성 요청을 전송한다.

### Then

새로운 고유 `sessionId`가 생성되어야 한다.

### Expected HTTP

```text
201 Created
```

### Expected State

```text
REQUESTED
```

### Expected Audit

```text
SESSION_CREATED
result = SUCCESS
```

### PASS

* `session_id` 고유
* PatientReference 일치
* Source Hospital A
* Destination Hospital B
* requester = 인증된 Actor Context
* 같은 Actor/key/동일 request의 retry는 같은 Session ID를 반환
* 한 건의 `SESSION_CREATED / SUCCESS` Audit만 같은 transaction에 기록
* 생성 결과는 Session `REQUESTED` metadata뿐이며 Consent, Grant, Study, image access 또는 PACS side effect는 없음

---

# 10. AT-FUNC-002 — Exchange Session 조회

**Traceability**

```text
REQ-EXC-001
SEC-API-002
THR-002
```

API:

```text
GET /exchange-sessions/{sessionId}
```

### Given

ACTOR-B가 접근할 권한을 가진 Session.

### When

Session을 조회한다.

### Then

해당 Session Metadata를 반환해야 한다.

### Expected HTTP

```text
200 OK
```

### Expected State

기존 State 유지.

### Audit

읽기 Audit 정책을 구현한 경우 조회 Event 기록 가능.

---

# 11. Functional Acceptance — Patient Mapping

## AT-FUNC-003 — Valid Destination Mapping

**Traceability**

```text
REQ-PAT-003
REQ-PAT-004
SEC-IAM-007
SEC-IAM-008
SEC-IAM-009
THR-018
```

PAT-003은 순수 Domain validator Acceptance다. 공개 API는 이 Ticket에서 만들거나 실행하지 않는다.

### TC-PAT-003-DOM-001 — Exact validated destination mapping

- Given server-resolved `patientRefId`, `destinationHospitalId`와 해당 binding이 일치하는 단일 synthetic mapping (`VALID`, `validatedAt != null`)
- When validator를 실행한다
- Then `VALID`와 내부 `mappingId`만 반환한다. `localPatientId`, `pacsImportAllowed`, Authorization `ALLOW`는 반환하지 않는다.

### TC-PAT-003-DOM-002 — Missing mapping

- Given 후보 mapping이 없음
- When validator를 실행한다
- Then `DENY/MAPPING_MISSING`를 반환한다.

### TC-PAT-003-DOM-003 — Multiple or explicitly ambiguous mapping

- Given 후보 mapping이 둘 이상이거나 단일 mapping의 상태가 `AMBIGUOUS`
- When validator를 실행한다
- Then `DENY/MAPPING_AMBIGUOUS`를 반환하며 임의 선택하지 않는다.

### TC-PAT-003-DOM-004 — Binding mismatch

- Given PatientReference 또는 Destination Hospital이 요청의 server-resolved binding과 다른 후보
- When validator를 실행한다
- Then `DENY/MAPPING_BINDING_MISMATCH`를 반환한다.

### TC-PAT-003-DOM-005 — Unverified, revoked, or missing validation evidence

- Given `UNVERIFIED`, `REVOKED`, 또는 `VALID`이지만 `validatedAt`이 없는 후보
- When validator를 실행한다
- Then 각각 고정된 deny reason으로 `DENY`한다.

### TC-PAT-003-DOM-006 — Invalid context/object

- Given malformed Patient/Hospital UUID, malformed candidate collection/object, 또는 null 입력
- When validator를 실행한다
- Then `DENY/INVALID_INPUT` 또는 `DENY/INVALID_MAPPING`을 반환하고 예외를 외부로 전파하지 않는다.

### TC-PAT-003-DOM-007 — Result minimization

- Given 성공·거부 판정
- Then 결과에는 raw/local patient identifier, DICOM data, credentials, Consent/Grant facts가 없다.

### TC-PAT-003-DOM-008 — No side effects

- Given any validation result
- Then DB, HTTP, Audit, Orthanc, STOW-RS 등 외부 호출은 발생하지 않는다.

**Boundary:** `VALID`는 mapping eligibility only다. 이 Acceptance는 PACS Import를 실행하거나 PACS Import가 전체적으로 허용됐음을 증명하지 않는다. `AT-SEC-012`는 actual import boundary에서 no-STOW denial을 검증하는 후속 integration Acceptance로 유지한다.

### TC-PAT-004-PER-001 — Repository reports no destination mapping

- Given a synthetic exact-Hospital/PatientReference lookup whose query returns zero rows
- When the repository returns `null` and the result is passed to the destination validator as no candidates
- Then the decision is `DENY/MAPPING_MISSING`; no patient is selected or inferred.

### TC-PAT-004-PER-002 — Persisted invalid status is preserved and denied

- Given one row with status `AMBIGUOUS`, `UNVERIFIED`, or `REVOKED`, or `VALID` with `validated_at = NULL`
- When the mocked adapter reconstitutes the row and the domain validator evaluates it
- Then it returns the corresponding fixed `DENY` reason; it never upgrades the row to `VALID`.

### TC-PAT-004-PER-003 — Duplicate query rows fail closed

- Given a repository query unexpectedly returns multiple rows for a unique `(hospital_id, patient_ref_id)` lookup
- When repository `findOne` processes the result
- Then it raises fixed `PatientMappingPersistenceError`; it does not select the first row or return a mapping.

### TC-PAT-004-PER-004 — Database exception is not a mapping decision

- Given the mocked query throws a driver error
- When the repository handles the error
- Then it raises fixed `PatientMappingPersistenceError`; it must not return null, `VALID`, or an Authorization decision.

### TC-PAT-004-PER-005 — Persistence errors disclose no mapping or driver details

- Given duplicate rows or a query exception containing synthetic Local Patient ID, SQL or driver detail
- When the repository maps the failure
- Then the error message remains the fixed persistence code and contains none of those details.

**Boundary:** These cases use a mocked `PoolClient`; they do not prove actual PostgreSQL grants/RLS, destination Hospital authorization, an HTTP response or PACS no-STOW behavior. `AT-SEC-012` remains `PLANNED / NOT RUN` until `MEDIQ-PACS-004` integration.

**Execution result (2026-09-30):** `TC-PAT-004-PER-001~005` PASS — focused 7/7 and API regression 17 files / 330 tests. This result is limited to the mocked adapter-to-domain boundary; live DB/RLS, destination authorization and `AT-SEC-012` remain NOT RUN.

---

# 12. AT-FUNC-004 — Study 목록 조회

**Traceability**

```text
REQ-DICOM-001
SEC-DICOM-001
```

API:

```text
GET /exchange-sessions/{sessionId}/studies
```

### Given

* 유효한 Session
* Hospital A Orthanc에 Test Study 존재
* Actor 권한 유효

### When

Study 목록을 요청한다.

### Then

QIDO-RS 결과를 MediQ StudyReference 형식으로 반환한다.

### Expected HTTP

```text
200 OK
```

### Expected Data

```text
studyRefId
studyInstanceUID
sourceHospitalId
modality
```

---

# 13. Functional Acceptance — Consent

## AT-FUNC-005 — Consent Request 생성

**Traceability**

```text
REQ-CON-001
REQ-CON-002
```

API:

```text
POST /exchange-sessions/{sessionId}/consents/request
```

### Given

Session:

```text
REQUESTED
```

### When

Allowed Action:

```text
VIEW
DOWNLOAD
PACS_IMPORT
```

중 하나 이상으로 Consent Request 생성.

### Then

Consent Artifact가 생성된다.

### Expected HTTP

```text
201 Created
```

### Expected Consent State

```text
PENDING
```

### Expected Session State

```text
CONSENT_PENDING
```

### Expected Audit

```text
CONSENT_REQUESTED
```

---

# 14. AT-FUNC-006 — Consent 승인

**Traceability**

```text
REQ-CON-003
SEC-CONSENT-001
```

API:

```text
POST /exchange-sessions/{sessionId}/consents/{consentId}/approve
```

### Given

```text
Consent = PENDING
```

### When

Synthetic Patient Consent Approval을 수행한다.

### Then

### Expected HTTP

```text
200 OK
```

### Consent State

```text
ACTIVE
```

### Session State

```text
CONSENTED
```

### Audit

```text
CONSENT_APPROVED
```

---

# 15. AT-FUNC-007 — Consent 철회

**Traceability**

```text
REQ-CON-004
SEC-CONSENT-002
```

API:

```text
POST /exchange-sessions/{sessionId}/consents/{consentId}/withdraw
```

### Given

```text
Consent ACTIVE
```

The API is a Synthetic/Test P0 technical workflow. The caller must be an active tenant-level USER with a verified signed OIDC `mediq_patient_ref_id` claim that exactly matches the server-owned Session and Consent. No body/query/caller-selected patient header is accepted. Withdrawal is permitted even after Consent/Session expiry or terminal Session state; it does not change Session/Grant/PACS/image state or claim to recall already delivered data.

### When

Consent Withdrawal 실행.

### Then

### HTTP

```text
200 OK
```

### State

```text
Consent = WITHDRAWN
```

The transition sets `withdrawn_at` and `updated_at` from the server clock. Consent fields and one successful Audit must commit atomically. Repeating the exact completed withdrawal is an idempotent replay with no additional Audit. Only `ACTIVE→WITHDRAWN` is allowed; PENDING/EXPIRED/REJECTED conflict. A later grant/access decision must independently deny WITHDRAWN Consent.

### Audit

```text
CONSENT_WITHDRAWN
```

**Execution result (2026-10-01):** `AT-FUNC-007` and `TC-CON-005-API-001~013` PASS for the synthetic technical API only. Actual signed OIDC/JWKS HTTP→PostgreSQL/RLS, expiry-independent withdrawal, replay/concurrency, atomic rollback and exact 126 runtime column grants passed. See [MEDIQ-CON-005 test evidence](implementation/MEDIQ-CON-005/TEST-EVIDENCE.md). Legal identity/consent, future Grant concurrency and product PACS E2E remain unverified.

---

# 16. Functional Acceptance — Grant

## AT-FUNC-008 — View Grant 발급

**Traceability**

```text
REQ-GRT-001
REQ-GRT-002
SEC-GRANT-001
```

API:

```text
POST /exchange-sessions/{sessionId}/grants/issue
```

### Given

```text
Consent ACTIVE
Consent allows VIEW
Correct Tenant
Correct Hospital
```

### When

```text
scope = study:view
```

Grant 발급 요청.

### Then

### HTTP

```text
201 Created
```

### Grant State

```text
ACTIVE
```

### Expected Scope

```text
study:view
```

### Audit

```text
AUTHORIZATION_GRANTED
GRANT_CREATED
```

---

# 17. AT-FUNC-009 — Grant 철회

**Traceability**

```text
REQ-GRT-008
SEC-GRANT-009
MEDIQ-GRT-004
```

API:

```text
POST /exchange-sessions/{sessionId}/grants/{grantId}/revoke
```

### Given

```text
Grant ACTIVE
```

### When

정확히 결속된 목적지 USER Actor가 Grant 철회를 요청한다. Consent/Session/Grant의 유효기간 상태는 철회 자체를 차단하지 않는다.

### Then

```text
Grant = REVOKED
revokedAt = server timestamp
Scopes/history retained
one GRANT_REVOKED/SUCCESS Audit
```

### HTTP

```text
200 OK
```

이미 철회된 동일 Grant 재요청은 원래 `revokedAt`을 보존하고 `Idempotency-Replayed: true`와 동일한 결과를 반환한다. Grant 상태 변경과 성공 Audit은 원자적이어야 한다. 이 동작은 오프라인 복사본 회수 또는 진행 중 Viewer/Download/PACS 중단을 의미하지 않는다.

**Execution result (2026-10-01):** `MEDIQ-GRT-004` scoped acceptance passed. Evidence: [GRT-004 test record](implementation/MEDIQ-GRT-004/TEST-EVIDENCE.md). This does not prove remote recall or operation-time image authorization.

---

# 18. Functional Acceptance — Viewer

## AT-FUNC-010 — Viewer 정상 접근

**Traceability**

```text
REQ-VIEW-001
REQ-VIEW-003

SEC-AUTHZ-006
SEC-DICOM-002

THR-009
THR-012
```

API:

```text
POST /exchange-sessions/{sessionId}/actions/view
```

### Given

```text
Authenticated ACTOR-B
Valid Tenant B
Valid Session
ACTIVE Consent
ACTIVE Grant
study:view
Correct Study
```

### When

Viewer Action을 실행한다.

### Then

Authorization된 Viewer Access를 반환한다.

### HTTP

```text
200 OK
```

### Expected Response

```text
viewerUrl
expiresAt
studyRefId
```

### Expected Audit

```text
AUTHORIZATION_GRANTED
VIEWER_OPENED
```

### Expected Imaging

CT/MRI Study가 Viewer에서 정상 Render된다.

---

# 19. Functional Acceptance — Download

## AT-FUNC-011 — DICOM Download 정상 수행

**Traceability**

```text
REQ-DWN-001
SEC-AUTHZ-008
```

API:

```text
POST /exchange-sessions/{sessionId}/actions/download
```

### Given

```text
Authenticated
Valid Session
ACTIVE Consent
ACTIVE Grant
study:download
Correct Resource
```

### When

DICOM Download 실행.

### Then

### HTTP

```text
200 OK
```

### Content Type

```text
application/zip
```

또는 승인된 DICOM Package Download 형식.

### Audit

```text
DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
```

---

# 20. Functional Acceptance — PACS Import

## AT-FUNC-012 — PACS Import 정상 수행

**Traceability**

```text
REQ-PACS-001
REQ-PACS-002
REQ-PACS-003
REQ-PACS-005

SEC-DICOM-004
SEC-DICOM-005

THR-017
THR-018
THR-019
```

API:

```text
POST /exchange-sessions/{sessionId}/actions/pacs-import
```

### Given

```text
Authenticated Actor
Valid Tenant
Valid ExchangeSession
ACTIVE Consent
ACTIVE Grant
study:pacs-transfer
Correct Destination Hospital B
VALID PatientMapping
Hospital B STOW-RS available
```

### When

PACS Import Action을 실행한다.

### Then

Flow:

```text
Hospital A
→ WADO-RS
→ MediQ
→ STOW-RS
→ Hospital B
```

가 성공해야 한다.

### HTTP

```text
200 OK
```

### Expected Result

```text
transferStatus = COMPLETED
destinationVerified = true
integrityStatus = VERIFIED
```

### Expected Audit

```text
AUTHORIZATION_GRANTED
PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
INTEGRITY_VERIFIED
```

### Expected Provenance

```text
Hospital A
→ MediQ
→ Hospital B
```

---

# 21. AT-FUNC-013 — Destination Study Verification

**Traceability**

```text
REQ-PACS-005
THR-020
```

### Given

Protected PACS import has passed the complete Mandatory Preflight, and the server holds the authoritative source Study→Series→SOP Instance inventory and content-integrity evidence for the operation.

### When

After the single authorized STOW attempt, the coordinator performs bounded, read-only destination reconciliation against the exact server-resolved Hospital B and Study. QIDO `limit`/`offset` pagination must be complete; any additional-results Warning must be followed, limits and deadlines must be honored, and two consecutive complete Series/per-Series SOP Instance inventories must be identical and equal the expected hierarchy.

### Then

- Every expected Series and SOP Instance exists at the exact destination Study hierarchy.
- No missing, extra, duplicate, malformed, cross-Study, or cross-Series identity is accepted.
- `COMPLETED` is allowed only when exact destination identity equality, source↔destination byte integrity, completed Provenance, and the required completion Audit are committed with the legal operation transition.
- An incomplete, changing/inconsistent, over-limit, failed, or ambiguous scan never yields `COMPLETED`; preserve the evidence-backed `PARTIAL`, `RESULT_UNKNOWN`, or `FAILED` state.
- No blind STOW retry is permitted. A QIDO mismatch or unavailable query is not proof that no write occurred.

### Current status

`NOT RUN` — no protected product coordinator or post-STOW workflow exists. `MEDIQ-PACS-006` adds only an internal read-only verification primitive; it does not satisfy this end-to-end Acceptance.

---

# 22. AT-FUNC-014 — Integrity 정상 검증

**Traceability**

```text
REQ-INT-001
SEC-INT-001
```

### Given

Bit-preserving Transfer.

### When

Source/Destination Integrity Evidence 비교.

### Then

```text
Integrity = VERIFIED
```

### Audit

```text
INTEGRITY_VERIFIED
```

---

# 23. AT-FUNC-015 — Provenance 조회

**Traceability**

```text
REQ-PROV-002
SEC-INT-003
```

API:

```text
GET /exchange-sessions/{sessionId}/provenance
```

### Then

최소 다음을 확인할 수 있어야 한다.

```text
Source Hospital
Study
Exchange Session
Destination Hospital
Transfer Status
Integrity
```

### HTTP

```text
200 OK
```

---

# 24. AT-FUNC-016 — Audit Trail 조회

**Traceability**

```text
REQ-AUD-001
SEC-AUD-001
SEC-AUD-002
THR-039
```

API:

```text
GET /exchange-sessions/{sessionId}/audit-events
```

### Then

Session의 주요 Lifecycle을 시간순으로 추적할 수 있어야 한다.

예:

```text
SESSION_CREATED
CONSENT_REQUESTED
CONSENT_APPROVED
GRANT_CREATED
PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED
INTEGRITY_VERIFIED
SESSION_COMPLETED
```

---

# 25. Security Negative Acceptance

---

# 26. AT-SEC-001 — Unauthenticated Access

**Traceability**

```text
SEC-IAM-004
THR-001
```

### Given

Authorization Header 없음.

### When

```text
GET /exchange-sessions/{sessionId}
```

### Then

### HTTP

```text
401 Unauthorized
```

### Audit

```text
AUTHENTICATION_FAILURE
```

### Requirement

보호 Resource가 반환되지 않아야 한다.

---

# 27. AT-SEC-002 — Invalid Credential

**Traceability**

```text
SEC-IAM-005
```

### Given

위조 또는 Invalid Credential.

### When

보호 Endpoint 접근.

### Expected

```text
401 Unauthorized
```

---

# 28. AT-SEC-003 — Session BOLA / IDOR

**Traceability**

```text
SEC-API-002
THR-002
```

### Given

ACTOR-C가 Hospital A→B Session UUID를 알고 있음.

### When

```text
GET /exchange-sessions/{sessionId}
```

### Then

### HTTP

```text
403 Forbidden
```

또는 Resource Enumeration을 방지하는 정책일 경우:

```text
404 Not Found
```

### Audit

```text
AUTHORIZATION_DENIED
ACCESS_DENIED
```

---

# 29. AT-SEC-004 — Wrong Tenant

**Traceability**

```text
REQ-TEN-002
SEC-TEN-001
THR-003
```

### Given

Tenant C Actor.

### When

A→B Exchange Resource 접근.

### Then

```text
403 Forbidden
```

### Audit

```text
ACCESS_DENIED
reason = TENANT_MISMATCH
```

---

# 30. AT-SEC-005 — No Consent Grant Request

**Traceability**

```text
REQ-CON-003
SEC-CONSENT-001
THR-004
```

### Given

Session 존재.

Consent 없음.

### When

```text
POST /exchange-sessions/{sessionId}/grants/issue
```

### Then

```text
403 Forbidden
```

### Audit

```text
GRANT_DENIED
```

---

# 31. AT-SEC-006 — Withdrawn Consent Grant Request

**Traceability**

```text
SEC-CONSENT-002
THR-004
```

### Given

```text
Consent = WITHDRAWN
```

### When

Grant 발급 시도.

### Then

```text
403 Forbidden
```

### Audit

```text
GRANT_DENIED
```

---

# 32. AT-SEC-007 — Consent Scope Escalation

**Traceability**

```text
SEC-GRANT-005
THR-005
```

### Given

Consent:

```text
VIEW
```

만 허용.

### When

Grant:

```text
study:download
```

요청.

### Then

```text
403 Forbidden
```

### Audit

```text
GRANT_DENIED
```

---

# 33. AT-SEC-008 — Expired Grant

**Traceability**

```text
SEC-GRANT-002
THR-007
```

### Given

```text
Grant = EXPIRED
```

### When

Viewer/Download/PACS Action 요청.

### Then

```text
403 Forbidden
```

### Audit

```text
AUTHORIZATION_DENIED
ACCESS_DENIED
```

---

# 34. AT-SEC-009 — Wrong Recipient

**Traceability**

```text
SEC-GRANT-003
THR-008
```

### Given

Grant Recipient:

```text
Hospital B
```

Requester:

```text
Hospital C
```

### When

Grant 사용.

### Then

```text
403 Forbidden
```

---

# 35. AT-SEC-010 — View-only Grant Download

**Traceability**

```text
SEC-GRANT-005
SEC-AUTHZ-009
THR-006
```

### Given

```text
scope = study:view
```

### When

```text
POST /actions/download
```

### Then

```text
403 Forbidden
```

### Audit

```text
AUTHORIZATION_DENIED
DOWNLOAD_FAILED or ACCESS_DENIED
```

---

# 36. AT-SEC-011 — View-only Grant PACS Import

### Given

```text
scope = study:view
```

### When

```text
POST /actions/pacs-import
```

### Then

```text
403 Forbidden
```

---

# 37. AT-SEC-012 — Invalid Patient Mapping

**Traceability**

```text
REQ-PAT-004
SEC-IAM-007
THR-018
```

### Given

Hospital B PatientMapping:

```text
UNVERIFIED
```

또는:

```text
AMBIGUOUS
REVOKED
NOT_FOUND
```

### When

PACS Import 수행.

### Then

```text
PACS_IMPORT operation is DENIED
STOW-RS request count = 0
destination contains no new instance from this operation
```

`MEDIQ-PACS-004` internal mapping-gate tests are recorded below, but the composite `AT-SEC-012` remains `NOT RUN`: there is not yet a protected PACS Import endpoint/coordinator, and this Ticket did not call Test Orthanc or measure an actual import-side STOW request counter. PAT-003/004 Domain cases and the new internal-gate unit tests are not, alone, AT-SEC-012 completion evidence.

### Required Result

```text
No STOW-RS request
```

### Audit

```text
PACS_TRANSFER_FAILED
reason = PATIENT_MAPPING_INVALID
```

---

# 38. AT-SEC-013 — Wrong Destination

**Traceability**

```text
SEC-DICOM-005
THR-017
```

### Given

Session Destination:

```text
Hospital B
```

하지만 Grant/Request Target:

```text
Hospital C
```

### When

PACS Import.

### Then

```text
409 Conflict
```

또는:

```text
403 Forbidden
```

### Required

Hospital C에 STOW-RS 요청이 발생해서는 안 된다.

---

# 39. AT-SEC-014 — Invalid Session State

**Traceability**

```text
SEC-AUTHZ-004
THR-029
```

각 상태를 테스트한다.

```text
EXPIRED
REVOKED
FAILED
REJECTED
CANCELLED
```

### When

보호 Imaging Action 수행.

### Then

```text
403 Forbidden
```

또는 Domain State Conflict:

```text
409 Conflict
```

### Required

Imaging Access 없음.

---

# 40. AT-SEC-015 — Study UID Direct Access

**Traceability**

```text
SEC-AUTHZ-007
THR-009
```

### Given

공격자가 StudyInstanceUID를 알고 있음.

유효한 Session/Grant 없음.

### When

Viewer 또는 Imaging Retrieval 시도.

### Then

```text
DENY
```

Study UID 자체는 접근권한이 아니다.

---

# 41. AT-SEC-016 — Unauthorized Study Listing

**Traceability**

```text
SEC-DICOM-001
THR-011
```

### Given

권한 없는 Tenant.

### When

```text
GET /exchange-sessions/{sessionId}/studies
```

### Then

```text
403 Forbidden
```

Study Metadata가 반환되지 않아야 한다.

---

# 42. AT-SEC-017 — Authorization Engine Failure

**Traceability**

```text
SEC-AUTHZ-003
SEC-ERR-003
THR-030
```

### Given

Authorization Policy Evaluation에서 의도적인 오류 발생.

### When

보호 Action 요청.

### Then

```text
DENY
```

### Required

다음 동작 금지:

```text
Security Error
→ Continue
```

### HTTP

권장:

```text
403
```

또는 안전한:

```text
5xx
```

단 어떠한 경우에도 Resource는 반환하지 않는다.

---

# 43. AT-SEC-018 — Integrity Mismatch

**Traceability**

```text
SEC-INT-002
THR-021
```

### Given

Destination Payload 검증값을 의도적으로 불일치하게 구성.

### When

PACS Import Integrity Verification.

### Then

```text
integrityStatus = FAILED
transferStatus = FAILED
```

### Required

```text
transferStatus = COMPLETED
```

가 되어서는 안 된다.

### Audit

```text
INTEGRITY_FAILURE
PACS_TRANSFER_FAILED
```

---

# 44. AT-SEC-019 — Sensitive Information in Error

**Traceability**

```text
SEC-ERR-001
THR-010
```

### Given

의도적인 Backend Error.

### When

API 호출.

### Then

Response에 다음이 포함되어서는 안 된다.

```text
DB password
Raw token
Private key
Filesystem credential
Stack secret
```

---

# 45. AT-SEC-020 — Sensitive Information in Log

**Traceability**

```text
SEC-LOG-001
THR-034
```

### When

Authentication/Download/PACS Action을 실행한다.

### Then

Application Log / Audit Log에 다음이 존재해서는 안 된다.

```text
Password
Raw bearer token
Private key
Raw DICOM binary
DEK
KEK
```

---

# 46. AT-SEC-021 — Direct Temporary Storage Access

**Traceability**

```text
SEC-DATA-001
THR-023
```

### Given

Internal `storage_ref`가 존재.

### When

사용자가 직접 Storage Path로 접근을 시도.

### Then

```text
DENY
```

또는 External Route 자체가 존재하지 않아야 한다.

---

# 47. AT-SEC-022 — TLS Required

**Traceability**

```text
SEC-TLS-001
THR-014
THR-022
```

### Verify

```text
Browser ↔ MediQ
MediQ ↔ Orthanc A
MediQ ↔ Orthanc B
```

보호 통신은 HTTPS/TLS여야 한다.

### PASS

평문 보호통신 Endpoint가 P0 정상경로에 존재하지 않는다.

---

# 48. AT-SEC-023 — Certificate Validation

**Traceability**

```text
SEC-TLS-002
```

### Given

Invalid/Untrusted Certificate 또는 Test Certificate Failure 조건.

### Then

기본 Client 동작은 연결 실패여야 한다.

Production-like 경로에서:

```text
verify=false
```

와 같은 우회 설정을 허용해서는 안 된다.

---

# 49. AT-SEC-024 — Token Expiration

**Traceability**

```text
SEC-TOK-002
THR-036
```

### Given

Expired Token.

### Then

```text
401 Unauthorized
```

---

# 50. AT-SEC-025 — Wrong Audience Token

**Traceability**

```text
SEC-TOK-003
THR-037
```

### Given

다른 Audience용 Token.

### Then

```text
401 Unauthorized
```

---

# 51. AT-SEC-026 — Client Tenant Spoofing

**Traceability**

```text
THR-028
SEC-TEN-001
```

### Given

ACTOR-C 인증 Token.

Request Body/Header에:

```text
tenantId = Tenant B
```

조작.

### Then

Server는 인증 Context의 Tenant C를 사용해야 한다.

### Expected

```text
DENY
```

---

# 52. E2E Golden Path Tests

---

# 53. AT-E2E-001 — Viewer Golden Path

### Objective

Hospital A의 CT/MRI를 정상적인 Patient-Controlled Flow를 거쳐 Hospital B 사용자가 Viewer에서 조회한다.

### Given

```text
Hospital A Test Orthanc
→ Synthetic Study exists

Patient Mapping
→ A mapping VALID
→ B mapping VALID

ACTOR-B authenticated
```

### When

순서대로 실행한다.

```text
1. POST /exchange-sessions

2. POST /consents/request

3. POST /consents/{id}/approve

4. POST /grants/issue
   scope = study:view

5. POST /actions/view
```

### Then

```text
Viewer renders Study
```

### Expected HTTP Sequence

```text
201
201
200
201
200
```

### Expected Audit

```text
SESSION_CREATED
CONSENT_REQUESTED
CONSENT_APPROVED
AUTHORIZATION_GRANTED
GRANT_CREATED
VIEWER_OPENED
```

### Result

```text
PASS
```

---

# 54. AT-E2E-002 — Download Golden Path

### Flow

```text
Create Exchange
→ Consent
→ Grant study:download
→ DICOM Download
```

### Expected

```text
HTTP 200
Valid DICOM package
```

### Audit

```text
DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
```

---

# 55. AT-E2E-003 — PACS Import Golden Path

P0의 가장 중요한 Acceptance Test다.

### Given

```text
Hospital A Orthanc:
Synthetic CT/MRI exists

Hospital B Orthanc:
Available

PatientMapping:
Hospital A = VALID
Hospital B = VALID

Destination:
Hospital B
```

### When

```text
1. Create Exchange
2. Request Consent
3. Approve Consent
4. Issue study:pacs-transfer Grant
5. Validate Patient Mapping
6. Execute PACS Import
7. Verify Destination
8. Verify Integrity
9. Read Provenance
10. Read Audit
```

### Then

다음 전체 흐름이 성공해야 한다.

```text
Hospital A Orthanc
      ↓ WADO-RS
MediQ
      ↓ STOW-RS
Hospital B Orthanc
```

### Expected API Result

```text
transferStatus = COMPLETED

destinationVerified = true

integrityStatus = VERIFIED
```

### Destination

Hospital B Orthanc에서 대상 Study가 실제 존재한다.

### Provenance

```text
Source:
Hospital A

Destination:
Hospital B

Transfer:
PACS_IMPORT

Status:
COMPLETED

Integrity:
VERIFIED
```

### Audit

최소:

```text
SESSION_CREATED

CONSENT_REQUESTED
CONSENT_APPROVED

AUTHORIZATION_GRANTED
GRANT_CREATED

PACS_TRANSFER_STARTED
PACS_TRANSFER_COMPLETED

INTEGRITY_VERIFIED

SESSION_COMPLETED
```

### Final State

```text
ExchangeSession = COMPLETED
```

### Result

```text
PASS
```

---

# 56. AT-E2E-004 — Wrong Tenant Negative Golden Path

### Given

정상 A→B Exchange.

### When

Hospital C Actor가 동일 Session에 접근.

### Then

```text
DENY
```

### Required

```text
No Study Data
No Download
No STOW
```

### Audit

```text
AUTHORIZATION_DENIED
ACCESS_DENIED
```

---

# 57. AT-E2E-005 — Consent Withdrawal Negative Golden Path

### Given

정상 Session과 ACTIVE Consent.

### When

Consent 철회 후 신규 Grant 발급 시도.

### Then

```text
DENY
```

### Required

철회 후 신규 Viewer/Download/PACS Grant가 발급되지 않아야 한다.

---

# 58. AT-E2E-006 — Mapping Failure Negative Golden Path

### Given

정상 Session, Consent, Grant.

Hospital B Mapping:

```text
AMBIGUOUS
```

### When

PACS Import.

### Then

```text
DENY / FAIL
```

### Required

Hospital B Orthanc에 Study가 저장되지 않아야 한다.

---

# 59. AT-E2E-007 — Integrity Failure Negative Golden Path

### Given

STOW 동작은 성공.

Integrity Evidence 불일치.

### Then

```text
PACS Import = FAILED
```

### Required

```text
Session COMPLETED
```

처리를 해서는 안 된다.

### Provenance

```text
transferStatus = FAILED
```

### Audit

```text
INTEGRITY_FAILURE
PACS_TRANSFER_FAILED
```

---

# 60. DICOMweb Adapter Acceptance

## AT-DICOM-001 — QIDO-RS

Hospital A Test Orthanc에서 Study Query가 성공해야 한다.

```text
Expected:
StudyInstanceUID discovered
```

---

## AT-DICOM-002 — WADO-RS

선택된 Study Payload를 정상 조회할 수 있어야 한다.

---

## AT-DICOM-003 — STOW-RS

Hospital B Orthanc로 Test Study를 정상 저장할 수 있어야 한다.

---

## AT-DICOM-004 — Upstream Failure

Orthanc A 또는 B를 의도적으로 중단한다.

### Expected

```text
502 Upstream Failure
```

또는 정의된 안전한 Failure.

### Required

성공 상태로 기록하지 않는다.

---

# 61. Audit Acceptance

## AT-AUD-001 — Audit Context

Audit Event는 최소:

```text
timestamp
actor_reference
tenant_context
session_reference
action
result
```

을 제공해야 한다.

---

## AT-AUD-002 — Correlation

동일 API Action의 로그와 Audit Event를:

```text
correlation_id
```

등으로 연결 가능해야 한다.

---

## AT-AUD-003 — Audit Minimization

Audit에:

```text
DICOM binary
Raw token
Password
Private key
```

가 존재하지 않아야 한다.

---

# MEDIQ-AUD-001 Scoped Acceptance — Common Metadata-only Writer

Normative recommendation: `AUD-001-DEC-001`. This scope centralizes the existing Session, Consent, Grant, and PatientMapping-denial Audit writes behind a validated event allowlist and one parameterized PostgreSQL writer. Calls must use the same verified IAM-002 Tenant transaction/`PoolClient` as the business mutation; the writer does not manage transactions. The schema and exact 12-column `INSERT` privilege remain unchanged. This is not global Audit event-coverage acceptance and does not add a read/API route.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUD-001-WRITER-001` | Fixed event catalog and action/result pairing | Accept only approved fixed combinations from `AUD-001-DEC-001` and the explicitly authorized `AUD-002-DEC-001` extension; reject unknown actions, resource types, action/result mismatch, and unsupported reason codes before SQL | P0 domain/security | PASS — AUD-001 historical cases plus AUD-002 focused catalog cases |
| `TC-AUD-001-WRITER-002` | Event reference/time validation | Require tenant UUID, actor UUID, optional session/resource UUID, correlation UUID, and valid timestamps according to the event shape; reject malformed/null-required references and invalid dates without querying | P0 domain/security | PASS — malformed UUID/date and required-reference unit cases |
| `TC-AUD-001-WRITER-003` | Data minimization and closed payload | Reject unknown/free-form fields; SQL parameters contain only the existing metadata columns; no DICOM UID/payload, local Patient ID, credential, token, key, or raw database error is accepted or returned | P0 privacy | PASS — extra enumerable, non-enumerable and symbol fields rejected; exact parameter allowlist and fixed errors tested |
| `TC-AUD-001-WRITER-004` | Parameterized exact-schema write | Issue a parameterized `INSERT` to exactly the approved 12 columns; no interpolated event values, schema change, privilege expansion, read grant, or table-wide grant | P0 least privilege | PASS — SQL contract and live catalog confirmed exact 12-column INSERT only; total runtime column privilege inventory unchanged at 183 |
| `TC-AUD-001-WRITER-005` | Tenant RLS isolation | Under actual `mediq_runtime`, matching verified Tenant context may insert; a mismatched Audit row Tenant is rejected by forced RLS and no business/Audit mutation commits | P0 DB security | PASS — EXC-003 runtime wrong-Tenant Audit write rolled back; forced RLS and exact Audit grant verified in DB-008 scratch |
| `TC-AUD-001-WRITER-006` | Session/Consent/Grant mutation atomicity | Existing Session creation and Consent/Grant workflows preserve their event count/context; injected writer failure rolls back the paired business mutation. Mapping-denial Audit is covered by the existing mocked SQL-contract test only, not live DB atomicity | P0 integrity | PASS — Session, Consent request/approval/withdrawal, Grant issue/revocation runtime atomicity/replay regressions passed; mapping-denial scope remains mock-only |
| `TC-AUD-001-WRITER-007` | Grant issue's paired events and replay | Successful Grant issue records exactly one `AUTHORIZATION_GRANTED/ALLOW` and one `GRANT_CREATED/SUCCESS`; replay/denial paths do not create extra success rows | P0 Audit consistency | PASS — signed-OIDC/PostgreSQL Grant issue integration verified exact paired events, idempotent replay, denial and rollback |
| `TC-AUD-001-WRITER-008` | Fixed error behavior | Query error, RLS denial, or unexpected row count becomes a fixed non-disclosing persistence error; driver message and SQL values are not returned/logged by the writer | P0 security | PASS — unit error/row-count cases and runtime RLS/Audit rollback cases passed; public error is fixed |
| `TC-AUD-001-WRITER-009` | Scope exclusion regression | Confirm no Audit query API/read privilege, global authentication-failure coverage, new event family, retention/WORM guarantee, or end-to-end transfer Audit completeness is claimed | P0 scope gate | PASS — no routes, schema/grants, or global coverage were added; implementation report records remaining controls as open |

Passing these cases establishes only the scoped common-writer contract and its existing call paths. `AT-AUD-001~003`, `AT-FUNC-014~016`, `AT-SEC-018~020`, and global `STC-AUD-001~003` remain independently open unless their full event-coverage and product-flow criteria are separately exercised.

# MEDIQ-AUD-002 Scoped Acceptance — Verified-Tenant Grant Denial Events

Normative recommendation: `AUD-002-DEC-001`. This scope adds the missing business-specific `GRANT_DENIED/DENY` event beside the existing `AUTHORIZATION_DENIED/DENY` only for Grant issue/revocation denial paths that already execute inside a verified IAM-002 Tenant transaction. The pair has distinct meanings, shares fixed Tenant/Actor/Session/correlation/time/reason context, uses separate event UUIDs, and is atomic with the caller-owned operation transaction. `GRANT_DENIED` references the ExchangeSession, never a nonexistent Grant. The exact existing 12-column writer, forced RLS and INSERT privilege are retained.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUD-002-EVENT-001` | Fixed GRANT_DENIED catalog | Accept only `GRANT_DENIED/EXCHANGE_SESSION/DENY` with `GRANT_ISSUE_DENIED` or `GRANT_REVOKE_DENIED`; reject wrong resource/result/reason and arbitrary fields before SQL | P0 domain/privacy | PASS — API writer allowlist tests and full API regression |
| `TC-AUD-002-EVENT-002` | Verified Grant issue denial | Exactly one `AUTHORIZATION_DENIED` and one `GRANT_DENIED`, both `DENY`, same verified Tenant/Actor/Session/correlation/time and fixed issue reason; no Grant/Scope/success event | P0 API/DB | PASS — signed-OIDC PostgreSQL/RLS GRT-003 denial/pair-count and shared-context assertions |
| `TC-AUD-002-EVENT-003` | Verified Grant revocation denial | Exactly one paired Authorization/Grant denial with fixed revoke reason; existing Grant remains unchanged and no success event is written | P0 API/DB | PASS — PostgreSQL/RLS GRT-004 mismatch cases; active Grant unchanged and pair counts/context match |
| `TC-AUD-002-EVENT-004` | Denial/replay and safe response | Repeated/conflicting requests do not create success rows; each denied operation is represented by one pair; public response and Audit carry no detailed policy/binding failure | P0 security | PASS — GRT-003 idempotency/conflict HTTP integration and denial pair counts; fixed public error |
| `TC-AUD-002-EVENT-005` | Second event persistence failure | Failure on either member of the pair rolls back both events and any paired business mutation; fixed failure response, no partial Audit pair | P0 atomicity | PASS — injected failure at second `GRANT_DENIED` INSERT returns fixed failure and leaves no Grant/Scope/Audit pair in PostgreSQL |
| `TC-AUD-002-EVENT-006` | Tenant isolation and context | Event pair is written only under verified matching Tenant RLS context; wrong/no Tenant cannot create either row or substitute a business Tenant | P0 database security | PASS — DB-008 forced RLS/cross-/third-Tenant probes; exact Audit privilege retained |
| `TC-AUD-002-EVENT-007` | Metadata minimization | Event parameters contain only existing metadata columns and fixed reason; no patient/local ID, DICOM UID/payload, free text, credential, token or key | P0 privacy | PASS — closed metadata writer/unit checks; exact 12-column Audit INSERT and 183 total runtime privileges verified |
| `TC-AUD-002-EVENT-008` | Unavailable/future event boundary | No Tenant-less authentication failure, `ACCESS_DENIED`, Viewer/Download/PACS/Integrity/Session-completion event is fabricated; absent producers/global sink and overall `STC-AUD-001` stay explicitly open | P0 scope gate | PASS — code/document review; no global sink/future producers added and overall Audit remains open |

Passing these cases accepts only the two verified-context Grant denial call paths. It does not satisfy global `REQ-AUD-001` / `SEC-AUD-001`, `AT-AUD-001~003`, `AT-FUNC-014~016`, `AT-SEC-018~020`, or `STC-AUD-001~003`.

# 62. Provenance Acceptance

## AT-PROV-001

PACS Import 완료 시 다음 관계를 재구성할 수 있어야 한다.

```text
PatientReference
        ↓
ExchangeSession
        ↓
ImagingPackage
        ↓
StudyReference
        ↓
Hospital A
        ↓
Hospital B
        ↓
Integrity Result
```

---

# 63. State Transition Acceptance

다음 정상 State Flow를 지원해야 한다.

```text
REQUESTED
→ CONSENT_PENDING
→ CONSENTED
→ AUTHORIZED
→ READY / ACTIVE
→ COMPLETED
```

실패:

```text
FAILED
REJECTED
EXPIRED
REVOKED
CANCELLED
```

에서 보호 Action이 실행되지 않아야 한다.

---

# 64. Requirement Traceability Matrix

| Acceptance Test | Requirement              |
| --------------- | ------------------------ |
| AT-FUNC-001     | REQ-EXC-001, REQ-EXC-002 |
| AT-FUNC-003     | REQ-PAT-003, REQ-PAT-004 |
| TC-PAT-003-DOM-001~008 | REQ-PAT-003/004 (domain eligibility only) |
| TC-PAT-004-PER-001~005 | REQ-PAT-004 (mocked persistence-to-domain denial only) |
| AT-FUNC-005     | REQ-CON-001, REQ-CON-002 |
| AT-FUNC-006     | REQ-CON-003              |
| `TC-CON-006-AUTH-001~005` | `REQ-CON-006`, `REQ-GRT-004` (pure policy only) |
| AT-FUNC-008     | REQ-GRT-001, REQ-GRT-002 |
| AT-FUNC-010     | REQ-VIEW-001             |
| AT-FUNC-011     | REQ-DWN-001              |
| AT-FUNC-012     | REQ-PACS-001~005         |
| AT-FUNC-014     | REQ-INT-001              |
| AT-FUNC-015     | REQ-PROV-002             |
| AT-FUNC-016     | REQ-AUD-001              |
| TC-CON-007-AUD-001~005 | REQ-AUD-001/002 (Consent event context only) |
| AT-SEC-004      | REQ-TEN-002              |
| AT-SEC-005      | REQ-CON-003              |
| AT-SEC-010      | REQ-GRT-004              |
| AT-SEC-012      | REQ-PAT-004              |
| AT-SEC-018      | REQ-INT-001, REQ-INT-002 |
| AT-E2E-003      | P0 Core E2E              |

---

# 65. Security Traceability Matrix

| Test       | Security Requirement |
| ---------- | -------------------- |
| AT-SEC-001 | SEC-IAM-004          |
| AT-SEC-003 | SEC-API-002          |
| AT-SEC-004 | SEC-TEN-001          |
| AT-SEC-005 | SEC-CONSENT-001      |
| AT-SEC-006 | SEC-CONSENT-002      |
| AT-SEC-007 | SEC-GRANT-005        |
| AT-SEC-008 | SEC-GRANT-002        |
| AT-SEC-009 | SEC-GRANT-003        |
| AT-SEC-010 | SEC-AUTHZ-009        |
| TC-CON-007-AUD-001~005 | SEC-AUD-001/002 (Consent success events only) |
| TC-PAT-003-DOM-001~008 | SEC-IAM-007~009 (domain only) |
| TC-PAT-004-PER-001~005 | SEC-IAM-007~009 (mocked persistence only) |
| AT-SEC-012 | SEC-IAM-007          |
| AT-SEC-013 | SEC-DICOM-005        |
| AT-SEC-014 | SEC-AUTHZ-004        |
| AT-SEC-015 | SEC-AUTHZ-007        |
| AT-SEC-017 | SEC-ERR-003          |
| AT-SEC-018 | SEC-INT-002          |
| AT-SEC-019 | SEC-ERR-001          |
| AT-SEC-020 | SEC-LOG-001          |
| AT-SEC-021 | SEC-DATA-001         |
| AT-SEC-022 | SEC-TLS-001          |
| `TC-CON-006-AUTH-001~005` | `SEC-CONSENT-008`, `SEC-GRANT-005` (pure policy only) |

---

# 66. Threat Traceability Matrix

| Threat                         | Acceptance      |
| ------------------------------ | --------------- |
| THR-001 Unauthenticated Access | AT-SEC-001      |
| THR-002 BOLA                   | AT-SEC-003      |
| THR-003 Cross Tenant           | AT-SEC-004      |
| THR-004 Consent Bypass         | AT-SEC-005, 006 |
| THR-005 Scope Escalation       | AT-SEC-007, `TC-CON-006-AUTH-001~005` (pure policy only) |
| THR-006 Grant Scope Abuse      | AT-SEC-010, 011; `TC-GRT-005-AUTH-001~008` (pure policy; no route/side-effect claim) |
| THR-007 Expired Grant          | AT-SEC-008; `TC-GRT-007-EXP-001~008` (pure policy/issuance TTL; protected-operation denial remains separate) |
| THR-008 Wrong Recipient        | AT-SEC-009      |
| THR-009 Viewer URL Bypass      | AT-SEC-015      |
| THR-011 Unauthorized QIDO      | AT-SEC-016      |
| THR-017 Wrong Destination      | AT-SEC-013      |
| THR-018 Invalid Mapping        | AT-SEC-012      |
| THR-019 Unauthorized STOW      | AT-SEC-011      |
| THR-021 Integrity Ignored      | AT-SEC-018      |
| THR-023 Direct Storage Access  | AT-SEC-021      |
| THR-028 Tenant Spoofing        | AT-SEC-026      |
| THR-030 Security Check Failure | AT-SEC-017      |
| THR-034 Sensitive Log          | AT-SEC-020      |

---

# 67. API Coverage Matrix

| API                              | Acceptance                  |
| -------------------------------- | --------------------------- |
| POST `/exchange-sessions`        | AT-FUNC-001                 |
| GET `/exchange-sessions/{id}`    | AT-FUNC-002, AT-SEC-003     |
| POST `/patient-mapping/validate` (planned only; no route registered) | AT-FUNC-003 / `AT-SEC-012` (PACS integration pending) |
| GET `/studies`                   | AT-FUNC-004, AT-SEC-016     |
| POST `/consents/request`         | AT-FUNC-005                 |
| POST `/consents/{id}/approve`    | AT-FUNC-006                 |
| POST `/consents/{id}/withdraw`   | AT-FUNC-007                 |
| POST `/grants/issue`             | AT-FUNC-008, AT-SEC-005~009 |
| POST `/grants/{id}/revoke`       | AT-FUNC-009                 |
| POST `/actions/view`             | AT-FUNC-010                 |
| POST `/actions/download`         | AT-FUNC-011, AT-SEC-010     |
| POST `/actions/pacs-import`      | AT-FUNC-012, AT-SEC-011~013 |
| GET `/provenance`                | AT-FUNC-015                 |
| GET `/audit-events`              | AT-FUNC-016                 |

---

# 68. P0 Mandatory Gate

다음 Test는 모두 `PASS`해야 한다.

```text
GATE-AT-01
Exchange Creation
AT-FUNC-001

GATE-AT-02
Patient Mapping
AT-FUNC-003

GATE-AT-03
Consent Workflow
AT-FUNC-005
AT-FUNC-006

GATE-AT-04
Grant
AT-FUNC-008

GATE-AT-05
Viewer
AT-FUNC-010

GATE-AT-06
Download
AT-FUNC-011

GATE-AT-07
PACS Import
AT-FUNC-012
AT-FUNC-013

GATE-AT-08
Integrity
AT-FUNC-014

GATE-AT-09
Tenant Isolation
AT-SEC-004

GATE-AT-10
Consent Enforcement
AT-SEC-005
AT-SEC-006

GATE-AT-11
Scope Enforcement
AT-SEC-010
AT-SEC-011

GATE-AT-12
Patient Mapping Security
AT-SEC-012

GATE-AT-13
Destination Binding
AT-SEC-013

GATE-AT-14
Fail Closed
AT-SEC-017

GATE-AT-15
Integrity Failure
AT-SEC-018

GATE-AT-16
Golden Viewer
AT-E2E-001

GATE-AT-17
Golden Download
AT-E2E-002

GATE-AT-18
Golden PACS Transfer
AT-E2E-003
```

---

# 69. Critical Fail Conditions

다음 중 하나라도 발생하면:

```text
CAPSTONE P0 SECURITY ACCEPTANCE
→ FAIL
```

한다.

### Critical Failure 1

```text
No Consent
→ Access ALLOW
```

### Critical Failure 2

```text
Wrong Tenant
→ Resource ALLOW
```

### Critical Failure 3

```text
View-only Grant
→ Download/PACS Import ALLOW
```

### Critical Failure 4

```text
Invalid Patient Mapping
→ PACS Import executes
```

### Critical Failure 5

```text
Wrong Destination
→ STOW executes
```

### Critical Failure 6

```text
Integrity FAILED
→ Transfer COMPLETED
```

### Critical Failure 7

```text
Unknown Authorization
→ ALLOW
```

---

# 70. Capstone MVP Definition of Done

MediQ P0는 다음 조건을 모두 충족해야 한다.

```text
Hospital A Test Orthanc
PASS

Hospital B Test Orthanc
PASS

Synthetic DICOM
PASS

PatientReference
PASS

PatientMapping
PASS

ExchangeSession
PASS

Consent Workflow
PASS

Authorization
PASS

TransferGrant
PASS

Viewer
PASS

Download
PASS

STOW-RS PACS Import
PASS

Tenant Isolation
PASS

Integrity
PASS

Provenance
PASS

Audit
PASS

Negative Security Tests
PASS

Golden E2E
PASS
```

---

# 71. Readiness Decision Model

테스트 결과는 다음과 같이 판정한다.

## PASS

모든 P0 Mandatory Gate 통과.

## PARTIAL

핵심 E2E는 동작하지만 일부 비핵심 P0 Acceptance가 미완료.

## BLOCKED

환경·인프라 문제로 핵심 Acceptance 실행 자체가 불가능.

## FAIL

실행했지만 Requirement를 만족하지 못함.

---

# 72. Technical vs Production Readiness

Acceptance Result는 반드시 분리해서 보고한다.

```text
CAPSTONE TECHNICAL READINESS

Functional:
PASS / PARTIAL / BLOCKED / FAIL

Security:
PASS / PARTIAL / BLOCKED / FAIL

E2E:
PASS / PARTIAL / BLOCKED / FAIL

CAPSTONE MVP READY:
YES / NO
```

별도로:

```text
PRODUCTION READINESS

Real Patient Data:
NOT APPROVED

Real Patient Identity:
NOT VALIDATED

Legal Review:
FUTURE

Privacy Compliance:
FUTURE

Clinical Deployment:
NOT READY

Production Hospital Integration:
FUTURE

PRODUCTION READY:
NO / NOT ASSESSED
```

---

# 73. Acceptance Baseline Decision

```text
PROJECT:
MediQ

ACCEPTANCE TEST VERSION:
v1.1 Viewer Architecture Amendment

FUNCTIONAL ACCEPTANCE:
DEFINED

SECURITY NEGATIVE ACCEPTANCE:
DEFINED

E2E GOLDEN PATH:
DEFINED

VIEWER GOLDEN PATH:
DEFINED

DOWNLOAD GOLDEN PATH:
DEFINED

PACS IMPORT GOLDEN PATH:
DEFINED

TENANT ISOLATION:
DEFINED

CONSENT ENFORCEMENT:
DEFINED

GRANT SCOPE ENFORCEMENT:
DEFINED

PATIENT MAPPING SECURITY:
DEFINED

DESTINATION BINDING:
DEFINED

INTEGRITY:
DEFINED

PROVENANCE:
DEFINED

AUDIT:
DEFINED

FAIL CLOSED:
DEFINED

P1 MOBILE:
NOT REQUIRED FOR P0

PRODUCTION VALIDATION:
SEPARATED

ACCEPTANCE BASELINE READY:
YES
```

---

# 74. Next Phase

`ACCEPTANCE-TESTS.md` 이후에는 더 이상 상위 설계문서를 크게 추가하기보다 실제 구현계획으로 내려간다.

다음 공식 산출물:

```text
IMPLEMENTATION-PLAN.md
```

권장 구현 순서:

```text
Phase 0
Repository / Docker / Orthanc / PostgreSQL

        ↓

Phase 1
Tenant / Hospital / PatientReference / Mapping

        ↓

Phase 2
ExchangeSession

        ↓

Phase 3
Consent

        ↓

Phase 4
Authorization / TransferGrant

        ↓

Phase 5
QIDO / WADO / ImagingPackage

        ↓

Phase 6
Viewer

        ↓

Phase 7
Download

        ↓

Phase 8
STOW-RS PACS Import

        ↓

Phase 9
Integrity / Provenance / Audit

        ↓

Phase 10
Security Negative Tests

        ↓

Phase 11
E2E Golden Path

        ↓

CAPSTONE MVP RELEASE
```

---

# FINAL ACCEPTANCE POLICY

> **MediQ P0의 성공은 기능이 단순히 실행되는 것으로 판단하지 않는다. 정상 요청은 PASS하고, 비정상 요청은 반드시 DENY하며, 그 결과를 Audit·Provenance·Integrity Evidence로 확인할 수 있어야 한다.**

> **특히 `No Consent`, `Wrong Tenant`, `Wrong Scope`, `Invalid Patient Mapping`, `Wrong Destination`, `Integrity Failure`, `Unknown Authorization` 중 하나라도 실제 접근 또는 전송으로 이어지면 P0 Security Acceptance는 FAIL이다.**

> **최종 P0 Golden Path는 `Hospital A Test Orthanc → MediQ → Consent/Grant → STOW-RS → Hospital B Test Orthanc → Destination Verification → Integrity VERIFIED → Provenance → Audit` 전체가 재현 가능하게 PASS하는 것이다.**

---

# Viewer and Storage Acceptance Amendment — 2026-09-15

아래 항목은 계획된 테스트다. 실제 자동화와 실행 증거가 없으므로 현재 상태는 모두 `PLANNED / NOT RUN`이다.

| Test ID | Scenario | Expected | Scope | Current |
|---|---|---|---|---|
| TC-VIEW-004 | Hospital User + valid Tenant/Consent/`study:view` | Cloud Viewer Session PASS | P0 | NOT RUN |
| TC-VIEW-005 | Synthetic Patient + matching PatientReference + valid Grant | Cloud Viewer Session PASS | P0 | NOT RUN |
| TC-VIEW-006 | Viewer requests Series/Instance/Frame | Source PACS WADO-RS on-demand delivery PASS | P0 | NOT RUN |
| TC-VIEW-007 | Expired/revoked Viewer Session reused | DENY + Audit | P0 | NOT RUN |
| TC-VIEW-008 | Direct DICOM UID, raw PACS URL 또는 leaked Viewer URL | DENY; no credential/endpoint leakage | P0 | NOT RUN |
| TC-VIEW-009 | Source PACS unavailable | Fail Closed + explicit error + Audit | P0 | NOT RUN |
| TC-SEC-VIEW-001 | Cross-Tenant Hospital/Patient Viewer request | DENY | P0 | NOT RUN |
| TC-SEC-VIEW-002 | Consent revoked during active Viewer Session | subsequent retrieval DENY | P0 | NOT RUN |
| TC-SEC-VIEW-003 | Unallowlisted/forged source endpoint | no upstream call + DENY | P0 | NOT RUN |
| TC-DATA-004 | Browser/proxy response and cloud storage inspection | no permanent copy/no sensitive intermediary cache | P0 | NOT RUN |
| TC-DATA-005 | Temporary object TTL/session expiry | purge + purge Audit PASS | P0 | NOT RUN |
| TC-SCOPE-004 | VIEW-only Grant attempts Download/PACS Import/Mobile Export | all non-VIEW actions DENY | P0 | NOT RUN |
| TC-MOB-007 | Authorized Patient opens exported Vault image | Mobile Viewer PASS | P1 | NOT RUN |
| TC-MOB-008 | Lost/unbound device or failed local auth | Vault decryption DENY | P1 | NOT RUN |
| TC-MOB-009 | Expired/revoked/offline capsule policy | 30-day boundary enforcement result + Audit | P1 | NOT RUN |

## P0 Viewer Golden Path

```text
Hospital A Test Orthanc
→ MediQ Authentication / Patient Mapping / Consent / Authorization
→ Short-Lived study:view Grant
→ ViewerSession
→ WADO-RS Series/Instance/Frame Retrieval
→ Progressive Cloud Viewer Delivery
→ No Permanent Cloud Copy
→ Audit / Provenance
```

P0 E2E 완료에는 기존 PACS Import Golden Path와 함께 Hospital Viewer 및 Synthetic Patient Cloud Viewer의 PASS/DENY 증거가 필요하다. P1 Mobile 테스트 실패 또는 미완료는 P0 완료를 무효화하지 않는다.

**공통 기준:** Hospital PACS가 Source of Record이고 MediQ Cloud는 Permanent PACS/장기 Archive가 아니다. P0 Viewer는 Source PACS On-Demand DICOMweb Retrieval을 증명해야 한다.

---

# P1 Mobile Security Policy Acceptance Amendment — 2026-09-15

아래 항목은 계획된 P1 시험이다. 구현과 실행 증거가 없으므로 모두 `PLANNED / NOT RUN`이다.

| Test ID | Scenario | Expected | Scope | Current |
|---|---|---|---|---|
| TC-MOB-010 | Android Native Vault와 iOS MVP 경로 확인 | Android Native Vault가 우선되고 iOS는 Cloud Viewer 경로를 사용; 공유 Capsule/Protocol은 플랫폼 독립적 | P1 | NOT RUN |
| TC-MOB-011-A | Verified `STRONGBOX` Device 등록 | Persistent Vault ALLOW, 실제 Security Level 기록 | P1 | NOT RUN |
| TC-MOB-011-B | Verified `TRUSTED_ENVIRONMENT` Device 등록 | Persistent Vault ALLOW, 실제 Security Level 기록 | P1 | NOT RUN |
| TC-MOB-011-C | `SOFTWARE`, `UNKNOWN`, Attestation 실패 또는 속성 불일치 | Mobile Export/Persistent Vault DENY, Cloud Viewer 안내, Silent Downgrade 없음 | P1 | NOT RUN |
| TC-MOB-012-A | 대형 DICOM Capsule 저장·점진 조회 | AES-256-GCM 인증 검증과 Instance/Chunk 점진 복호화 PASS; 평문 파일 없음 | P1 | NOT RUN |
| TC-MOB-012-B | Capsule 또는 Ciphertext 변조 | 인증 실패, Viewer DENY, 오류/Audit | P1 | NOT RUN |
| TC-MOB-012-C | 동일 Device용 복수 승인 Wrap Slot을 Capsule 발급 시 함께 생성 | Payload는 한 번만 암호화되고 각 승인 Slot에서 동일 DEK 복원 PASS; 새 Device/Cross-device Slot은 없음 | P1 | NOT RUN |
| TC-MOB-013-A | 발급/온라인 검증 후 30일 이내 Offline Open | Device Authentication 후 PASS | P1 | NOT RUN |
| TC-MOB-013-B | 30일 만료 상태에서 Offline Open | 복호화 DENY | P1 | NOT RUN |
| TC-MOB-013-C | Online Lease 갱신 시 Consent/Grant/Device Revoke | 무효 상태면 갱신 DENY + Audit | P1 | NOT RUN |
| TC-MOB-014-A | Viewer 표시 중 Background 전환 | 즉시 Privacy Screen, Render 중단, Pixel Buffer 제거 | P1 | NOT RUN |
| TC-MOB-014-B | 잠금 없는 동일 기기에서 60초 이내 복귀 | 민감 화면은 Background 동안 비노출; 정책상 재인증 생략 가능 | P1 | NOT RUN |
| TC-MOB-014-C | 60초 초과, OS 잠금 또는 상태 변경 후 복귀 | 재인증 전 Viewer DENY | P1 | NOT RUN |
| TC-MOB-015-A | Android Screenshot/Recording/비보안 Display 시도 | Secure Window 정책 적용, 지원 범위에서 영상 비노출 | P1 | NOT RUN |
| TC-MOB-015-B | iOS 후속 구현의 Recording/Mirroring/App Switcher | Viewer 가림/중단; Screenshot 한계와 잔여 위험 문서화 | P1 | NOT RUN |
| TC-MOB-016-A | 분실 Device Revoke 후 Online Refresh | Lease 갱신 DENY, Key/Session 제거 시도, Audit | P1 | NOT RUN |
| TC-MOB-016-B | 새 Device + 기존 유효 Consent/Grant | Source PACS 재조회 후 새 Device-bound Capsule 재발급 PASS | P1 | NOT RUN |
| TC-MOB-016-C | 새 Device + 만료/철회 Consent 또는 Grant | 자동 재발급 DENY, 새 승인 요구 | P1 | NOT RUN |
| TC-MOB-017 | Logout/Revoke/Secure Delete 후 Local Key 제거 | 기존 Capsule 복호화 DENY + lifecycle Audit | P1 | NOT RUN |
| TC-MOB-018-A | Backend Writer와 Android Reader가 v1 Golden Capsule 상호운용 | Header/Deterministic CBOR/Nonce/AAD/Tag/COSE/HPKE 결과 byte-for-byte 일치 | P1 | NOT RUN |
| TC-MOB-018-B | Missing/Duplicate/Reordered/Replaced/Truncated/Mixed/Extra Record 변조 Corpus | 모두 DENY; 정상 Viewer 노출 없음; Integrity/Security Event | P1 | NOT RUN |
| TC-MOB-018-C | Range Download 중단 후 동일 ETag 재개, 이후 ETag 변경 | 동일 ETag는 검증 Record 재사용; 변경 시 Staging 전체 Reset, 혼합 없음 | P1 | NOT RUN |
| TC-MOB-018-D | DOWNLOADING/VERIFYING/READY_TO_COMMIT에서 Process Kill·Storage Full·Rename 실패 | Partial Capsule 비노출; Recovery 후 COMMITTED 또는 안전 제거 | P1 | NOT RUN |
| TC-MOB-018-E | StrongBox/TEE P-256 HPKE Device Wrap 상호운용과 Wrong Device | 승인 Device는 동일 DEK 복원; Wrong Device는 DENY; Software fallback 없음 | P1 | NOT RUN |
| TC-MOB-018-F | Unknown Major/Critical Flag/Suite/Wrap Profile 및 미승인 PQC Slot | Allowlist 정책에 따라 Fail Closed; 지원 Slot 병행 시 지원 Slot만 선택 | P1 | NOT RUN |
| TC-MOB-019-A | Authorization Code + PKCE S256 Mobile Login Contract | Implicit/Password Grant 없음; 사용자 Token 발급·검증 계약 일치 | P1 | NOT RUN |
| TC-MOB-019-B | 등록 후 민감 API에 Bearer만 사용하거나 DPoP `jti/htm/htu/ath/cnf.jkt` 변조 | 모두 DENY; Replay Cache/Audit 확인 | P1 | NOT RUN |
| TC-MOB-019-C | Attestation Challenge 재사용·만료·Purpose/Key 치환 | Device Registration/Reassessment DENY | P1 | NOT RUN |
| TC-MOB-019-D | 다른 Patient/Tenant/Device의 Operation·Capsule·Lease ID 접근 | 404 또는 정책상 안전한 DENY; 존재 정보 비노출 | P1 | NOT RUN |
| TC-MOB-019-E | Capsule-scoped Download Token을 다른 Capsule에 사용하거나 ETag 변경 중 Resume | DENY 또는 전체 Reset; 서로 다른 Record 혼합 없음 | P1 | NOT RUN |
| TC-MOB-019-F | Offline Lease Proof 변조·Version Rollback·30일 초과 | Local/API 모두 DENY | P1 | NOT RUN |
| TC-MOB-019-G | Device Revoke/Server Capsule Delete 응답 검증 | 신규 Export/Session/Renewal 차단; Offline 삭제 상태는 확인 전 UNKNOWN | P1 | NOT RUN |
| TC-MOB-019-H | Mobile Audit Duplicate/Offline Sync/Forged Device Reference/Sequence Gap | Dedup, Client-reported 표시, 위조 거부, Gap Detection | P1 | NOT RUN |

모든 Mobile 시험은 Synthetic/Test/De-identified DICOM과 Test Identity만 사용한다. 위 시험 미실행은 P1 정책의 구현 또는 보안 PASS를 의미하지 않는다.

---

# Synthetic Health Data Preview Acceptance — 2026-09-26

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-HHP-001` | 소개·선택·동의·목록·상세·오류·초기화 화면 | 모든 화면에 DEMO MODE와 실제 연계 미완료 표시 | P1 | NOT RUN |
| `TC-HHP-002` | 정상 Preview | 승인된 Synthetic Fixture 목록·상세 표시 | P1 | NOT RUN |
| `TC-HHP-003` | `sourceMode`/`providerMode` 누락·변조 | Fail Closed, Record 미표시, DEMO security event | P1 | NOT RUN |
| `TC-HHP-004` | 실제 형태 Patient ID 또는 PHI 문자열 Fixture | Fixture 거부 | P1 | NOT RUN |
| `TC-HHP-005` | 전체 Preview Network Capture | 실제 건강정보 기관으로 Outbound Call 없음 | P1 | NOT RUN |
| `TC-HHP-006` | Mock Consent 완료·철회 | 실제 Consent/Authorization/Grant 변화 없음 | P1 | NOT RUN |
| `TC-HHP-007` | Preview Reset | Session·Cache 제거 및 Reset Audit | P1 | NOT RUN |
| `TC-HHP-008` | 공유·PACS Import·의료진 전달 시도 | Action 미제공 또는 명시적 DENY | P1 | NOT RUN |
| `TC-HHP-009` | Screenshot·발표 Viewport | DEMO Banner가 가려지거나 잘리지 않음 | P1 | NOT RUN |
| `TC-HHP-010` | Preview Disabled/Failure 상태에서 P0 E2E | P0가 독립 실행되고 결과가 변하지 않음 | P1/P0 Regression | NOT RUN |
| `TC-HHP-011` | 건강검진·일반혈액·항체 Fixture 목록 | 세 유형 구분과 Card별 SYNTHETIC 표시 | P1 | NOT RUN |
| `TC-HHP-012` | 항체검사 상세 | 값·단위·출처 참고범위·합성 원문 판정·비진단 고지 | P1 | NOT RUN |
| `TC-HHP-013` | 단위·참고범위 누락 Fixture | 추정 없이 `제공되지 않음` 표시 | P1 | NOT RUN |
| `TC-HHP-014` | 합성 영상·검사 관련 보기 | 명시 Link만 표시, 진단·인과 문구 없음 | P1 | NOT RUN |
| `TC-HHP-015` | 검사 공유·PACS Import·실제 기관 Route | Action 부재 또는 DENY, 외부 호출 없음 | P1 | NOT RUN |

위 Test가 실행되기 전 Preview 기능은 `DONE` 또는 실제 연계 `PASS`로 표시할 수 없다. 실제 지정심사·테스트베드·API 시험은 Productionization Acceptance에 속한다.

# Patient Experience Feature Pack Acceptance — 2026-09-26

| 기능 | Test Range | 분류 | 현재 상태 |
|---|---|---|---|---|
| 행동센터 | `TC-PXE-AC-001~006` | P1 | NOT RUN |
| 접근이력·영수증 | `TC-PXE-AR-001~006` | P1 | NOT RUN |
| 개인정보 최소 알림 | `TC-PXE-NT-001~006` | P1 | NOT RUN |
| 병원 방문 모드 | `TC-PXE-VM-001~007` | P1 | NOT RUN |
| 쉬운 영상 카드 | `TC-PXE-IC-001~006` | P1 | NOT RUN |
| 저장공간·만료 | `TC-PXE-SE-001~007` | P1 | NOT RUN |
| 오류 복구 | `TC-PXE-ER-001~007` | P1 | NOT RUN |
| 판독문·의뢰서 | `TC-PXE-RR-001~007` | POST-MVP | NOT RUN |
| 보호자·가족 위임 | `TC-PXE-GD-001~007` | POST-MVP | NOT RUN |

59개 상세 시나리오의 Given/When/Then 기대결과는 각 Feature Spec에 정의되어 있다. 구현 Ticket은 이를 자동·수동 시험 Case로 구체화하고 성공·실패·거부·오프라인·접근성 결과를 실제 명령과 함께 기록해야 한다. 현재 문서 정적 검증 외 기능 시험은 실행되지 않았다.

# Hospital Clinical Workflow P1 Acceptance — 2026-09-27

| 기능 | Test Range | 분류 | 현재 상태 |
|---|---|---|---|
| 관련 과거 영상 | `TC-HCW-PR-001~007` | P1 | NOT RUN |
| 진료 인계 패킷 | `TC-HCW-HP-001~008` | P1 | NOT RUN |
| 팀 배정·인계 | `TC-HCW-AS-001~008` | P1 | NOT RUN |
| 병원 알림함 | `TC-HCW-NT-001~007` | P1 | NOT RUN |
| 감사·출처 타임라인 | `TC-HCW-AT-001~007` | P1 | NOT RUN |

상세 Given/When/Then과 Expected Result는 `hospital-workflow/HOSPITAL-CLINICAL-WORKFLOW-TRACEABILITY.md`를 따른다. 필수 Negative Path는 다음을 포함한다.

- Cross-tenant, wrong Hospital, wrong Patient와 unauthorized Study
- Comparison Session 허용 집합 밖 UID
- Assignment를 이용한 권한 상승
- 영상 Grant를 이용한 판독문·의뢰서 접근
- 철회·만료 후 Notification Deep Link
- 중복·역순 Event와 Lost Update
- `RESULT_UNKNOWN`의 완료 오표시
- Role을 넘는 Audit Detail과 Export
- P1 장애 시 P0 Golden Path/Security Regression

모든 Test는 Synthetic/Test/De-identified DICOM과 Test Identity만 사용한다. 구현과 실제 실행 증거가 없으므로 PASS를 선언하지 않는다.

# PostgreSQL Role Isolation Acceptance — 2026-09-29

이 묶음은 `MEDIQ-ENV-008` 로컬 개발환경의 계정·연결 설정만 검증하며 제품 DB/API Acceptance를 대체하지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-ENV-008-DB-001` | App config allowlist에 bootstrap/migration credential 주입 시도 | 검증 실패; runtime loader는 전용 runtime URL만 수신 | P0 environment | Executed — see ENV-008 evidence |
| `TC-ENV-008-DB-002` | Runtime role attributes와 role membership 조회 | Non-superuser, no createdb/createrole/bypassrls, inherited membership 0 | P0 environment | Executed — see ENV-008 evidence |
| `TC-ENV-008-DB-003` | Runtime의 `public` schema CREATE 시도 | Permission denied; 예상 밖 DDL이 생성되지 않음 | P0 environment | Executed — see ENV-008 evidence |
| `TC-ENV-008-DB-004` | Migration role로 DDL을 transaction 내 실행 후 rollback | 허용된 schema DDL 가능; 시험 객체는 남지 않음; role은 bootstrap/runtime과 분리 | P0 environment | Executed — see ENV-008 evidence |
| `TC-ENV-008-DB-005` | 정상 runtime 로그인·틀린 비밀번호·URL credential 불일치·placeholder·미지원 profile 검증 | 정상 인증 성공, 나머지 거부; secret 값은 출력하지 않음 | P0 environment | Executed — see ENV-008 evidence |

이 ENV-008 결과는 현재 빈 개발 schema의 initial privilege boundary만 의미한다. Migration framework는 DB-001에서 별도로 검증했으며 실제 product schema/table grant, Tenant RLS, API/Worker connection과 SQL injection 시험은 후속 제품 Ticket에서 수행한다.

# P0 Migration Framework Acceptance — 2026-09-30

`MEDIQ-DB-001`은 제품 도메인 테이블을 만들지 않고, Drizzle Kit 생성 SQL을 안전하게 적용할 framework만 검증한다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-001-MIG-001` | Runtime profile, environment, DB role/host/name, URL 옵션이 승인 범위와 다른 설정 | 연결 전에 generic config error로 fail closed; credential 값은 출력하지 않음 | P0 migration | Executed — 6 invalid-config cases pass; DB-001 evidence |
| `TC-DB-001-MIG-002` | Journal version/dialect/order/tag/timestamp/file, applied-ledger hash/prefix 검증 및 statement breakpoint split | 잘못된 journal·누락 파일·hash 불일치·빈 journal은 거부하고 정상 SQL 분할 | P0 migration | Executed — unit tests pass; DB-001 evidence |
| `TC-DB-001-MIG-003` | Migration role의 superuser/CREATEDB/CREATEROLE/BYPASSRLS/schema/database privileges 검사 | 승인 role은 schema `USAGE/CREATE`만 보유하고 database-level `CREATE` 및 elevated role flags는 없음 | P0 migration | Executed — one-shot runner role-boundary check pass; DB-001 evidence |
| `TC-DB-001-MIG-004` | 생성 migration을 적용하고 runner를 재실행 | migration별 transaction·advisory lock 사용; ledger에는 같은 migration row 한 건만 남음 | P0 migration | Executed — apply plus two repeat runs pass; DB-001 evidence |
| `TC-DB-001-MIG-005` | Runtime role로 migration ledger 조회 | Runtime `SELECT 1`은 허용되고 ledger 조회는 거부됨 | P0 migration | Executed — DB-001 integration smoke |
| `TC-DB-001-MIG-006` | framework baseline 직후 public business table inventory 검사 | 제품 테이블 0개; DB-001은 승인된 17개 domain table을 앞당겨 만들지 않음 | P0 migration | Executed — DB-001 integration smoke |
| `TC-DB-001-MIG-007` | Migration statement 오류를 포함한 가짜 migration의 적용 제어 | 해당 migration transaction rollback; ledger insert와 commit 없음 | P0 migration | Executed — unit rollback-path test; DB-001 evidence |

이 Gate는 Migration framework와 권한 분리만 검증한다. 승인된 17개 schema, FK/UNIQUE/CHECK/index, Tenant/Membership·Patient Mapping, 업무 API와 P0 exchange flow는 DB-002~008 및 후속 Ticket에서 별도 검증한다.

# P0 Organization/Tenant/Hospital Registry Acceptance — 2026-09-30

`MEDIQ-DB-002`는 `DATA-MODEL.md`와 `ERD.md`에서 승인한 첫 5개 Registry table만 구현한다. Tenant/Actor row는 인증·인가 권한을 자체로 부여하지 않으며 이 Gate는 제품 API/E2E를 의미하지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-002-REG-001` | Migration apply/re-run 및 public table inventory | 5개 Registry table만 추가되고 다른 12개 product table은 미생성; history는 중복 없이 유지 | P0 schema | Executed — DB-002 evidence |
| `TC-DB-002-REG-002` | Declared PK, NOT NULL, UUID/text/timestamp/boolean columns | Data Model과 column metadata가 일치 | P0 schema | Executed — exact 39-column shape and five PKs, DB-002 evidence |
| `TC-DB-002-REG-003` | Organization→Tenant→Hospital/Actor/Endpoint 및 composite owner-pair FK와 delete attempt | 잘못된 parent/owner pair 거부; parent delete는 RESTRICT | P0 schema/security | PASS — DB-008 evidence: six simple/two composite FKs; wrong owner pairs rejected; RESTRICT retained |
| `TC-DB-002-REG-004` | Registry natural unique keys and composite FK reference keys | Natural key duplicates rejected; `tenants(tenant_id, organization_id)` 및 `hospitals(tenant_id, hospital_id)` reference keys exist | P0 schema | PASS — DB-008 evidence: seven unique constraints inventoried; five natural-key duplicate probes rejected |
| `TC-DB-002-REG-005` | Registry finite values and extensible organization type | Organization/Tenant/Hospital/Actor status and existing environment/endpoint/actor-type CHECKs reject invalid values; `organization_type` accepts extensible codes | P0 schema | PASS — DB-008 evidence: approved statuses accepted, invalid Hospital/Actor statuses rejected, custom organization type accepted |
| `TC-DB-002-REG-006` | Declared secondary index inventory | Data Model의 FK/status/type indexes가 존재 | P0 schema | Executed — 11 indexes found |
| `TC-DB-002-REG-007` | Registry column allowlist와 endpoint metadata | 승인된 column 외 credential/password/secret column 없음; URL은 저장 메타데이터이며 이번 Ticket에서 호출하지 않음 | P0 security | Executed — exact column allowlist; endpoint URLs not invoked |
| `TC-DB-002-REG-008` | Synthetic organization/tenant/hospital/endpoints/actors fixture 및 거부 경로 | 정상 관계 수용, 잘못된 FK/unique/check 거부, 전체 transaction rollback 후 persistent row 0 | P0 integration | Executed — all fixture rows rolled back; DB-002 evidence |

`DB-008-DEC-001` 정책 승인에 따라 Hospital/Actor status는 `ACTIVE`, `SUSPENDED`, `INACTIVE`로 제한하고, `organization_type`은 DB CHECK 없이 확장 코드로 유지한다. Hospital Tenant/Organization 및 Actor Tenant/Hospital owner-pair는 composite FK로 강제한다. 이 구조 제약은 Domain authorization, runtime Tenant isolation 또는 RLS를 대체하지 않는다.

# P0 Organization/Tenant Seed Acceptance — MEDIQ-ORG-001

`MEDIQ-ORG-001`은 승인된 테스트 컨텍스트를 위한 Organization/Tenant fixture만 준비한다. Hospital, Endpoint, Actor, Patient row 생성과 인증·인가·RLS 구현은 후속 Ticket 범위다. 모든 seed 값은 synthetic이며 기존 데이터를 덮어쓰지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-ORG-001-SEED-001` | Seed A/B/C Organization과 각각의 Tenant 관계 | `ORG-HOSPITAL-A/B/C` 및 `TEST-TENANT-A/B/C` 각 1건; Tenant의 `organization_id`가 대응 Organization을 가리킴; 세 Tenant ID는 서로 다름 | P0 synthetic fixture | PASS — seed transaction exact-verified 3 Organization/3 Tenant owner pairs |
| `TC-ORG-001-SEED-002` | 같은 seed를 2회 실행 | 1회차에 누락 행을 삽입하고, 2회차는 `ON CONFLICT DO NOTHING` + exact verification으로 상태 변경 없이 성공 | P0 reproducibility | PASS — first insert and repeat/no-op run succeeded; exact state revalidated |
| `TC-ORG-001-SEED-003` | Existing seed baseline metadata or expected Tenant owner-pair differs from the approved fixture | Seed transaction fails closed and rolls back; existing records are never updated/deleted | P0 data integrity | PASS — Organization metadata and Tenant owner-pair conflict probes denied; subsequent exact seed verification passed |
| `TC-ORG-001-SEED-004` | Seed 데이터 경계 | `HOSPITAL` type, `ACTIVE` status, `TEST`/`Synthetic` 표식만 사용; endpoint URL, credential, Actor, Patient, DICOM 또는 PHI는 삽입하지 않음 | P0 security/privacy | PASS — only 3 Organization and 3 Tenant rows; no endpoint, Actor, Patient or DICOM writes |

Seed policy `ORG-001-DEC-001`은 [Policy Decision Log](POLICY-DECISION-LOG.md#org-001-dec-001--synthetic-organizationtenant-기준-fixture와-seed-동작)에 기록한다. 이 Acceptance는 인증/인가, tenant isolation enforcement 또는 product readiness를 주장하지 않는다.

# P0 Hospital Registry Seed Acceptance — MEDIQ-ORG-002

`MEDIQ-ORG-002`는 ORG-001이 준비한 각 Organization/Tenant에 대응하는 합성 Hospital registry row만 등록한다. A/B는 향후 source/destination fixture이고 C는 별도 third-party negative-test registry fixture다. 모든 값은 synthetic/Test이며 Hospital `ACTIVE` 상태 자체는 endpoint, 사용자, 접근권한 또는 영상교환 기능을 만들지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-ORG-002-SEED-001` | Hospital A/B/C를 기존 Organization/Tenant에 등록 | `TEST-HOSPITAL-A/B/C` 3건이 고정 ID/code, 이름, `TEST`/`ACTIVE` 및 대응 `tenant_id`·`organization_id` owner pair로 exact-verify됨 | P0 synthetic fixture | PASS — seed transaction checked all 3 exact rows and parent pairs |
| `TC-ORG-002-SEED-002` | 같은 Hospital seed를 반복 실행 | 1회차는 누락 행만 삽입; 재실행은 `ON CONFLICT DO NOTHING` 후 상태를 변경하지 않고 성공 | P0 reproducibility | PASS — first and repeat invocations succeeded |
| `TC-ORG-002-SEED-003` | 기존 Hospital metadata 또는 기대 owner pair가 기준 fixture와 불일치 | seed는 fail-closed하고 전체 transaction rollback; 기존 canonical fixture는 유지 | P0 data integrity | PASS — metadata/owner-pair probes rejected; post-probe canonical seed passed |
| `TC-ORG-002-SEED-004` | Ticket의 쓰기·연동 경계 | 정적 검사는 SQL insert target이 `hospitals`뿐이고 UPDATE/DELETE 및 외부 HTTP 호출이 없음을 확인; Endpoint/Actor/Patient/DICOM/Auth는 변경하지 않음 | P0 security/privacy/scope | PASS — scope scan passed; no unrelated insert or external service call |

Seed policy `ORG-002-DEC-001`은 [Policy Decision Log](POLICY-DECISION-LOG.md#org-002-dec-001--synthetic-hospital-registry-fixture와-seed-동작)에 기록한다. 이 Acceptance는 runtime Authorization, Tenant Isolation, RLS, Endpoint readiness 또는 제품 transfer를 주장하지 않는다.

# P0 DICOMweb Endpoint Registry Seed Acceptance — MEDIQ-ORG-003

`MEDIQ-ORG-003`은 이미 준비된 Test Hospital A/B에 필요한 DICOMweb endpoint metadata만 등록한다. 역할은 A=QIDO/WADO source, B=QIDO verify/STOW destination이며 C에는 endpoint를 만들지 않는다. 현재 environment probe가 확인한 QIDO만 enabled로 두고, payload 상호운용 시험이 없는 A WADO 및 B STOW는 disabled 상태로 둔다. Endpoint row/`enabled`는 접근권한·실제 capability·제품 readiness를 보장하지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-ORG-003-SEED-001` | 역할별 endpoint registry와 활성화 기준 | A QIDO/WADO, B QIDO/STOW 총 4건; A/B QIDO enabled, A WADO/B STOW disabled; C에는 0건; URL은 각 승인 Compose host의 `/dicom-web` | P0 synthetic configuration | PASS — all four IDs, URLs, type, enable states and C absence exact-verified |
| `TC-ORG-003-SEED-002` | 같은 endpoint seed 반복 실행 | `ON CONFLICT DO NOTHING` + exact verification; 상태변경 없이 성공 | P0 reproducibility | PASS — first and repeat invocations succeeded |
| `TC-ORG-003-SEED-003` | 기존 URL 또는 enabled metadata가 기준과 불일치 | fail-closed transaction rollback; 기존 canonical endpoint rows 보존 | P0 data integrity | PASS — URL and enabled-state conflict probes rejected; post-probe seed passed |
| `TC-ORG-003-SEED-004` | URL allowlist 검증 | scheme/host/port/path/userinfo/query/fragment 불일치는 DB 접근 전에 거부하고 URL 값을 출력하지 않음 | P0 security | PASS — seven invalid URL-shape probes rejected |
| `TC-ORG-003-SEED-005` | Ticket의 쓰기·연동 경계 | `hospital_endpoints` 외 쓰기와 PACS HTTP 호출 없음; credential이 URL/table/log에 없음 | P0 security/privacy/scope | PASS — static scope scan found only endpoint-table INSERT and no HTTP client/call |

Seed policy `ORG-003-DEC-001`은 [Policy Decision Log](POLICY-DECISION-LOG.md#org-003-dec-001--role-aligned-dicomweb-endpoint-registry와-활성화-기준)에 기록한다. 이 Acceptance는 PACS endpoint reachability, WADO/STOW compatibility, runtime SSRF defense, TLS, authorization 또는 A→B product transfer를 주장하지 않는다.

# P0 Patient Reference/Mapping Schema Acceptance — 2026-09-30

`MEDIQ-DB-003`은 승인된 `patient_refs`와 `patient_mappings` persistence schema만 구현한다. 실사용 환자 identity verification, mapping UI, PACS Import Authorization은 PAT-003/004 및 업무 Ticket의 별도 Gate다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-003-REG-001` | Migration apply/re-run and approved table inventory | DB-003의 두 table만 추가되고 applied history가 중복 없이 유지 | P0 schema | Executed — total 7 approved tables, ledger=3, two repeat attempts |
| `TC-DB-003-REG-002` | Declared columns, UUID PKs, SQL types, nullability and defaults | Data Model과 정확히 일치; defaults/추가 identity field 없음 | P0 schema | Executed — exact 13-column shape and two PKs |
| `TC-DB-003-REG-003` | PatientReference/Hospital FK and delete attempt | missing reference/hospital insert 거부; referenced parent delete RESTRICT | P0 schema | Executed — both invalid FK inserts and both RESTRICT deletes denied |
| `TC-DB-003-REG-004` | Patient reference code and both mapping composite key duplicates | 세 declared unique key에서 중복 거부 | P0 schema | Executed — three duplicate cases denied; A/B mapping for same reference accepted |
| `TC-DB-003-REG-005` | PatientReference/Mapping status and P0 synthetic-code boundary | ACTIVE/INACTIVE 및 VALID/UNVERIFIED/AMBIGUOUS/REVOKED 외 상태와 `MQ-TEST-*` 외 PatientReference 코드 거부 | P0 schema/security | DB-003 historical baseline: two status CHECKs; current regression also verifies DB-009 synthetic-code CHECK (three checks total) |
| `TC-DB-003-REG-006` | Declared secondary index inventory | PatientReference status 및 Mapping patient_ref_id/hospital_id/status index 존재 | P0 schema | Executed — four named indexes found |
| `TC-DB-003-REG-007` | Identity data minimization | 합성 코드·합성 local ID만 사용; 실제 신원/인구학 필드 및 로그 출력 없음 | P0 security | Executed — exact schema allowlist; synthetic test values only and no identifier output |
| `TC-DB-003-REG-008` | One synthetic PatientReference mapped at separate test hospitals and rollback | 두 병원 mapping은 허용; 동일 hospital uniqueness 및 전체 rollback 뒤 persistent row 0 | P0 integration | Executed — mappings accepted, transaction rolled back, persistent rows 0 |

`VALID`만 PACS Import에 쓸 수 있다는 rule은 DB가 아니라 Application Service/Acceptance가 강제한다. Missing/Ambiguous/Unverified/Revoked mapping의 전송 거부는 PAT-003/004 및 전체 product E2E까지 별도 검증한다.

## P0 PatientReference Domain and Persistence Adapter — MEDIQ-PAT-001

`MEDIQ-PAT-001`은 기존 DB-003 schema 위에 합성 PatientReference domain과 repository boundary/parameterized PostgreSQL adapter를 구현한다. Public API, PatientMapping, 실제 본인확인 및 DB 권한/RLS 변경은 포함하지 않는다. 정책은 [PAT-001-DEC-001](POLICY-DECISION-LOG.md#pat-001-dec-001--p0-합성-patientreference-코드와-영속성-경계)를 따른다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-PAT-001-DOM-001` | Create a PatientReference | `MQ-TEST-` 형식, UUID, `ACTIVE`, 유효한 UTC timestamps; 입력 값에서 hospital/local identity를 파생하지 않음 | P0 domain | PASS — valid synthetic reference created with generated UUID and fixed ACTIVE state |
| `TC-PAT-001-DOM-002` | Rehydrate and reject invalid domain values | `ACTIVE/INACTIVE` 및 허용 code/UUID/time만 수락; invalid status/code/UUID/time은 값 노출 없는 domain error | P0 domain/security | PASS — invalid code/status/time denied without echo; mutable timestamp references denied |
| `TC-PAT-001-PER-001` | Create/find via repository adapter | 승인된 5개 컬럼만 사용하고 모든 ID/code를 SQL bind parameter로 전달; mapping·identity field를 조회하지 않음 | P0 persistence | PASS — create/find SQL contract uses bind parameters and the approved minimal projection |
| `TC-PAT-001-PER-002` | Unique conflict and database error mapping | 중복 code는 일반 conflict로 변환; error message에 code·DB message를 포함하지 않음 | P0 persistence/security | PASS — unique/database errors mapped to fixed non-disclosing errors |
| `TC-PAT-001-PER-003` | Runtime database integration boundary | `mediq_runtime`의 제한된 column-level SELECT/INSERT와 DB synthetic CHECK로 합성 create/read/rollback; 임시 권한 우회 금지; 글로벌 `patient_refs`의 Tenant RLS/business authorization/API claim은 금지 | P0 integration/security | PASS — test-profile container used the actual runtime URL; create/read/unique-conflict/rollback passed; no route or auth claim |
| `TC-PAT-001-SEC-001` | Public and identity boundary | Controller/route 없음; repository는 인증·인가를 우회하는 public path에 연결되지 않음; identity proof를 암시하지 않음 | P0 security | PASS — no patient route/controller and no AppModule wiring |

실제 PostgreSQL runtime integration은 `MEDIQ-DB-009`가 만든 최소권한 예외로 synthetic-only `patient_refs`에서만 검증한다. 이 결과는 Tenant-scoped 업무 저장, identity proof, business authorization 또는 public API를 승인하지 않는다. Adapter unit/SQL-contract 시험과 런타임 DB integration 증거는 구분한다.

# P0 Source Patient Mapping Scope and Acceptance — MEDIQ-PAT-002

Normative scope: `PAT-002-DEC-001` and its approved narrow follow-up `PAT-002-DEC-002`. `MEDIQ-DB-003` already verifies the approved `patient_mappings` table shape, foreign keys, status check, uniqueness, indexes and rollback using synthetic fixtures (`TC-DB-003-REG-001~008`). PAT-002 does not duplicate those schema claims. It verifies the application domain/repository boundary plus an internal read-only runtime path for synthetic mappings: only an IAM-002 verified active `USER` may read a mapping in the exact Hospital attached to that membership, on the same verified Tenant transaction/`PoolClient`. The integration uses a synthetic principal injected at the trusted IAM-002 boundary; it does not validate a live OIDC issuer, JWT signature verification, login flow or HTTP authentication guard. The candidate Hospital is checked before mapping SQL and the query uses the verified Hospital. No public mapping route or write access is enabled.

P0 accepts only `MQ-TEST-*` PatientReference codes and a synthetic Local Patient ID matching `^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*$` within the schema limit of 128 characters. `VALID` is a synthetic fixture designation, not identity proof. PAT-002 is source-mapping persistence only; destination mapping validation and PACS Import denial remain PAT-003/004.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-PAT-002-GATE-001` | Confirm scope, dependencies and current privilege boundary | Synthetic source mapping only; no schema change; internal same-Hospital read-only path only under `PAT-002-DEC-002`; no write or public route | P0 scope/security gate | PASS — both decisions recorded; exact 8-column read grant and internal path tested; no mapping route is registered |
| `TC-PAT-002-DOM-001` | Create/reconstitute a source mapping | Accept an active synthetic `MQ-TEST-*` PatientReference, UUID Hospital key and canonical `TEST-*` local ID; reject inactive reference, malformed, real-shaped, empty or overlength input | P0 synthetic domain | PASS — unit tests cover valid create, inactive reference and invalid local ID/UUID; Hospital existence remains enforced by existing DB FK |
| `TC-PAT-002-DOM-002` | Mapping status handling | Accept only `VALID`, `UNVERIFIED`, `AMBIGUOUS`, `REVOKED`; creation defaults to `UNVERIFIED`; domain state alone exposes no authorization decision | P0 domain/security | PASS — valid states and invalid state tested; no Authorization/API wiring exists |
| `TC-PAT-002-PER-001` | Create/find through repository contract | Use approved mapping columns and parameterized values; every lookup includes exact Hospital scope; repository contract alone does not authenticate/authorize the caller | P0 persistence/security | PASS — unit SQL-contract tests verify bound values, minimal projection and Hospital predicates; runtime authorization is separately tested by `TEN-001~002` |
| `TC-PAT-002-PER-002` | Duplicate and database-error handling | Hospital+Local ID and PatientReference+Hospital uniqueness conflicts map to fixed non-disclosing errors; local ID and driver detail are not returned | P0 persistence/security | PASS — unique/error mapping contract tested; DB uniqueness is independently covered by DB-003 |
| `TC-PAT-002-TEN-001` | Tenant A/B reads; Tenant C and writes denied | A/B verified Hospital users read only own synthetic mapping; C cannot read A/B; runtime writes denied | P0 Tenant isolation | PASS — A/B exact-Hospital reads succeeded; C forced-RLS read of A returned zero; INSERT/UPDATE/DELETE/TRUNCATE denied |
| `TC-PAT-002-TEN-002` | Untrusted Tenant/Hospital candidate or unsupported/missing Actor context | Use only server-verified identity/membership; mismatch or unsupported context is denied before mapping SQL | P0 internal authorization boundary | PASS — same-Tenant other-Hospital, other-Tenant, `SERVICE`, tenant-level actor and missing principal all denied with no mapping query; no HTTP spoofing claim |
| `TC-PAT-002-SEC-001` | Missing, malformed or failed internal context | Fail closed before mapping SQL; no row disclosure/write; fixed internal error | P0 security | PASS — missing/invalid principal and mismatched identity denied before query; HTTP safe-error remains NOT RUN because there is no route |
| `TC-PAT-002-SEC-002` | Connection-pool reuse after commit and rollback | Tenant context is transaction-local on the checked-out client and absent for the next borrower after either outcome | P0 security | PASS — max-one runtime pool reused after successful reads and rejected/rolled-back access; context absent and no-context RLS read returned zero |
| `TC-PAT-002-SEC-003` | Preconditions and approved limit for runtime mapping access | Only the DEC-002 internal same-Hospital read is allowed; exact columns, RLS, no writes and no route; broader business/image access remains gated | P0 security gate | PASS — separate decision and exact grant reviewed; API, role-based management, image access and PACS remain closed |
| `TC-PAT-002-DB-001` | Exact runtime privilege catalog for PatientMapping | Exactly eight named `SELECT` columns; no table-wide/write/default/PUBLIC/DDL access; forced Tenant RLS remains enabled | P0 least privilege | PASS — `mediq_runtime` catalog showed the exact eight-column set; write probes failed with insufficient privilege; overall column inventory is 70 |

`PAT-002-DEC-002` is a deliberate narrow exception to the original no-runtime-grant gate: an internal synthetic mapping reader is accepted for active IAM-002 `USER` membership with exact verified Hospital match, using only eight column-level `SELECT` privileges and existing forced Tenant RLS. It does not wire a controller, route, API, write operation or downstream side effect. Mapping read permission is not a patient-identity assertion, image access authorization, Consent/Grant decision or general object/action permission. No workforce role/capability model exists, so all active `USER` members of the exact Hospital share this internal read; this residual is recorded. The same-role mutable custom-GUC limitation remains an accepted synthetic-P0 residual and is not a production/real-patient security claim. HTTP safe-error, protected business APIs, Consent/Grant, image and PACS access remain separate gates.

# P0 ExchangeSession Domain Acceptance — MEDIQ-EXC-001 — 2026-09-30

`MEDIQ-EXC-001`은 순수 Domain 범위다. 이 Acceptance는 `AT-FUNC-001`의 API 생성·인증·Tenant·Audit end-to-end를 대체하지 않으며, Session ID/state를 접근 권한으로 취급하지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-EXC-001-DOM-001` | New Session creation | 고유 UUID, 승인된 Patient/Source/Destination/Requester 참조, 목적, 초기 `REQUESTED`, 생성/수정 timestamp 생성 | P0 domain | PASS — API unit suite |
| `TC-EXC-001-DOM-002` | Invalid UUID, identical Hospitals, blank/over-limit purpose | 고정 오류 `EXCHANGE_SESSION_INVALID`; 잘못된 입력/내부상세 미반영 | P0 domain | PASS — rejection cases |
| `TC-EXC-001-DOM-003` | State reconstitution | 기존 12개 state만 수용하고 알 수 없는 값 거부 | P0 domain | PASS — 12 declared states and unknown rejection |
| `TC-EXC-001-DOM-004` | Timestamp integrity and immutability | timestamp 유효성, `updated_at >= created_at`, nullable 시각 검증 및 Date 방어 복사; 승인되지 않은 expiry/state 상관관계는 추정하지 않음 | P0 domain | PASS — API unit suite |
| `TC-EXC-001-SEC-001` | Authority/scope boundary | Session ID/state는 credential이 아니며 API·Provider·DB 권한을 추가하지 않음 | P0 security/documentation gate | PASS — source/config scope review; no route/provider/grant |

Purpose는 Unicode code point 기준 255자 이하이고 공백만인 문자열은 거부한다. 정상 문자열은 그대로 보존한다. `expires_at > created_at` 및 `completed_at`-state 관계는 이 Acceptance에서 강제하지 않는다. State transition과 terminal-state 접근 제한은 `MEDIQ-EXC-005`/Authorization Acceptance 범위다.

---

# P0 ExchangeSession Repository Acceptance — MEDIQ-EXC-002 — 2026-09-30

`MEDIQ-EXC-002`는 기존 DB-004의 `exchange_sessions` schema를 사용하는 내부 repository contract다. DB-004의 schema evidence를 재사용한다. Adapter는 checked-out transaction client만 받아 SQL을 실행하고 tenant context나 transaction lifecycle을 설정하지 않는다. 실DB Acceptance는 `EXC-002-DEC-002`에 따라 DB-008이 생성·폐기하는 synthetic scratch DB에서만 임시 열 권한을 사용하며 영구 migration/runtime grant는 추가하지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-EXC-002-PER-001` | Session persistence SQL | 승인된 정확한 11개 column을 명시하고 값은 전부 bind parameter; 반환 row를 domain으로 재구성 | P0 SQL contract/unit | PASS — exact column and parameter assertion |
| `TC-EXC-002-PER-002` | Session ID lookup | valid UUID를 bound parameter로 조회; raw identifier SQL 없음; 결과 0/1행만 domain화 | P0 SQL contract/unit | PASS — exact projection and bound predicate |
| `TC-EXC-002-PER-003` | Absent or RLS-invisible Session | adapter가 0행을 받으면 같은 `null`; row 존재 여부나 DB detail을 오류로 누설하지 않음 | P0 unit | PASS — mocked no-row result; live RLS not tested |
| `TC-EXC-002-PER-004` | Conflict, DB failure and invalid persistence result | 고정 conflict/persistence error; SQL/driver/detail 미노출; 복수행·손상된 row 거부 | P0 unit/security | PASS — conflict/failure/cardinality/corrupt-row cases |
| `TC-EXC-002-PER-005` | Malformed/injection-shaped lookup ID | 쿼리 전에 고정 domain error; query 호출 0회 | P0 security/unit | PASS — invalid key cases |
| `TC-EXC-002-SEC-001` | Runtime exposure boundary | API/provider/permanent runtime grant/RLS 변경 없음; verified Tenant transaction과 business Authorization은 제품 caller의 선행조건 | P0 security/scope review | PASS — no route/provider/permanent grant; temporary scratch grant separately tested under SEC-002 |
| `TC-EXC-002-DB-001` | Live PostgreSQL create/read round-trip | `mediq_runtime` 및 IAM-002가 검증한 동일 transaction client로 adapter 생성·조회; 저장값이 domain으로 동일 복원되고 테스트 데이터는 폐기 scratch DB에만 존재 | P0 synthetic DB integration | PASS — 3 scratch runs; actual PostgreSQL round-trip passed |
| `TC-EXC-002-DB-002` | Bilateral Tenant RLS visibility | Source Tenant와 Destination Tenant는 동일 합성 Session row를 볼 수 있고, 업무 Authorization을 의미하지 않음 | P0 database RLS integration | PASS — A/B visible under verified memberships; no authorization claim |
| `TC-EXC-002-DB-003` | Unrelated/no-context denial and rollback | unrelated Tenant와 context 없는 read는 row를 반환하지 않음; context 없는 insert는 거부; rollback한 생성은 다시 조회되지 않음 | P0 security/database integration | PASS — C/no-context denied; rollback row absent |
| `TC-EXC-002-DB-004` | Same-client Tenant context cleanup | 성공·거부·rollback 이후 재사용된 pool client에서 Tenant GUC가 남지 않고 보호 row가 보이지 않음 | P0 security/database integration | PASS — IAM-002 wrapper reset and reused-client probe |
| `TC-EXC-002-SEC-002` | Scratch-only exact privilege lifecycle | 임시 전체 11열 `SELECT` 및 11열 `INSERT`만 사용; 추가 권한 회수 뒤 기존 70 privilege-row baseline 복원; UPDATE/DELETE/TRUNCATE/DDL 및 permanent migration 없음 | P0 security/scope integration | PASS — each of 3 scratch runs restored exact 70-row baseline; no migration |

`PER-*`와 `SEC-001`은 unit/mock 및 범위 검토 결과다. 신규 `DB-*` Acceptance는 repository persistence와 database RLS만 검증하며 Consent·Grant·Session object/action Authorization, HTTP BOLA/safe-error, 실제 제품 API 사용 또는 PACS 접근을 검증하지 않는다. RLS-visible Session row는 업무 허가가 아니다. 시험용 privilege는 scratch 전용 migration identity가 한시 부여·회수하고, 종료 후 catalog가 정확히 기존 70 privilege rows인지 확인한다. `Session ID ≠ Authorization Credential` 불변조건은 계속 적용하며 `GATE-IMP-04`는 별도 전체 Exchange Acceptance 전까지 미완료다.

---

# P0 ExchangeSession State Transition Acceptance — MEDIQ-EXC-005 — 2026-09-30

`MEDIQ-EXC-005` domain rule은 `EXC-005-DEC-001`의 edge matrix를 따른다. 이 Acceptance는 Application Service의 Consent/Grant/expiry 검증, persistence, API object authorization 또는 terminal resource-access denial을 대체하지 않는다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-EXC-005-DOM-001` | Mainline lifecycle | `REQUESTED → CONSENT_PENDING → CONSENTED → AUTHORIZED → READY → ACTIVE → COMPLETED`만 순차 허용; `COMPLETED` 전이에서 `completed_at=now` | P0 domain | PASS — API unit suite |
| `TC-EXC-005-DOM-002` | State-specific terminal transition | `REJECTED`: REQUESTED/CONSENT_PENDING; `REVOKED`: CONSENTED/AUTHORIZED/READY/ACTIVE; `EXPIRED`/`FAILED`/`CANCELLED`: any non-terminal | P0 domain | PASS — API unit suite |
| `TC-EXC-005-DOM-003` | Skip, backward, same-state, unknown and terminal reopening | fixed `EXCHANGE_SESSION_TRANSITION_INVALID`; original aggregate remains unchanged | P0 domain/security | PASS — API unit suite |
| `TC-EXC-005-DOM-004` | Transition time and inconsistent completion metadata | valid Date with `now >= updated_at`; inconsistent non-terminal snapshot carrying `completed_at` fails closed; new aggregate is immutable | P0 domain | PASS — API unit suite |
| `TC-EXC-005-SEC-001` | Permission/side-effect boundary | transition changes lifecycle only; no Authorization, API, persistence, Audit or PACS side effect | P0 security/scope review | PASS — source/config scope review; no runtime exposure added |

`expires_at` eligibility is not decided by this pure domain function. An authorized Application Service must validate the actual expiry evidence before requesting `EXPIRED`. An expired session may not be reactivated because all terminal states have no outgoing edge.

---

# P0 Exchange Session Schema Acceptance — 2026-09-30

`MEDIQ-DB-004`는 승인된 `exchange_sessions` persistence schema만 구현한다. Session ID 또는 state는 접근 권한이 아니며 consent, authorization, grant, terminal state enforcement와 transition policy는 별도 업무 Service Gate다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-004-REG-001` | Migration apply/re-run and approved table inventory | `exchange_sessions` additive changes and migration history without duplication | P0 schema | PASS — full-schema gate applies all 16 migrations once and on repeat without duplication; product-table ledger=16 |
| `TC-DB-004-REG-002` | Declared columns, UUID PK, SQL types, nullability and defaults | Data Model과 exact 12-column shape including required UUID `idempotency_key`; no undocumented defaults | P0 schema | PASS — DB-004 regression validates 12 exact columns, required UUID key and no defaults |
| `TC-DB-004-REG-003` | Patient/Source/Destination/Requester foreign keys and delete attempt | missing parent insert 거부; referenced parent delete RESTRICT | P0 schema | Executed — 4 invalid FK inserts and 4 RESTRICT deletes denied |
| `TC-DB-004-REG-004` | All 12 declared Session State values and unknown state | Listed values accepted; unknown value rejected | P0 schema | Executed — 12 states accepted and unknown state rejected |
| `TC-DB-004-REG-005` | Source and destination hospital equality | Same source/destination rejected | P0 security/schema | Executed — equal hospital IDs rejected |
| `TC-DB-004-REG-006` | Seven declared session indexes | Six single-column and one destination/state composite index exist | P0 schema | Executed — all 7 declared indexes found |
| `TC-DB-004-REG-007` | Session table data minimization / authority boundary | No payload/secret/identity columns; status/ID do not grant access | P0 security | Executed — schema allowlist contains no payload/secret/identity fields; application authorization remains unimplemented and untested |
| `TC-DB-004-REG-008` | Synthetic session fixture across approved parents and rollback | Valid and nullable metadata accepted; all test rows disappear after rollback | P0 integration | Executed — synthetic states/parents accepted; rollback left 0 fixture rows |

`expires_at > created_at`는 ExchangeSession section에서 승인된 명시 constraint가 아니므로 DB-004에서 추정해 추가하지 않는다. `COMPLETED/REJECTED/EXPIRED/REVOKED/FAILED/CANCELLED` terminal state의 신규 접근 거부 및 valid state transition은 Application Service/Acceptance가 강제한다.

# P0 Imaging Metadata Schema Acceptance — 2026-09-30

`MEDIQ-DB-006`은 승인된 `imaging_packages`와 `study_references` metadata schema만 구현한다. DICOM binary는 DB에 저장하지 않으며, Study UID·storage reference는 단독 접근권한이 아니다. DB-006은 DB-005 Consent/Grant optional package references의 FK target을 먼저 생성한다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-006-REG-001` | Migration apply/re-run and approved table inventory | 두 imaging metadata table만 추가되고 migration history 중복 없음 | P0 schema | Executed — ledger=5, approved product tables=10 after repeated apply; DB-006 evidence |
| `TC-DB-006-REG-002` | Declared columns, PK, SQL types, nullability and defaults | Data Model과 exact 19-column shape; no undocumented defaults | P0 schema | Executed — exact 19-column metadata, two PKs, no defaults |
| `TC-DB-006-REG-003` | Session/Patient/Hospital/Package foreign keys and deletion policy | Missing reference 거부, 5개 FK의 parent delete RESTRICT | P0 schema | Executed — 5 invalid FK inserts denied; 4 representative RESTRICT deletes denied; all 5 catalog FKs use RESTRICT |
| `TC-DB-006-REG-004` | ImagingPackage states | 7개 선언 상태 허용, 알 수 없는 상태 거부 | P0 schema | Executed — all 7 declared states accepted; unknown state denied |
| `TC-DB-006-REG-005` | Study/object count boundaries | Negative count 거부; nullable Study counts 허용 | P0 schema | Executed — negative package/series/instance counts denied; nullable Study counts accepted |
| `TC-DB-006-REG-006` | Declared indexes and package/Study UID uniqueness | 8개 선언 index 확인, 같은 package 내 Study UID 중복 거부 | P0 schema | Executed — all 8 indexes found; duplicate `(package_id, study_instance_uid)` affected 0 rows |
| `TC-DB-006-REG-007` | Metadata minimization and authority boundary | DICOM binary/PHI column 없음; synthetic UID/storage reference only; UID는 권한이 아님 | P0 security | Executed — exact schema allowlist contains metadata only; synthetic values; no authorization service tested |
| `TC-DB-006-REG-008` | Synthetic package/study fixtures and rollback | 승인 parent 참조를 수용하고 transaction rollback 후 fixture row 0 | P0 integration | Executed — valid fixture accepted and rollback left 0 synthetic metadata rows |

Package/session patient와 source 병원 일치, Study source 및 Package source 일치 검증은 Data Model에 따라 Application Layer 책임이다. 해당 업무 authorization/PACS retrieval은 DB-006 범위가 아니다.

# P0 Consent and Transfer Grant Schema Acceptance — 2026-09-30

`MEDIQ-DB-005`는 승인된 `consents`, `consent_actions`, `transfer_grants`, `transfer_grant_scopes` persistence schema만 구현한다. Consent와 Authorization은 별개이며 Session/Consent/Grant ID, status, scope는 그 자체로 접근 권한이 아니다.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-005-REG-001` | Migration apply/re-run and approved table inventory | Consent/Grant 4 tables만 추가, ledger idempotent, 승인 table 외 없음 | P0 schema | Executed — apply twice; ledger=6, product tables=14; DB-005 evidence |
| `TC-DB-005-REG-002` | Declared columns, SQL types, nullability/defaults | Data Model과 exact 31-column shape; no undocumented defaults | P0 schema | Executed — 31 columns, 4 PK, exact type/length/nullability, defaults=0 |
| `TC-DB-005-REG-003` | Thirteen parent foreign keys and delete policy | Invalid references denied; all 13 FKs use RESTRICT | P0 schema/security | Executed — invalid_fk=13; 13 RESTRICT FKs; delete_restrict=9 |
| `TC-DB-005-REG-004` | Consent/Grant status, action and scope values | Declared values accepted; unknown values rejected | P0 schema | Executed — 5 Consent states, 4 actions, 4 Grant states, 4 scopes; invalid checks=6 denied |
| `TC-DB-005-REG-005` | Positive consent version and Grant expiry relation | `consent_version > 0`; `expires_at > issued_at`; invalid boundary denied | P0 schema | Executed — valid boundaries accepted; non-positive version and invalid expiry denied |
| `TC-DB-005-REG-006` | Consent/action/scope uniqueness and one-active partial unique | Session/version, action, scope duplicates denied; one ACTIVE Consent per session | P0 schema | Executed — 4 duplicate cases denied, including active-consent partial index |
| `TC-DB-005-REG-007` | Declared indexes and data minimization / authority boundary | 12 ordinary + 1 partial unique index; no payload/secret/identity fields; persistence creates no authorization decision | P0 security | Executed — 13 approved indexes and exact column allowlist; no authorization service in scope |
| `TC-DB-005-REG-008` | Synthetic Consent/Grant fixtures and rollback | Nullable actor/package fields accepted, valid relationships persisted in transaction, rollback leaves 0 rows | P0 integration | Executed — synthetic valid fixtures accepted; rollback left 0 rows |

Consent↔Session Patient/Source/Destination/Package consistency, Grant↔Consent/Session/Destination/Tenant consistency, Grant scope subset of consent actions, expiry/revocation enforcement and authorization decisions are Application/Domain rules. They are deliberately not claimed by this schema-only Acceptance.

# P0 Integrity, Provenance and Audit Schema Acceptance — 2026-09-30

`MEDIQ-DB-007` implements only the approved evidence-persistence tables: `integrity_evidence`, `provenance_records`, and `audit_events`. Storing a status or evidence row does not execute an integrity check, authorize access, guarantee append-only/WORM retention, or prove an end-to-end transfer.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-007-REG-001` | Migration apply/re-run and approved table inventory | Three evidence tables added once; approved inventory only | P0 schema | Executed — apply twice; ledger=7, product tables=17/17; DB-007 evidence |
| `TC-DB-007-REG-002` | Declared columns, SQL types, nullability and defaults | Exact 37-column approved shape; no undocumented defaults | P0 schema | Executed — 3 tables/37 columns, 3 PK; exact type/length/nullability; defaults=0 |
| `TC-DB-007-REG-003` | Parent references and delete policy | 12 FKs reject missing parents and all use RESTRICT | P0 schema/security | Executed — 12 invalid FK inserts denied; all 12 RESTRICT; 8 representative deletes denied |
| `TC-DB-007-REG-004` | Finite integrity/provenance/audit result values | Declared stage/status/type/result values accepted; unknown values rejected | P0 schema | Executed — all declared status/stage/type/result values accepted; invalid enumerations denied |
| `TC-DB-007-REG-005` | Object-count boundaries | NULL or non-negative object counts accepted; negative values rejected | P0 schema | Executed — nullable/non-negative accepted; both negative object counts denied |
| `TC-DB-007-REG-006` | Declared indexes and data minimization | 13 declared secondary indexes present; no payload, credential, key or patient identity fields | P0 security | Executed — exact 13 non-PK indexes; no unapproved unique index/constraint or sensitive columns |
| `TC-DB-007-REG-007` | Optional evidence references and generic audit context | Approved nullable study/destination/integrity/actor/tenant/session/resource fields accepted; unrecognized action remains storable because the Data Model defines core actions as a minimum, not an exhaustive enum | P0 schema | Executed — nullable references accepted; synthetic extension audit action accepted |
| `TC-DB-007-REG-008` | Synthetic evidence fixtures and rollback | Valid Integrity/Provenance/Audit references accepted; rollback leaves zero fixture rows | P0 integration | Executed — valid fixtures accepted; rollback left 0 rows |

Application invariants remain outside this schema Acceptance: failed Integrity must block successful Transfer/Provenance; source/destination must match the authorized ExchangeSession; audit events must be emitted by business/security operations; and cross-tenant reads must be denied by the authorization/RLS layer. No product workflow PASS is implied.

# Environment Health Check Acceptance — 2026-09-29

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-ENV-009-HEALTH-001` | PostgreSQL·Orthanc A/B·API container health 확인 | 4개 service가 모두 `running|healthy`여야 full gate 통과 | P0 environment | PASS — full runtime gate |
| `TC-ENV-009-HEALTH-002` | Dedicated runtime role로 internal DB network에서 `SELECT 1` | Authenticated SQL probe succeeds; no bootstrap password used | P0 environment | PASS — full runtime gate |
| `TC-ENV-009-HEALTH-003` | Orthanc A/B authenticated DICOMweb QIDO와 invalid-auth/network isolation probe | A/B readiness and boundaries pass | P0 environment | PASS — full runtime gate |
| `TC-ENV-009-HEALTH-004` | Full dependency-only and API health orchestration | API liveness/readiness pass and overall full gate reports PASS | P0 environment | PASS — default orchestrator returned overall PASS |
| `TC-ENV-009-HEALTH-005` | API liveness while mocked readiness reports false | `200 {"status":"alive"}`, no-store; no dependency details | P0 environment | PASS — API unit test |
| `TC-ENV-009-HEALTH-006` | API readiness with runtime DB and authenticated A/B available | `200 {"status":"ready"}`, no-store; no component details | P0 environment | PASS — unit + runtime gate |
| `TC-ENV-009-HEALTH-007` | One or more readiness dependencies unavailable | `503 {"status":"not_ready"}` within timeout; no internal detail leakage | P0 environment | PASS — API unit failure-path test |
| `TC-ENV-009-HEALTH-008` | API network exposure and runtime hardening | No host port; internal networks only; read-only root, capabilities dropped, no-new-privileges | P0 environment | PASS — Compose validator + runtime inspect |

These are operational health tests, not product API authorization or P0 business acceptance. Public ingress must deny both routes; health status never grants access to patient, imaging, or transfer resources. The former expected-block case is retained in ENV-009 evidence as historical evidence from before the API service was added.

# Environment Reproducibility Smoke — MEDIQ-ENV-010

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-ENV-010-SMOKE-001` | Approved Compose environment is built/started with readiness wait | PostgreSQL, Orthanc A/B and health-only API report `running|healthy`; no volume reset or destructive cleanup | P0 environment | PASS — final smoke run |
| `TC-ENV-010-SMOKE-002` | Local ENV-007 manifest and DICOM files are validated before runtime checks | Exactly one declared synthetic CT Study, one Series, three single-frame Instances, hashes and allowlisted synthetic identity pass | P0 environment | PASS — fixture validator |
| `TC-ENV-010-SMOKE-003` | Source/destination fixture placement is checked through authenticated QIDO | Hospital A has exactly the expected synthetic Study/Series/3 Instances; Hospital B remains empty; unexpected data fails closed | P0 environment | PASS — exact manifest UID match; B empty |
| `TC-ENV-010-SMOKE-004` | One-command environment smoke orchestration | Static Compose boundary, fixture integrity, full ENV-009 health checks all pass before `environment_smoke_status=PASS` | P0 environment | PASS — full command returned exit code 0 |

This smoke validates reproducibility of the local test environment and fixture placement only. It does not perform WADO retrieval, a MediQ-authorized transfer, STOW to Hospital B, product authorization, or the Phase 0 product E2E gate.

# P0 Full Database Schema Validation Acceptance — 2026-09-30

`MEDIQ-DB-008` was introduced against the 17-table schema in its original 2026-09-30 snapshot. Before `PACS-001-DEC-008`, the current schema had 18 product tables and 23 migration journal entries. DEC-008 adds four StudyReference metadata columns and two checks without adding a product table; the updated gate expects 18 tables, 24 journal entries and aggregate catalog `18/50/17/42`. This post-DEC-008 regression is NOT RUN until isolated clean/repeat/reset/re-apply and runtime-role checks pass. Historical DB-008 evidence remains unchanged. Registry ownership and status behavior follow approved decision `DB-008-DEC-001`.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-008-REG-001` | Exact product-table inventory and migration history | Exactly 18 approved product tables and all 24 journal entries applied once | P0 schema | PASS — final disposable `-ScratchOnly` clean/repeat/reset/reapply reported 18 tables and ledger 24; persistent DB was not accessed |
| `TC-DB-008-REG-002` | Aggregate PK/FK/UNIQUE/CHECK/index catalog | Catalog matches approved DB-002~007, PACS-007 and DEC-008 amendments: 18/50/17/42; exact indexes match schema | P0 schema | PASS — final scratch catalog `18|50|17|42`; DEC-008 lifecycle indexes verified |
| `TC-DB-008-REG-003` | Foreign-key targets and delete policies | All declared references exist; approved FK delete rules are RESTRICT | P0 schema/security | PASS — exact catalog, invalid references rejected, RESTRICT retained |
| `TC-DB-008-REG-004` | Required unique constraints | All required unique keys reject duplicates and no undocumented uniqueness is inferred | P0 schema | PASS — approved registry and per-ticket unique constraints verified |
| `TC-DB-008-REG-005` | Declared checks, enums, and range boundaries | All approved finite values behave exactly as specified; `organization_type` remains explicitly extensible | P0 schema | PASS — custom organization types accepted; finite status/type/range checks match baseline |
| `TC-DB-008-REG-006` | Exact index inventory | All declared indexes exist, including the StudyReference temporary-payload cleanup and non-null reference unique indexes, and no unapproved index is introduced | P0 schema | PASS — migration catalog and PostgreSQL integration verified both DEC-008 lifecycle indexes |
| `TC-DB-008-REG-007` | Synthetic seed/fixture compatibility and rollback | Approved synthetic fixtures insert through valid paths and leave no persistent rows | P0 integration | PASS — DB-002~007 fixtures and policy probes rolled back; zero canary rows persist |
| `TC-DB-008-REG-008` | Clean migration UP and RESET strategy | All 24 migrations apply twice to empty disposable PostgreSQL; cleanup targets only owned ephemeral resources; fresh UP reproduces the 18-table schema | P0 integration | PASS — final scratch clean/repeat/reset/reapply passed and removed only owned ephemeral resources; persistent DB-002~007 regressions intentionally skipped |
| `TC-DB-008-REG-009` | Tenant/Organization and Actor/Hospital owner-pair consistency | Synthetic mismatches are rejected by composite FK; nullable Tenant-level Actor remains valid; all probes roll back | P0 security/design | PASS — both mismatches rejected; null-Hospital Actor accepted; rollback leaves zero rows |
| `TC-DB-008-REG-010` | `organization_type`, `hospitals.status`, `actors.status` policy | Custom organization type is accepted without DB CHECK; Hospital/Actor status accepts only the three approved values | P0 schema/design | PASS — custom type accepted; all three statuses accepted and invalid statuses rejected |
| `TC-DB-008-REG-011` | StudyReference temporary-payload state/shape and exact runtime privileges | Reject malformed/null-partial lifecycle shapes; accept only valid `STAGING/AVAILABLE/PURGE_PENDING/PURGED` shapes; `mediq_runtime` receives exactly 10 SELECT and 4 UPDATE StudyReference columns, no INSERT/DELETE/table privilege, and forced Tenant RLS still denies other Tenants | P0 schema/security | PARTIAL — PostgreSQL scratch verified exact grants/RLS, valid metadata transitions, one malformed PURGED shape rejection, and wrong-Tenant denial. Other null-partial permutations and physical filesystem lifecycle were not tested |

`DB-008-DEC-001` records the approved choices: `organization_type` is an extensible code without a DB CHECK; Hospital/Actor statuses use `ACTIVE`, `SUSPENDED`, and `INACTIVE`; composite FKs enforce Hospital Tenant/Organization and Actor Tenant/Hospital ownership consistency. These constraints establish structural integrity only, not runtime authorization, RLS, or Tenant Isolation.

---

# P0 Database Least-Privilege, Tenant RLS and Authorization Acceptance — 2026-09-30

Normative policy: `DB-009-DEC-001`. The database enforcement cases below were exercised against PostgreSQL; business Authorization/API cases remain unimplemented and **NOT RUN**. Earlier RLS probes set the reviewed transaction-local setting directly. The identity-resolution and application pool-wrapper cases are tracked separately under `MEDIQ-IAM-002` below.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DB-009-PRIV-001` | Runtime role attributes, memberships, ownership and DDL | Non-superuser, non-owner of protected tables/schema/database, no `CREATEDB`/`CREATEROLE`/`BYPASSRLS`, `NOINHERIT`, no elevated membership; table/schema/role DDL and `SET ROLE` denied | P0 DB security | PASS — scratch catalog and CREATE/ALTER/ROLE/SET ROLE probes |
| `TC-DB-009-PRIV-002` | `PUBLIC`, default privileges, migration ledger and ungranted table grants | No business-table access through `PUBLIC` or default grants; runtime cannot read migration ledger or tables not explicitly granted | P0 DB security | PASS — no PUBLIC/runtime table grants or matching default ACL; migration ledger denied. At the DB-009 checkpoint `patient_mappings` was ungranted; `PAT-002-DEC-002` later added only its exact 8-column SELECT grant |
| `TC-DB-009-PRIV-003` | P0 `patient_refs` runtime privilege inventory | Only the five approved columns have `SELECT`/`INSERT`; no table-wide or other column privilege | P0 DB security | PASS — exact five-column SELECT+INSERT inventory; no table-level privileges |
| `TC-DB-009-PRIV-004` | Direct runtime insert with valid and invalid PatientReference code | `MQ-TEST-` grammar accepted; non-synthetic value rejected by DB constraint even if application validation is bypassed | P0 synthetic-only | PASS — runtime insert/read succeeded; DB rejected non-synthetic code with CHECK violation |
| `TC-DB-009-PRIV-005` | Runtime updates/deletes/truncates a PatientReference | Mutations and truncate denied; synthetic create/read/rollback remains possible | P0 DB security | PASS — UPDATE/DELETE/TRUNCATE denied; repository round-trip rolled back |
| `TC-DB-009-PRIV-006` | Migration/bootstrap credential supplied to API runtime | Config validation rejects it; migration ledger/schema owner remains inaccessible to runtime | P0 DB security | PASS — Compose boundary validation and runtime ledger denial; API/test runtime receives only runtime URL |
| `TC-DB-009-RLS-001` | Inventory of all approved Tenant-owned/participating P0 tables | Every in-scope table has RLS enabled and forced plus explicit runtime policy; global synthetic `patient_refs` exception listed separately | P0 DB security | PASS — 16/16 protected relations ENABLE+FORCE with runtime/migrator policies; `patient_refs` excluded by decision |
| `TC-DB-009-RLS-002` | Protected query with Tenant context missing or empty | No protected row visible; protected insert fails closed; no broad fallback policy | P0 DB security | PASS — no-context reads empty; wrong-Tenant insert denied |
| `TC-DB-009-RLS-003` | Malformed Tenant context | Query/transaction fails closed; API returns fixed safe error without SQL, identifiers or context contents | P0 DB security | PARTIAL — malformed context fails at PostgreSQL cast boundary; no API authorization/error wrapper exists to test |
| `TC-DB-009-RLS-004` | Tenant A/B/C reads and writes tenant-owned rows | Each Tenant sees only own rows; wrong-tenant read empty and write denied | P0 DB security | PASS — A/B/C synthetic visibility and write-denial probes |
| `TC-DB-009-RLS-005` | A→B Exchange Session read by A, B and nonparticipant C | A/B see the participating Exchange row; C denied; visibility does not create Authorization/Grant | P0 DB + business boundary | PASS — A and B saw only the fixture exchange, C saw zero; separate business authorization remains untested |
| `TC-DB-009-RLS-006` | Transaction-local context under connection-pool reuse, commit and rollback | Context is transaction-local; after commit/rollback, next transaction on the connection has no inherited Tenant context | P0 DB security | PASS — IAM-002 same-client wrapper unit tests and runtime pool borrower integration passed; generic rollback/cleanup-failure discard tested |
| `TC-DB-009-RLS-007` | Runtime accesses a table without an approved object grant or explicit policy | Access denied; migration owner and runtime do not share ownership; no `BYPASSRLS` path | P0 DB security | PASS — at the DB-009 checkpoint `patient_mappings` and migration ledger were denied; PAT-002 later received an explicit eight-column SELECT grant, while migration ledger remains denied; catalog verified separate ownership and no bypass |
| `TC-DB-009-RLS-008` | Parameterized repository access with SQL-injection-shaped values | Values remain bound parameters; malformed injection-shaped PatientReference is rejected before SQL; raw request SQL is never executed | P0 API/DB security | PASS — repository SQL contract and invalid injection-shaped value/no-query unit test |
| `TC-DB-009-RLS-009` | Attempt to change a custom Tenant setting using arbitrary SQL as runtime | Record limitation: same-role arbitrary SQL can change setting; no prevention claim; stronger production binding required | P0 residual-risk verification | PASS — same runtime role changed context and saw the corresponding Tenant row; limitation retained |
| `TC-DB-009-AUTH-001` | Client supplies Tenant/Actor override in body, query or header | Server ignores/rejects it and uses only credential-verified identity/membership context | P0 Authorization | NOT RUN — no authenticated business endpoint |
| `TC-DB-009-AUTH-002` | Authenticated Actor is inactive, unknown or bound to another Tenant/Hospital | Protected read/write and DICOM action are denied before data disclosure/side effect | P0 Authorization | NOT RUN — IAM-002 resolver denial is accepted separately; protected business endpoint/action is not registered |
| `TC-DB-009-AUTH-003` | Session exists or Consent is active but Grant/scope/action/resource/recipient/expiry is invalid | Deny by default; no authorization inferred from RLS visibility, UUID knowledge or one successful chain element | P0 Authorization | NOT RUN — AUT-003 pure policy rules are unit-tested, but trusted DB evidence resolution, runtime privileges and the business route are not implemented |
| `TC-DB-009-AUTH-004` | RLS/Auth/Preflight failure before PACS Import | No STOW-RS call occurs; Exchange is not reported as completed; safe denial and audit evidence are produced | P0 E2E/security | NOT RUN — PACS import authorization/preflight path not implemented |

The shared `patient_refs` relation is deliberately not RLS-isolated: P0 contains only synthetic `MQ-TEST-*` references and no public patient API. The narrow `SELECT`/`INSERT` grant is a documented exception, not an authorization mechanism. `TC-PAT-001-PER-003` is PASS only for synthetic create/read/rollback; it does not claim Tenant-scoped PatientMapping, identity proof, business authorization, or API exposure.

`MEDIQ-DB-009` database privilege and RLS enforcement tests passed on disposable PostgreSQL. `MEDIQ-IAM-002` now implements and verifies backend identity-to-Tenant transaction context, but DB-009 remains PARTIAL because generic HTTP error handling and business Authorization/Preflight acceptance are not implemented. `MEDIQ-RLS-001` remains a separate proposed post-MVP hardening ticket for production-grade context binding and operational isolation, not a substitute for this P0 gate.

# P0 OIDC/JWT Authentication Middleware Acceptance — MEDIQ-IAM-001 — 2026-09-30

Normative policy: `IAM-001-DEC-001` and `TS-ADR-007`. This Ticket verifies authentication only. A verified `issuer + subject` does not establish Actor status, Tenant/Hospital membership, Patient identity, Consent, Grant, object/action Authorization, or a database Tenant transaction.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-IAM-001-AUTH-001` | Missing or malformed Authorization header on a protected route | Generic `401` deny; protected handler is not invoked; no token/claim detail is returned | P0 API security | PASS — Fastify/Nest guard integration test |
| `TC-IAM-001-AUTH-002` | Correctly signed RS256 access JWT using configured remote JWKS | Accept only exact configured issuer/audience, `typ=at+jwt`, valid expiry and subject; handler receives immutable issuer/subject only | P0 authentication | PASS — ephemeral signing key and loopback JWKS; principal contains only issuer/subject |
| `TC-IAM-001-AUTH-003` | Bad signature/key, disallowed algorithm, wrong issuer/audience/type, expired token or future `nbf`; missing required subject/expiry | Generic `401`; protected handler is not invoked; no decoded claims or cryptographic error are returned | P0 authentication/security | PASS — negative JWT matrix |
| `TC-IAM-001-AUTH-004` | Oversized token, unsupported scheme, duplicate/multiple Authorization values or malformed JWT segments | Generic `401` before JWKS lookup; no raw token is logged or returned | P0 API security | PASS — invalid/oversized forms rejected before JWKS fetch |
| `TC-IAM-001-AUTH-005` | JWKS timeout, unreachable/oversized endpoint, malformed key set, redirect or unknown `kid` | Fail closed (`401` for unknown key; generic `503` for unavailable/untrusted JWKS); no issuer URL, key material, token or upstream error is returned | P0 authentication/security | PASS — timeout, size limit, malformed/redirect/unreachable and unknown-key paths tested |
| `TC-IAM-001-AUTH-006` | Public exception and default-route coverage | Only explicitly decorated Health handlers bypass the global guard; an undecorated route requires a verified Bearer token | P0 API security | PASS — `/health/live` and `/health/ready` remain public; probe business route is guarded |
| `TC-IAM-001-AUTH-007` | OIDC configuration absent/partial or invalid by runtime profile | No configured verifier means protected routes return generic `503`; partial/invalid config fails configuration validation; operational Health remains available | P0 fail-closed configuration | PASS — absent verifier, partial/non-test HTTP, placeholder audience and health behavior tested |

Tests generate an ephemeral RSA keypair and loopback JWKS response in the test process; private key material is never written to disk or runtime configuration. Compose passes optional issuer/audience/JWKS settings to the API; when unset, protected routes remain unavailable. The Test Identity fixture does not prove an interactive OIDC Authorization Code/PKCE login provider. Runtime Actor/Tenant resolution and business Authorization remain separate `IAM-002`/`AUT-*` gates. Per-request ingress rate limiting and a configured identity provider remain deployment gates before external exposure.

# P0 Verified Actor/Tenant Context and Transaction Boundary — MEDIQ-IAM-002 — 2026-09-30

Normative policy: `IAM-002-DEC-001`, `DB-009-DEC-001`, `SEC-AUTHZ-010~011`. This Ticket establishes verified Actor/Tenant/Hospital context only. It does not decide Consent, TransferGrant, object/action Authorization, or PACS permissions. P0 is single-configured-issuer; multiple issuers require a separate identity schema decision.

The submitted Tenant identifier is an untrusted *selection candidate*, never an authority. It may scope only the membership lookup. The server must resolve an active Actor with the exact verified `external_subject` within that Tenant and require the owning Tenant and optional Hospital to be active before passing a transaction to application work.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-IAM-002-CTX-001` | Missing/invalid verified principal, wrong issuer, malformed/absent Tenant candidate | Fixed denial/unavailable result before protected query; no client-supplied actor/hospital value accepted | P0 identity boundary | PASS — unit tests reject invalid issuer/selector before pool checkout |
| `TC-IAM-002-CTX-002` | Valid exact subject + selected Tenant + active Actor/active Tenant/active optional Hospital | Context is built from Registry only: issuer, subject, actorId, tenantId, hospitalId, actorType; object is immutable | P0 identity context | PASS — unit and runtime tests resolved synthetic active A membership |
| `TC-IAM-002-CTX-003` | Unknown, suspended/inactive Actor/Tenant/Hospital or subject bound only to another Tenant | Deny; do not invoke protected callback; do not reveal which membership check failed | P0 identity security | PASS — exact active-status query contract and unknown-membership denial tested; callback not invoked |
| `TC-IAM-002-CTX-004` | Tenant candidate changed to another valid UUID; client attempts actor/hospital substitution | Candidate is accepted only when exact issuer/subject has active membership there; arbitrary Actor/Hospital IDs are ignored/not part of the resolver contract | P0 Tenant boundary | PASS — A membership accepted; B/C candidates denied; resolver takes no client Actor/Hospital fields |
| `TC-IAM-002-DB-001` | Runtime column privileges and forced RLS | Runtime has only approved column-level SELECT on Actor/Tenant/Hospital resolution fields; no INSERT/UPDATE/DELETE/DDL/table-wide grant; A/B/C RLS remains enforced | P0 least privilege | PASS — exact 11-column SELECT inventory and forced RLS catalog checks in local runtime PostgreSQL |
| `TC-IAM-002-TX-001` | Transaction resolution and callback connection | `RESET → BEGIN → transaction-local set_config → exact membership lookup → callback` uses one checked-out client; callback is unavailable before membership succeeds | P0 context binding | PASS — unit ordering/same-client tests and live runtime membership query |
| `TC-IAM-002-TX-002` | Pool borrower after successful commit | Tenant setting is absent/empty outside transaction and next borrower sees no protected Tenant rows | P0 pool isolation | PASS — runtime pool max=1 borrower observed empty context and zero Tenant rows after commit |
| `TC-IAM-002-TX-003` | Callback rollback, setup/cleanup failure, or failed rollback/reset | Rollback attempted; context cleared; unsafe client is destroyed rather than returned to pool; internal database detail is not converted into a client-visible authority | P0 fail closed | PASS — unit tests cover callback error, transaction setup error, rollback failure and reset failure; generic context errors omit DB detail |

Runtime integration uses the deterministic synthetic A/B/C registry and an ephemeral unique synthetic Actor row, created/cleaned by `scripts/test-iam-002.ps1` with the migration-only credential. The application/test runtime receives only `MEDIQ_DATABASE_URL`; no API or runtime integration-test container receives migration credentials. The test confirmed the fixture cleanup and does not leave Actor rows behind. No business route is registered by IAM-002.

# P0 Authorization Context Shape — MEDIQ-AUT-001 — 2026-09-30

Normative policy: `AUT-001-DEC-001`. This Ticket creates only an immutable, non-persistent context value object. It does not evaluate policy, return `ALLOW`, read Consent/Grant state, authorize object access, open a route, change database privileges, or permit PACS/DICOM side effects. Actor/Tenant/Hospital values must come from `VerifiedActorTenantContext`; Consent and TransferGrant references are server-resolved references, not client authority. Resource IDs are MediQ internal UUIDs, not DICOM UIDs or hospital-local IDs.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUT-001-CTX-001` | Build complete context from verified identity plus internal references | Preserve Actor/Tenant/optional Hospital/Actor type from trusted context and bind Session, Resource kind/UUID, server-selected Action, Consent UUID and Grant UUID | P0 domain | PASS — complete immutable context constructed and all fields asserted |
| `TC-AUT-001-CTX-002` | Missing/null/malformed verified Actor/Tenant context or required reference | Reject context construction; no fallback to request-supplied authority | P0 security | PASS — 13 incomplete/malformed input cases rejected with a fixed domain error |
| `TC-AUT-001-CTX-003` | Unsupported Resource kind or Action, including implicit action escalation | Reject; only `STUDY/SERIES/INSTANCE` and `VIEW/DOWNLOAD/PACS_IMPORT` are accepted | P0 security | PASS — invalid resource/action values rejected; all declared values accepted explicitly |
| `TC-AUT-001-CTX-004` | Caller mutates context or nested Resource after construction | Exposed context and nested values remain immutable and detached from mutable inputs | P0 domain/security | PASS — object and nested resource are frozen and copied |
| `TC-AUT-001-CTX-005` | Valid UUIDs, Context existence, or Consent/Grant IDs presented as proof of permission | Context creation alone produces no decision or authorization; no policy service/route/DB grant is wired by this Ticket | P0 boundary | PASS — context has no decision field; AppModule/OpenAPI/migrations unchanged and no business route wired |

AUT-001 Acceptance does not establish that referenced rows exist or that their tenant, session, resource, consent, grant, action, recipient, status, scope, and expiry agree. Those are later Authorization/Consent/Grant gates. Until they pass, protected business/image access remains denied. The separate `PAT-002-DEC-002` internal synthetic mapping read is limited to verified same-Hospital membership and does not satisfy or bypass those image-access gates.

# P0 Default-Deny Authorization Evaluator — MEDIQ-AUT-002 — 2026-09-30

Normative policy: `AUT-002-DEC-001`. This Ticket implements only the non-persistent evaluator contract. A complete `AuthorizationContext` and an installed policy are prerequisites; only the exact policy output `ALLOW` maps to `ALLOW`. Missing/invalid context, missing policy, `DENY`, unsupported output, or policy exception maps to `DENY`. Tests using a fake explicit-ALLOW policy validate the contract only; no real business policy is installed or wired to an API, database, Viewer, Download, or PACS path.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUT-002-DD-001` | Null, structurally invalid, or non-AUT-001 context | Return `DENY` before invoking policy | P0 default deny | PASS — five null, structural, copied and forged-context cases denied before policy invocation |
| `TC-AUT-002-DD-002` | No policy configured | Return `DENY`; no implicit policy or fallback allow | P0 default deny | PASS — valid context with no policy or a missing policy evaluator returns `DENY` |
| `TC-AUT-002-DD-003` | Policy explicitly returns `DENY` | Return `DENY` | P0 decision result | PASS — exact `DENY` is preserved |
| `TC-AUT-002-DD-004` | Test policy explicitly returns exact `ALLOW` for complete context | Return `ALLOW`; prove output contract only, not business authorization | P0 decision result | PASS — fake policy returns `ALLOW`; no business policy is installed |
| `TC-AUT-002-DD-005` | Policy returns `true`, null/undefined, lowercase, whitespace variant, or unknown value | Return `DENY`; truthiness or coercion never grants | P0 security | PASS — eight unsupported results returned `DENY` |
| `TC-AUT-002-DD-006` | Policy evaluation or policy access throws/rejects with an internal error | Return `DENY`; do not propagate error message in decision | P0 fail closed | PASS — synchronous throw, asynchronous rejection and throwing policy accessor returned only `DENY` |

AUT-002 does not install production rules, resolve Session/Consent/Grant/Resource rows, verify Tenant/object/Action/Recipient/expiry binding, write Audit, return a protected Resource, or expose HTTP safe-error behavior. `AT-SEC-017` remains incomplete until an API integration proves that an evaluation failure cannot return data or continue to a side effect. Actual allow rules require AUT-003 and applicable Consent/Grant Acceptance.

# P0 Object-Level Authorization Policy — MEDIQ-AUT-003 — 2026-09-30

Normative policy: `AUT-003-DEC-001`. The policy evaluates only server-resolved authorization facts supplied through an internal evidence-reader port. In this Ticket the port is not backed by PostgreSQL, is not registered in Nest, and is not called by a protected API. Unit-test `ALLOW` proves rule behavior only; it does not prove evidence provenance, endpoint authorization, data non-disclosure, Audit, or side-effect prevention. `AT-SEC-003` remains `NOT RUN` until a protected HTTP object route exists and is integration-tested.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUT-003-OBJ-001` | Complete matching synthetic Session/Consent/Grant/Resource evidence for each P0 Action | `ALLOW` only for exact `VIEW→study:view`, `DOWNLOAD→study:download`, `PACS_IMPORT→study:pacs-transfer` pair | P0 policy | PASS — all three exact pairs pass through `AuthorizationEngine` |
| `TC-AUT-003-OBJ-002` | Missing evidence, missing nested record, malformed IDs/dates/statuses, unsupported enum, absent transaction scope, or resolver failure | `DENY`; no partial or fallback allow | P0 security | PASS — incomplete/missing facts, forged Context, missing DB transaction, rejected resolver and throwing evidence all deny |
| `TC-AUT-003-OBJ-003` | Session ID, patient, source/destination mismatch; pre-authorization or terminal state; expired session | `DENY` | P0 BOLA/lifecycle | PASS — all binding mismatches, six disallowed states and expired/invalid/missing Session expiry deny |
| `TC-AUT-003-OBJ-004` | Consent ID/session/patient/source/destination mismatch; non-ACTIVE/withdrawn, missing/future issue time, or expired consent | `DENY`; nullable consent expiry means no scheduled expiry only while other validity checks pass | P0 consent binding | PASS — mismatch/status/time/withdrawal cases deny; valid non-expiring Consent passes |
| `TC-AUT-003-OBJ-005` | Consent lacks the exact requested action, has invalid P0/P1/duplicate actions, or its optional Package differs | `DENY` | P0 action/resource binding | PASS — missing/unknown/duplicate and mixed `MOBILE_EXPORT` actions plus wrong Package deny; exact optional Package binding tested |
| `TC-AUT-003-OBJ-006` | Grant ID/session/Consent mismatch or Consent is not the one bound to the Grant | `DENY` | P0 grant binding | PASS — wrong Grant ID, Session and Consent link deny |
| `TC-AUT-003-OBJ-007` | Wrong recipient Tenant/Hospital/Actor; nullable actor recipient with a different Hospital membership | `DENY`; null actor is hospital-scoped only to the exact verified destination membership | P0 recipient binding | PASS — wrong Tenant/Hospital/Actor and missing/different Context Hospital deny; hospital-level Grant only allows exact destination |
| `TC-AUT-003-OBJ-008` | Grant status not ACTIVE, revoked, issue time missing/future, expiry missing/past, or invalid interval | `DENY`; valid interval is `issuedAt <= now < expiresAt` | P0 expiry/revocation | PASS — all tested invalid Grant status/revocation/time cases deny, including exact expiry boundary |
| `TC-AUT-003-OBJ-009` | Scope missing, wrong, broader/unknown, or P1 `MOBILE_EXPORT` action | `DENY`; no scope/action coercion | P0 least privilege | PASS — missing/wrong/P1/unknown scope and Grant-over-Consent scope escalation deny; Context rejects P1 action |
| `TC-AUT-003-OBJ-010` | Resource kind/ID not exact or resolver cannot prove its parent Study/package belongs to this Session/Patient/Source | `DENY`, including unbound SERIES/INSTANCE | P0 object binding | PASS — mismatched IDs/kind/parent/session/patient/source/package deny; resolved SERIES/INSTANCE positive binding passes |
| `TC-AUT-003-OBJ-011` | Package missing/unknown state, not `AVAILABLE` or `IN_EXCHANGE`, deleted, or retention expired | `DENY` | P0 resource lifecycle | PASS — six disallowed states, deletion, expired/malformed retention deny |
| `TC-AUT-003-OBJ-012` | Grant Package is null/mismatched; Consent package differs; package-level grant versus session-wide expansion | `DENY`; P0 Grant must name the exact non-null Package, and a Session-level Consent may only be narrowed by that Grant | P0 package scope | PASS — null/mismatched Grant Package denies; session-level Consent narrowed by exact Grant and exact package-level Consent binding are verified |

The evidence reader contract requires a request-scoped client supplied by application work running inside IAM-002's verified Actor/Tenant transaction; its implementation must resolve facts from server-owned identifiers in a consistent read. This pure policy Ticket does not add PostgreSQL privileges or make the resolver trustworthy by type alone. Even a policy `ALLOW` is only one precondition: PACS import still requires Mandatory Preflight, integrity/provenance/destination checks, audit, and the downstream side-effect Gate. The focused AUT-003 policy suite now passes 88 tests; HTTP BOLA `AT-SEC-003`, live DB/RLS evidence resolution and protected-data/side-effect integration remain `NOT RUN`.

# P0 Authorization-gated Application Orchestration — MEDIQ-AUT-004

Normative decision: `AUT-004-DEC-001`. Requirements: `REQ-AUT-003`, `SEC-AUTHZ-003`, and `SEC-ERR-003`. This scoped Acceptance tests only the internal executor: it consumes an IAM-002 verified identity callback, evaluates policy on the same transaction client, and invokes a protected application callback only for exact `ALLOW`. The executor is not registered in `AppModule` and has no HTTP, evidence-reader, database-grant, Viewer, Download, DICOMweb, PACS, or Audit wiring.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUT-004-APP-001` | Context is missing, malformed/unissued, built for a different verified identity, or context factory fails | Fixed deny/unavailable error; policy and operation callback are not invoked | P0 application fail closed | PASS — malformed/forged context, identity mismatch, absent policy and dependency error paths are covered |
| `TC-AUT-004-APP-002` | Policy returns DENY, malformed/non-exact output, or evaluation throws | Deny or fixed unavailable error; protected callback is not invoked | P0 decision boundary | PASS — DENY, unsupported results, absent policy and policy rejection covered |
| `TC-AUT-004-APP-003` | Policy returns exact ALLOW | Exactly one decision precedes exactly one callback; policy and callback receive the same IAM-002 transaction client | P0 orchestration order | PASS — synthetic IAM-002 port contract verifies call order/scope identity; no live policy evidence is implied |
| `TC-AUT-004-APP-004` | IAM or protected operation throws an unexpected internal error | No callback before authorization; operation errors map to a fixed safe error without internal detail | P0 error boundary | PASS — IAM and operation exception normalization tested |

# P0 Authorization Fail-Closed HTTP Integration — MEDIQ-AUT-004 — pending

The following original HTTP Acceptance cases remain open. They must not be marked PASS based on the application executor tests above.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUT-004-FC-001` | Missing/malformed Context, missing evaluation scope, policy/resolver exception, or unavailable authorization dependency | Fixed generic HTTP deny/unavailable response; no internal error/DB detail; protected handler is not invoked | P0 API fail closed | NOT RUN — no protected business route or trusted evidence reader |
| `TC-AUT-004-FC-002` | Evaluator returns `DENY` for a valid request context | Generic 403/404 policy response with no protected resource body or metadata; resource-return callback is not invoked | P0 BOLA/data non-disclosure | NOT RUN — no protected route |
| `TC-AUT-004-FC-003` | Any deny/error path before Viewer, Download, DICOMweb, or PACS operation | Real downstream callbacks are not invoked; no product state reports success | P0 side-effect boundary | NOT RUN — no business operation route |
| `TC-AUT-004-FC-004` | Protected operation executes after policy evaluation | Exactly one decision is required before callback; only exact `ALLOW` on the same live IAM-002 transaction may invoke the operation | P0 HTTP/integration orchestration | NOT RUN — no integrated route, PostgreSQL evidence reader, or business operation |

Application `PASS` does not establish HTTP status/body mapping, `AT-SEC-003` (real object-ID BOLA), `AT-SEC-017` HTTP error behavior, live Consent/Grant enforcement, endpoint data non-disclosure, PACS side-effect prevention, Audit, or product access. Keep protected routes and every unapproved runtime grant closed until those gates have separate implementation and Acceptance evidence; the PAT-002 internal grant is only the separately approved eight-column synthetic read boundary.

---

# P0 PostgreSQL Authorization Evidence Reader — MEDIQ-AUT-005

Normative recommendation: `AUT-005-DEC-001`. This Ticket implements only an internal PostgreSQL adapter over existing schema. It uses exact column-level `SELECT` and one parameterized query on the same IAM-002 transaction client. The data model currently proves `STUDY` binding only; unsupported `SERIES`/`INSTANCE` return no evidence. Test fixtures are synthetic and are inserted only into the disposable DB-008 scratch database. No HTTP route, patient mapping access, DICOM UID/payload, PACS side effect or product authorization claim is included.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-AUT-005-DB-001` | Runtime privilege catalog at AUT-005 execution | At that checkpoint exactly 62 column privilege rows: 10 synthetic `patient_refs`, 11 IAM identity, and 41 evidence SELECT; no table-wide, PUBLIC, default, evidence write, or runtime DDL privilege | P0 least privilege | PASS — AUT-005 execution snapshot verified the exact 62-row set; PAT-002-DEC-002 later adds only eight mapping SELECT columns, and `TC-PAT-002-DB-001` verifies the current 70-row set |
| `TC-AUT-005-DB-002` | Exact matching Study evidence for VIEW, DOWNLOAD, PACS_IMPORT | Real `mediq_runtime` + IAM-002 context + actual policy returns `ALLOW` only for matching synthetic facts; same `PoolClient` is used | P0 server evidence | PASS — all three actions passed actual executor→engine→policy→PostgreSQL reader; protected callback received the same checked-out client |
| `TC-AUT-005-DB-003` | Missing joined evidence or wrong Session/Consent/Grant/Study IDs | Reader returns no usable facts and policy `DENY`; no fallback and no callback | P0 fail closed/BOLA | PASS — all four wrong-ID probes returned fixed denial before callback; unit contract covers absent/ambiguous rows |
| `TC-AUT-005-DB-004` | Revoked/expired Grant, withdrawn Consent, malformed or unsupported policy evidence | Policy `DENY`; database query never widens scope | P0 object/action binding | PASS — actual PostgreSQL revoked Grant, expired Grant and withdrawn Consent denied; AUT-003 policy regression covers action/scope/package mismatch and unsupported facts |
| `TC-AUT-005-DB-005` | Tenant A source, Tenant B destination, Tenant C nonparticipant | Bilateral rows may be visible to A/B but only the exact authorized recipient may proceed; C receives no evidence | P0 Tenant boundary | PASS — B exact recipient allowed; A could resolve bilateral evidence but policy denied; C RLS produced no facts and denied |
| `TC-AUT-005-DB-006` | `SERIES` or `INSTANCE` context with no persisted child mapping | Reader returns null without issuing a query; policy denies | P0 resource boundary | PASS — both unsupported resource kinds denied without a persistence query |
| `TC-AUT-005-DB-007` | Reader query failure, denial cleanup and runtime pool reuse | Policy fails closed; transaction cleanup leaves no Tenant context for next borrower | P0 failure/pool isolation | PASS — reader/policy unit failures deny; live denial paths invoked no protected callback and the reused max-one pool client had no Tenant context or visible Session |

AUT-005 database tests ran against disposable scratch databases with synthetic registry/evidence only. They do not validate HTTP response safety, AT-SEC-003/017, revocation races after decision, Viewer/Download/PACS effects, Audit, Integrity/Provenance or complete P0 E2E. PAT-002 runtime mapping permission is covered separately by `TC-PAT-002-TEN-001~002`, `SEC-001~003` and `DB-001`; its internal scope does not close the other gates.

---

# P0 Exchange Creation API Acceptance — MEDIQ-EXC-003 — 2026-09-30

Normative recommendation: `EXC-003-DEC-001`. The route creates only a synthetic request record. Authentication, verified destination-Hospital membership, retry idempotency, transactional creation Audit, and exact database grants are in scope. It does not create Consent/Grant or authorize image access. The `X-Tenant-ID` header is only an untrusted membership selector, and `Idempotency-Key` is not a credential. Study UID input is deliberately absent until a separate approved study-selection/package workflow exists.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-EXC-003-API-001` | Missing/malformed Bearer credential or missing/malformed tenant/idempotency header | Fixed 400/401 response; no membership-dependent Session/Audit write; no body or DB detail | P0 HTTP/Auth | PARTIAL — missing Bearer is denied by controller guard; invalid idempotency is rejected by service test; full malformed-header HTTP matrix pending |
| `TC-EXC-003-API-002` | OIDC verifier, Actor/Tenant resolver or PostgreSQL unavailable | Generic 503; no Session; no internal URL, SQL, credential or driver detail | P0 fail closed | PARTIAL — unavailable verifier HTTP test passes; live DB outage response not exercised |
| `TC-EXC-003-API-003` | Active verified `USER` at Hospital B creates request from A to B with active synthetic `MQ-TEST-*` reference | `201`, `REQUESTED`; requester comes from verified identity; one Session and one success Audit commit atomically | P0 functional | PARTIAL — controller and service unit tests plus real PostgreSQL application/RLS integration pass; no single live HTTP→DB/OIDC request |
| `TC-EXC-003-API-004` | `SERVICE`, tenant-only membership, inactive/unknown membership, or verified Hospital differs from destination | Generic deny; no Session; caller values do not override verified Actor/Tenant/Hospital | P0 AuthZ/Tenant | PASS — service denies SERVICE/tenant-only/wrong Hospital before PatientReference read; live synthetic wrong-destination requester denied |
| `TC-EXC-003-API-005` | Malformed UUID, same source/destination, inactive/missing PatientReference, blank/over-limit purpose, extra field or non-empty Study UID attempt | Fixed validation denial; no Session/Audit or image side effect; no request value echoed in errors | P0 validation | PARTIAL — malformed key, blank purpose, unsupported Study UID and inactive reference tested; full malformed UUID/equal hospital/over-limit matrix pending |
| `TC-EXC-003-API-006` | Same verified Actor, same idempotency key and identical request; sequential retry | Return the original Session result; exactly one Session and one `SESSION_CREATED` Audit | P0 retry safety | PASS — unit and real PostgreSQL integration return the original Session; duplicate success Audit is not emitted |
| `TC-EXC-003-API-007` | Same verified Actor/key with a different Patient/Source/Destination/Purpose | Fixed `409` conflict; original Session unchanged; no second Session or success Audit | P0 retry safety | PASS — changed-purpose reuse returns fixed conflict; original database row remains unchanged |
| `TC-EXC-003-API-008` | Concurrent identical requests with same Actor/key | Exactly one Session and one creation Audit; every successful response identifies the same Session | P0 concurrency | PARTIAL — UNIQUE constraint and sequential replay pass; actual simultaneous API calls not executed |
| `TC-EXC-003-API-009` | Session insert or uniqueness/persistence failure | Generic safe error; transaction leaves no Session and no Audit | P0 failure atomicity | PARTIAL — database uniqueness conflict path is handled; injected Session-write failure through live HTTP is pending |
| `TC-EXC-003-API-010` | Audit insert fails after Session insert was attempted | Transaction rolls back both; response is generic unavailable; no un-audited Session | P0 audit atomicity | PASS — unit failure injection and live RLS-denied Audit insert both rollback the Session |
| `TC-EXC-003-API-011` | Inspect Session creation result and downstream callback probes | Session ID/state alone grants no Consent, Authorization, Grant, Viewer, Download, DICOM, or PACS operation | P0 scope boundary | PASS — response contains only request metadata; no Consent/Grant/Viewer/PACS operation is wired by this Ticket |
| `TC-EXC-003-API-012` | Every rejected/unavailable HTTP path | Exact allowlisted status/error code only; no patient code, hospital detail, SQL, stack, token or credential leakage | P0 HTTP safe error | PARTIAL — fixed validation/authentication error mapping tests pass; full live dependency-error matrix pending |
| `TC-EXC-003-DB-001` | Runtime privilege catalog after migration | Exactly 100 column-privilege rows: existing 70 + 6 additional Session SELECT + 12 Session INSERT + 12 Audit INSERT; no table-wide/PUBLIC/default/DDL/UPDATE/DELETE/TRUNCATE | P0 least privilege | PASS — exact 100-row inventory verified in all three disposable scratch cycles and after local migration; exact Session/Audit column groups confirmed |
| `TC-EXC-003-DB-002` | Destination Tenant B Session/Audit write and unrelated Tenant C visibility | Verified destination USER can create request metadata; Tenant C cannot see the Session; Audit remains insert-only to runtime | P0 Tenant RLS | PASS — destination-B create and Session/Audit insert succeed, Tenant C Session read is null, and forced RLS is retained; Audit SELECT is denied by grant |
| `TC-EXC-003-DB-003` | Unique `(requester_actor_id, idempotency_key)` under simultaneous insert | Database guarantees one row per verified Actor/key | P0 idempotency | PARTIAL — schema UNIQUE constraint and sequential runtime retry pass; concurrent insertion race not directly invoked |
| `TC-EXC-003-DB-004` | Same key replay versus changed request binding | Exact replay resolves existing row; changed request returns conflict without mutation | P0 idempotency | PASS — real PostgreSQL insert/replay/conflict and unchanged-row readback pass |
| `TC-EXC-003-DB-005` | Session + Audit transaction success/failure | Both persist or neither persists, including injected Audit failure and rollback | P0 audit integrity | PASS — successful creation persists both; RLS-denied Audit insert rolls back Session; service failure-injection unit test passes |
| `TC-EXC-003-DB-006` | Runtime privilege/RLS negative probes | No Session update/delete/truncate/DDL or Audit update/delete; nonparticipant tenant cannot read inserted rows | P0 least privilege/security | PASS — exact grants plus direct Session UPDATE/Audit DELETE denial and unrelated-Tenant read denial verified; no DDL/table-wide grants in catalog |

The Ticket-specific Acceptance may pass while `GATE-IMP-04` remains `NOT EXECUTED`. GET Session BOLA, Consent/Grant workflow, study selection, DICOMweb, PACS preflight/transfer, destination verification, integrity/provenance, and end-to-end A→B remain independent gates.

---

# P0 ConsentArtifact Domain Acceptance — MEDIQ-CON-001

Normative policy: `CON-001-DEC-001`. This Ticket implements an immutable synthetic P0 domain value only. It does not implement Consent transitions, legal consent, API, persistence/version allocation, Audit, authorization, TransferGrant, or any protected resource operation. A domain snapshot or `ACTIVE` status is not permission; `SEC-CONSENT-001~004` remain integration gates.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-001-DOM-001` | Create a Consent from valid UUID context references and supplied positive version | Generate a fresh UUID; `PENDING`, `issuedAt=null`, `withdrawnAt=null`; preserve exact session/patient/source/destination/package/actions/time | P0 domain | PASS — unique IDs, defaults and context preservation verified |
| `TC-CON-001-DOM-002` | Reconstitute each existing Consent status | Accept only `PENDING`, `ACTIVE`, `WITHDRAWN`, `EXPIRED`, `REJECTED`; preserve valid snapshot | P0 domain | PASS — all five schema statuses accepted; unsupported values denied |
| `TC-CON-001-DOM-003` | Required IDs malformed or Source equals Destination | Reject fixed `CONSENT_ARTIFACT_INVALID`; normalize accepted UUID strings to lowercase | P0 domain/security | PASS — malformed IDs and same Hospital rejected; UUIDs canonicalized |
| `TC-CON-001-DOM-004` | Empty, duplicate, unsupported, or P1 `MOBILE_EXPORT` action set | Reject; accept one or more unique P0 `VIEW`, `DOWNLOAD`, `PACS_IMPORT` actions | P0 action boundary | PASS — empty, duplicate, unknown and P1 actions denied |
| `TC-CON-001-DOM-005` | Optional Imaging Package resource scope | Accept null Session-level scope or exact valid UUID; reject malformed package ID; null scope does not create permission | P0 resource scope | PASS — null/exact package shape verified; no permission operation exists |
| `TC-CON-001-DOM-006` | Consent version is zero, negative, fractional, unsafe integer, or malformed | Reject; accept only positive safe integer supplied by the caller | P0 domain/version shape | PASS — positive version accepted; zero/negative/fraction/NaN/infinite/unsafe values denied |
| `TC-CON-001-DOM-007` | Invalid timestamp, `updatedAt < createdAt`, mutation of input/output Date or actions | Reject malformed chronology; use detached immutable values and defensive Date getters | P0 domain integrity | PASS — invalid timestamps/order denied; date/action state detached and frozen |
| `TC-CON-001-DOM-008` | Domain creation/reconstitution presented as legal consent or access authorization | Domain exposes no approval/withdrawal transition or authorization decision; new object always `PENDING`; no API, DB, Audit, Grant or side effect is wired | P0 technical-consent boundary | PASS — object remains PENDING and exposes neither approve nor authorize behavior |

`REQ-CON-003/004`, `SEC-CONSENT-001~004`, `AT-FUNC-005~007`, `AT-SEC-005~007`, version concurrency and the approval/withdrawal lifecycle remain unimplemented and must not be inferred from these domain tests.

---

# P0 Synthetic Consent Persistence Acceptance — MEDIQ-CON-002

Normative policy: `CON-002-DEC-001`. This Ticket persists only synthetic technical Consent snapshots using the existing DB-005 schema. New rows must always be `PENDING`; no route, permanent Consent write privilege, patient identity proof, legal-consent claim, approval/withdrawal transition, authorization decision, Grant or protected resource side effect is in scope. All PostgreSQL integration grants are temporary in the disposable DB-008 scratch database and must be removed with the current 100-column-privilege baseline restored.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-002-DB-001` | Persist/reconstitute a valid synthetic Consent and its action set | Same Tenant transaction returns exact immutable snapshot; status `PENDING`, `issuedAt=null`, `withdrawnAt=null`; persisted version starts at 1; action rows are complete | P0 repository/PostgreSQL | PASS — synthetic PostgreSQL round-trip, PENDING/null timestamps, action set and version 1 verified |
| `TC-CON-002-DB-002` | Create sequential Consent snapshots for one Session and for a second Session | One Session receives distinct increasing versions; a different Session starts at version 1; no version is caller-selected | P0 version allocation | PASS — sequential allocation and independent Session version verified |
| `TC-CON-002-DB-003` | Concurrent creates for one Session on separate verified transactions | Versions are unique and contiguous for successful requests; DB session/version UNIQUE remains the final integrity guard; no lost/duplicate version | P0 concurrency/PostgreSQL | PASS — 12 concurrent same-Session requests yielded unique contiguous versions |
| `TC-CON-002-DB-004` | Missing/invisible Session, or Patient/Source/Destination context differs from server-owned Session | Fixed persistence denial; no Consent or action row is written; no patient-local identifier or SQL detail is returned | P0 binding/fail-closed | PASS — absent/invisible Session, mismatched binding and unsupported action denied without writes |
| `TC-CON-002-DB-005` | Action persistence fails after parent Consent insert | Entire surrounding transaction rolls back; neither parent nor child action rows remain | P0 atomicity | PASS — induced child uniqueness failure rolled back parent and child rows |
| `TC-CON-002-DB-006` | Read under source/destination participant, unrelated Tenant, and absent Tenant context | Existing Session RLS determines row visibility; unrelated/no-context reads expose no Consent; write without valid context fails; RLS visibility is not Authorization | P0 Tenant boundary | PASS — participant visibility followed existing RLS; unrelated/no-context visibility and write were denied |
| `TC-CON-002-DB-007` | Temporary privilege inventory during and after scratch Acceptance | Baseline already has `consents` SELECT 10 and `consent_actions` SELECT 2. Scratch adds SELECT on the remaining 3/1 columns and INSERT on all 13/3 columns, yielding effective per-table SELECT/INSERT 13/13 and 3/3 (inventory 120); no table-wide/PUBLIC/default/DDL/UPDATE/DELETE/TRUNCATE; cleanup restores exact 100-row baseline | P0 least privilege | PASS — exact effective column privileges, 120-row scratch inventory, and 100-row baseline restoration verified |

Atomic version assignment uses the transaction-scoped Session advisory lock specified in `CON-002-DEC-001`, then reads the next RLS-visible version and relies on the existing unique constraint as the final guard. These tests do not prove API, live OIDC, legal consent, patient identity, approval, withdrawal, Audit completeness, Authorization, Grant, PACS, Viewer, Download or any `SEC-CONSENT-001~004` operation-level enforcement. `GATE-IMP-05` remains open until its full workflow and security Acceptance pass.

# P0 Consent Request API Acceptance — MEDIQ-CON-003

Normative policy: `CON-003-DEC-001`. This Ticket implements only the authenticated hospital-side creation of a synthetic technical Consent request. It does not implement patient approval, withdrawal, Grant issuance, image access or legal-consent evidence.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-003-API-001` | Verified destination USER who created a `REQUESTED` Session submits valid P0 actions | `201`; server-derived Patient/Source/Destination; one `PENDING` Consent; Session becomes `CONSENT_PENDING`; one `CONSENT_REQUESTED` Audit; no Grant or image side effect | P0 API + PostgreSQL | PASS — signed OIDC HTTP request persisted atomically; no authorization or PACS side effect |
| `TC-CON-003-API-002` | Missing/invalid token, inactive Actor, SERVICE Actor, wrong Tenant/Hospital, non-requester Actor or cross-Tenant/invisible Session | Generic 401/403/503 as applicable; no Consent/action/Session/Audit write; no data or existence leak | P0 AuthN/Tenant/object boundary | PASS — unauthenticated, invalid/inactive/service/wrong-scope/non-requester/cross-Tenant denials verified |
| `TC-CON-003-API-003` | Unknown body field, missing/empty/duplicate/unsupported action, malformed UUID or invalid date-time | Fixed 400; zero writes; request body values and SQL details not echoed | P0 input validation | PASS — malformed/unknown/duplicate/unsupported request inputs rejected without writes |
| `TC-CON-003-API-004` | Session not `REQUESTED`, expired Session, mismatched/unavailable/deleted/expired ImagingPackage, or Consent expiry after Session expiry | Fixed 409 (invalid syntax remains 400); zero writes; no PACS/DICOM call | P0 state/resource binding | PASS — invalid Session/package/expiry bindings rejected without writes or PACS calls |
| `TC-CON-003-API-005` | Exact semantic retry while Session is `CONSENT_PENDING` with one matching PENDING Consent | Existing Consent re-returned with replay indicator; no new version, action, Session transition or Audit | P0 retry safety | PASS — concurrent identical retry reused the pending request and created no duplicate rows/Audit |
| `TC-CON-003-API-006` | Retry while pending uses a different action/scope/expiry, or existing PENDING state is absent/ambiguous | Fixed 409; no row changes | P0 retry conflict | PASS — changed semantic body and inconsistent pending state conflict without mutation |
| `TC-CON-003-API-007` | Inject Consent insert/action insert/Session optimistic update/Audit insert or transaction commit failure | Full transaction rollback; no partial Consent/action/session/audit state | P0 atomicity/fail closed | PASS — all five injected failure points rolled back the full transaction |
| `TC-CON-003-API-008` | Run actual HTTP request with signed synthetic OIDC/JWKS and disposable PostgreSQL; inspect other Tenant and no-context reads | Valid request passes; invalid auth/context denied; RLS hides rows; response has no PHI/credential/SQL detail; endpoint never calls PACS | P0 API/DB integration | PASS — actual Fastify/Nest HTTP + signed synthetic OIDC/JWKS + PostgreSQL/RLS; no-context/cross-Tenant isolation and safe response verified |
| `TC-CON-003-API-009` | Inspect runtime catalog after migration | Exact effective inventory 122 rows: prior 100 plus Consent/action SELECT/INSERT and Session state/timestamp UPDATE; no table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE or other UPDATE; RLS forced | P0 least privilege | PASS — exact 122 effective column grants and forced RLS; forbidden broad/mutation privileges absent |

The approved request API contract `AT-FUNC-005` additionally requires HTTP 201, Consent `PENDING`, Session `CONSENT_PENDING`, and a `CONSENT_REQUESTED` Audit. A successful request is not patient approval or Authorization. `REQ-CON-003` (`No Consent → Grant DENY`) and `SEC-CONSENT-001~004` remain independently unproven by this Ticket.

# P0 Synthetic Consent Approval API Acceptance — MEDIQ-CON-004

Normative policy: `CON-004-DEC-001`. This Ticket activates only a synthetic technical Consent using a PatientReference assertion from a verified signed OIDC token. It is not legal consent, patient identity proof, Authorization, Grant, or protected image access.

Approval API: `POST /exchange-sessions/{sessionId}/consents/{consentId}/approve`. It has no request body. The sole synthetic PatientReference source is the verified JWT `mediq_patient_ref_id` claim; caller-provided body/header/query/UI values cannot substitute for it. The Actor must resolve as an active `USER` with `hospital_id IS NULL`, must not be the Session requester, and must operate in a Tenant context where the Session is visible under existing forced RLS.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-004-API-001` | Trusted signed synthetic Patient claim matches Session + unique unexpired PENDING Consent; eligible tenant-level USER approves | `200`; Consent `ACTIVE` + `issuedAt`; Session `CONSENTED`; one `CONSENT_APPROVED` Audit; no Grant/image/PACS effect | P0 HTTP + PostgreSQL/RLS | PASS |
| `TC-CON-004-API-002` | Claim absent, malformed, or does not match server-owned PatientReference | Deny with safe fixed response; no Consent/Session/Audit write; client-supplied identifiers are ignored/rejected | P0 synthetic principal binding | PASS |
| `TC-CON-004-API-003` | Hospital-bound USER, SERVICE/inactive Actor, or same Actor as Session requester attempts approval | Deny; no protected write or Audit | P0 actor separation | PASS |
| `TC-CON-004-API-004` | Cross-Tenant/invisible Session, Session/Consent IDs do not pair, or object missing | Generic deny without resource-existence leak; no write | P0 Tenant/BOLA boundary | PASS |
| `TC-CON-004-API-005` | Session not `CONSENT_PENDING`, Consent not `PENDING`, Consent/Session expired, or state pair inconsistent | Fixed conflict/deny; no write | P0 state/expiry fail-closed | PASS |
| `TC-CON-004-API-006` | Same verified patient retries after the matching Session/Consent transition has committed | Existing `ACTIVE`/`CONSENTED` result replayed; no second Audit or state change | P0 retry safety | PASS |
| `TC-CON-004-API-007` | Two identical approval requests race on the same Session | Session advisory lock serializes; one state transition and one approval Audit; second returns replay | P0 concurrency | PASS |
| `TC-CON-004-API-008` | Inject failure at Consent UPDATE, Session transition, Audit INSERT, or transaction COMMIT | Entire Consent/Session/Audit transaction rolls back; no partial approval state | P0 atomicity | PASS |
| `TC-CON-004-API-009` | Runtime privilege catalog after additive migration | Exact 125 allowed column grants (122+3 Consent UPDATE); no table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE/other UPDATE; forced RLS remains | P0 least privilege | PASS |
| `TC-CON-004-API-010` | Try to override signed patient claim using body, query, correlation or tenant selector; issuer/audience/signature invalid | No claim override; invalid bearer rejected, unauthorized claim denied; no write | P0 assertion source / token trust | PASS |

`AT-FUNC-006` is satisfied only as a synthetic state transition when `TC-CON-004-API-001~010` pass. It does not satisfy no-Consent Grant denial (`REQ-CON-003`/`SEC-CONSENT-001`), actual patient identity proof, informed/legal consent, or `GATE-IMP-05` by itself.

# P0 Synthetic Consent Withdrawal API Acceptance — MEDIQ-CON-005

Normative policy: `CON-005-DEC-001`. The endpoint records only synthetic technical withdrawal. Its patient reference comes exclusively from a verified signed OIDC `mediq_patient_ref_id` claim. The actor must be an active tenant-level `USER` without Hospital binding and must differ from the Session requester. The server must bind visible Session and Consent IDs, both stored PatientReferences and the verified claim inside the same Tenant/RLS transaction. Request body, query, arbitrary patient-reference header or UI state cannot supply the identity.

API: `POST /exchange-sessions/{sessionId}/consents/{consentId}/withdraw` with no body. Successful Consent update and Audit are one atomic transaction under the Session advisory lock. Expired Consent/Session and terminal Session state do not prevent withdrawal of a still-`ACTIVE` Consent. This ticket does not mutate Session/Grant/PACS/image state or recall already-delivered data.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-005-API-001` | Signed synthetic patient claim exactly matches an ACTIVE Consent and its Session; eligible patient actor withdraws | `200`; Consent `WITHDRAWN`, `withdrawnAt` set; exactly one `CONSENT_WITHDRAWN` Audit; no other domain side effect | P0 HTTP + PostgreSQL/RLS | PASS — signed OIDC/JWKS integration |
| `TC-CON-005-API-002` | Missing claim, malformed UUID claim or claim for another patient | Fixed safe denial; no Consent/Audit write | P0 assertion source | PASS — denial/no write |
| `TC-CON-005-API-003` | Invalid signature/issuer/audience/expiry or malformed bearer token | Authentication rejects before withdrawal; no data write | P0 AuthN | PASS — endpoint malformed-token HTTP test + IAM-001 signed-token negative matrix |
| `TC-CON-005-API-004` | Hospital-bound USER, SERVICE/inactive Actor or Session requester attempts withdrawal | Deny; no Consent/Audit write | P0 actor separation | PASS — requester/SERVICE/Hospital endpoint denials; inactive membership IAM-002 gate |
| `TC-CON-005-API-005` | Cross-Tenant/invisible Session, mismatched Session/Consent IDs or PatientReference binding | Generic deny without existence disclosure; no write | P0 Tenant/BOLA | PASS — cross-tenant and exact-object binding denials |
| `TC-CON-005-API-006` | Consent is PENDING, EXPIRED or REJECTED, or status/timestamp invariants are inconsistent | Fixed conflict/deny; no Consent/Audit write | P0 state validation | PASS — 409/no withdrawal mutation |
| `TC-CON-005-API-007` | Consent status is ACTIVE but Consent or Session expiry has passed, or Session is terminal | Withdrawal remains available; exact Consent update and one Audit commit; Session state remains unchanged | P0 withdrawal availability | PASS — expired Consent/Session, terminal `FAILED` Session |
| `TC-CON-005-API-008` | Same verified patient repeats a committed withdrawal | Existing WITHDRAWN result replayed; no second Audit or timestamp/state change | P0 retry safety | PASS — stable timestamp/Audit count |
| `TC-CON-005-API-009` | Two identical withdrawal requests race for one Session | Session advisory lock serializes; one transition and one Audit; other response is replay | P0 concurrency | PASS — concurrent HTTP replay |
| `TC-CON-005-API-010` | Inject Consent UPDATE, Audit INSERT or COMMIT failure | Entire transaction rolls back; Consent remains ACTIVE with null withdrawnAt; no withdrawal Audit | P0 atomicity | PASS — three fault-injected rollback cases |
| `TC-CON-005-API-011` | Inspect runtime privilege catalog after additive migration | Exactly 126 allowed column grants (125+`consents.withdrawn_at` UPDATE); no table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE/other UPDATE; forced RLS remains | P0 least privilege | PASS — exact catalog and forced RLS |
| `TC-CON-005-API-012` | Body, query, or `x-patient-ref-id` attempts to override the signed claim | Fixed 400; no state/Audit write | P0 input validation | PASS — all three override paths |
| `TC-CON-005-API-013` | Inspect Session, Grant, PACS and transfer state after withdrawal/replay | Session and existing external data are not changed; endpoint invokes no Grant/image/PACS operation; no remote-recall claim | P0 non-interference boundary | PASS — unchanged Session/no Grant row/no external dependency; no remote-recall claim |

`AT-FUNC-007` passes only for this synthetic technical state transition after all applicable cases above pass. `SEC-CONSENT-002` Grant denial and subsequent Authorization re-evaluation remain separate checks (`AT-SEC-006`, AUT/GRT integration); no legal withdrawal, patient notification or offline-copy revocation is claimed.

# P0 Consent Allowed Action Policy Acceptance — MEDIQ-CON-006

Normative policy: `CON-006-DEC-001`. These tests cover only the pure P0 Authorization policy over supplied synthetic evidence. They do not prove Grant issuance, trusted database evidence resolution, HTTP BOLA, protected data non-disclosure, Viewer/Download/PACS side-effect prevention, or P0 end-to-end transfer. `MOBILE_EXPORT` remains a P1 capability and is never a valid P0 Authorization Action.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-006-AUTH-001` | Each P0 Action has an exact matching Consent Action and its one exact Grant Scope | `ALLOW` only for `VIEW↔study:view`, `DOWNLOAD↔study:download`, `PACS_IMPORT↔study:pacs-transfer` when all other policy evidence is valid | P0 pure policy | PASS — all three exact action/scope pairs through `AuthorizationEngine` |
| `TC-CON-006-AUTH-002` | Requested P0 Action is missing from Consent actions | `DENY`; no fallback or scope coercion | P0 pure policy | PASS — absent Action denied for each P0 action |
| `TC-CON-006-AUTH-003` | Consent actions contain `MOBILE_EXPORT` alongside an otherwise valid requested P0 Action | `DENY` for malformed P0 action evidence | P0 P1-boundary enforcement | PASS — `VIEW` plus `MOBILE_EXPORT` denied |
| `TC-CON-006-AUTH-004` | Consent actions contain an unknown or duplicate value | `DENY` | P0 fail-closed evidence validation | PASS — unknown `ADMIN` and duplicate `VIEW` denied |
| `TC-CON-006-AUTH-005` | Grant has mismatched, unknown, P1, duplicate, or additional scope not represented by Consent actions | `DENY`; all Grant scopes must be supported by the exact Consent action set | P0 scope containment | PASS — wrong, P1, unknown, duplicated and Consent-expanding scopes denied |

Completion of this Ticket's pure policy tests does not close `AT-SEC-003`, `AT-FUNC-008`, Grant DENY issuance tests, or any Viewer/Download/PACS route Acceptance.

# P0 Consent Audit Context Acceptance — MEDIQ-CON-007

Normative policy: `CON-007-DEC-001`. This Ticket verifies only the existing synthetic technical Consent success events. It does not establish global Audit completeness, denial-event logging, legal consent, identity proof, Authorization/Grant enforcement, or product image access. Audit row inspection uses synthetic test fixtures and the dedicated test inspector; the application runtime receives no Audit `SELECT` privilege.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-007-AUD-001` | Consent request commits successfully, including semantic replay | Exactly one `CONSENT_REQUESTED/SUCCESS` row; exact requester Actor, Tenant, Session, `CONSENT` resource and Consent ID; response `X-Correlation-ID` matches; timestamps valid and `reason_code` null | P0 Audit context | PASS — exact row fields, correlation, timestamps and one-row replay verified in signed OIDC/PostgreSQL integration |
| `TC-CON-007-AUD-002` | Synthetic Consent approval commits successfully, including replay | Exactly one `CONSENT_APPROVED/SUCCESS` row bound to the approving Actor, Tenant, Session and Consent; response correlation matches; timestamps valid and `reason_code` null | P0 Audit context | PASS — exact row fields, correlation and one-row replay verified in signed OIDC/PostgreSQL integration |
| `TC-CON-007-AUD-003` | Synthetic Consent withdrawal commits successfully, including replay | Exactly one `CONSENT_WITHDRAWN/SUCCESS` row bound to the withdrawing Actor, Tenant, Session and Consent; response correlation matches; timestamps valid and `reason_code` null | P0 Audit context | PASS — exact row fields, correlation and one-row replay verified in signed OIDC/PostgreSQL integration |
| `TC-CON-007-AUD-004` | Existing request/approval/withdrawal negative, concurrent replay and injected transaction-failure cases | Denials and failed transactions do not create a Consent success event; committed idempotent/concurrent success has one matching event; domain state and success event roll back atomically | P0 lifecycle integrity | PASS — reused CON-003~005 replay/concurrency and fault-injected rollback cases; generic security-denial Audit is not claimed |
| `TC-CON-007-AUD-005` | Audit storage minimization/schema boundary | `audit_events` has exactly its approved 12 reference/metadata columns; no free-form payload, patient-local identifier, DICOM payload, token, password or key field is added; no runtime Audit read privilege | P0 privacy/least privilege | PASS — exact column inventory and 12 INSERT-only runtime privilege boundary verified |

`CONSENT_REQUESTED`, `CONSENT_APPROVED`, and `CONSENT_WITHDRAWN` remain the only events changed or verified by this Ticket. Global `ACCESS_DENIED`, authentication/authorization failure, all other action coverage, audit delivery/retention and tamper resistance remain under `STC-AUD-001` and related follow-up work.

# P0 Missing/Withdrawn Consent Enforcement Acceptance — MEDIQ-CON-008

Normative decision: `CON-008-DEC-001`. All cases use the existing disposable DB-008 synthetic fixture, `mediq_runtime`, verified Tenant/RLS transaction, `PostgresAuthorizationEvidenceReader`, real Authorization policy and `AuthorizationGatedOperationExecutor`. The protected callback is a test sentinel, not an HTTP endpoint or PACS/Viewer operation. Missing Consent is represented by a Consent UUID with no persisted row while the context otherwise names a valid Session, Grant and Study. The withdrawal fixture has a persisted `WITHDRAWN` Consent and a linked `ACTIVE`, unexpired Grant.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-CON-008-AUT-001` | Missing Consent + `VIEW` | Evidence reader returns no row; Authorization DENY; protected callback count unchanged | P0 internal runtime operation | PASS — DB-008 synthetic PostgreSQL integration |
| `TC-CON-008-AUT-002` | Missing Consent + `DOWNLOAD` | Evidence reader returns no row; Authorization DENY; protected callback count unchanged | P0 internal runtime operation | PASS — DB-008 synthetic PostgreSQL integration |
| `TC-CON-008-AUT-003` | Missing Consent + `PACS_IMPORT` | Evidence reader returns no row; Authorization DENY; protected callback count unchanged | P0 internal runtime operation | PASS — DB-008 synthetic PostgreSQL integration |
| `TC-CON-008-AUT-004` | `WITHDRAWN` Consent + linked `ACTIVE` Grant + `VIEW` | Evidence shows withdrawn Consent and active Grant; Authorization DENY; callback count unchanged | P0 internal runtime operation | PASS — DB-008 synthetic PostgreSQL integration |
| `TC-CON-008-AUT-005` | `WITHDRAWN` Consent + linked `ACTIVE` Grant + `DOWNLOAD` | Evidence shows withdrawn Consent and active Grant; Authorization DENY; callback count unchanged | P0 internal runtime operation | PASS — DB-008 synthetic PostgreSQL integration |
| `TC-CON-008-AUT-006` | `WITHDRAWN` Consent + linked `ACTIVE` Grant + `PACS_IMPORT` | Evidence shows withdrawn Consent and active Grant; Authorization DENY; callback count unchanged | P0 internal runtime operation | PASS — DB-008 synthetic PostgreSQL integration |

This Ticket does not test or claim Grant-issuance denial/serialization, protected HTTP/BOLA, real Viewer/Download/PACS side effects, legal consent, remote recall, or the A→MediQ→B product flow. Those gates remain open.

# P0 TransferGrant Domain Acceptance — MEDIQ-GRT-001

Normative decision: `GRT-001-DEC-001`. This Ticket covers only the immutable pure-domain metadata entity. `issue()` creates an in-memory representation; it does not evaluate Authorization, Consent, tenant membership, patient identity, or persistence. `isTemporallyActiveAt()` is a lifecycle helper only, not an access decision. All positive identifiers and fixture data are synthetic.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-001-DOM-001` | Create an in-memory Grant from a valid server-supplied context | Fresh UUID; ACTIVE status; issued/expiry timestamps; exact required Session, Consent, Tenant and Hospital context | P0 domain only | PASS — focused domain test |
| `TC-GRT-001-DOM-002` | Reconstitute a stored Grant with optional Actor/Package bindings | Exact values preserved; UUIDs canonicalized; null optional references remain null | P0 domain only | PASS — focused domain test |
| `TC-GRT-001-DOM-003` | Reconstitute each persisted lifecycle status | ACTIVE/EXPIRED/REVOKED/CONSUMED recognized; non-ACTIVE states are not temporally active | P0 domain only | PASS — focused domain test |
| `TC-GRT-001-DOM-004` | Validate required and optional UUID fields | Malformed IDs rejected; well-formed nullable Actor/Package accepted | P0 domain only | PASS — invalid-ID matrix |
| `TC-GRT-001-DOM-005` | Validate Scope collection | Non-empty, unique P0 allowlist accepted; empty, duplicate, unknown and P1 `study:mobile-export` rejected | P0 domain shape only | PASS — scope matrix |
| `TC-GRT-001-DOM-006` | Validate timestamp shapes and chronology | Invalid dates and `expiresAt <= issuedAt` rejected | P0 domain only | PASS — timestamp matrix |
| `TC-GRT-001-DOM-007` | Validate lifecycle timestamp consistency | REVOKED requires valid `revokedAt >= issuedAt`; non-REVOKED status requires `revokedAt=null` | P0 domain only | PASS — status/timestamp matrix |
| `TC-GRT-001-DOM-008` | Evaluate temporal activity at issue/expiry boundaries | ACTIVE only when `issuedAt <= now < expiresAt`; exact expiry, pre-issue and terminal states return false; invalid `now` fails closed | Temporal helper only | PASS — boundary matrix |
| `TC-GRT-001-DOM-009` | Revoke an ACTIVE Grant | Returns a new immutable REVOKED entity, preserves bindings/scopes, records valid timestamp; source instance unchanged; other states reject | Pure domain transition only | PASS — transition matrix |
| `TC-GRT-001-DOM-010` | Inspect exposed Grant snapshot/property boundary | Only identifiers, optional references, scopes, status and lifecycle timestamps are exposed; no DICOM/UID/payload/key/credential/secret property | Domain structure only | PASS — property/defensive-copy check |

No case proves database provenance, Authorization `ALLOW`, Consent validity, recipient/action binding, Grant issuance API, HTTP denial, Viewer/Download/PACS behavior, or `AT-E2E-003`. Those remain separate Acceptance gates.

**Execution result (2026-10-01):** The focused suite passed 19 tests; API regression passed 21 files/392 tests and TypeScript typecheck passed. See [MEDIQ-GRT-001 evidence](implementation/MEDIQ-GRT-001/TEST-EVIDENCE.md). This is domain-only evidence.

# P0 TransferGrant Persistence Acceptance — MEDIQ-GRT-002

Normative decision: `GRT-002-DEC-001`. This Ticket implements only an internal repository port/adapter for ACTIVE Grant insertion and persisted-row reconstitution. Runtime DB privileges are not changed: exact additional INSERT/SELECT columns exist only in the disposable DB-008 scratch database and are revoked after the run. Repository success is not Authorization, Consent validation, Grant issuance API, or permission to access an image. All test identities and rows are synthetic.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-002-PER-001` | Inspect effective privileges and RLS in the scratch runtime role | Existing baseline is exactly 126 privileges; test-only extra is exactly 16 column privileges (12 Grant INSERT, 3 Scope INSERT, 1 `created_at` SELECT); no table-wide/default/PUBLIC/broad mutation; both Grant tables have forced RLS | Disposable PostgreSQL least privilege | PASS — two DB-008 runs each confirmed exact 142 temporary privileges and forced RLS |
| `TC-GRT-002-PER-002` | Insert a valid ACTIVE P0 Grant and its scope rows, then load it under the same verified Tenant transaction | All persisted references, nullable bindings, timestamps, status and exact P0 scopes round-trip via `TransferGrant.reconstitute`; SQL uses bind parameters | Internal persistence only | PASS — live synthetic PostgreSQL create/read under IAM-002 verified context |
| `TC-GRT-002-PER-003` | Read existing ACTIVE, REVOKED, and ACTIVE-with-elapsed-expiry synthetic Grant rows | Persisted status/timestamps/scopes are reconstructed exactly; elapsed expiry is not promoted to a status or Authorization decision; unsupported scope data fails closed | Persistence reconstitution | PASS — active/revoked/elapsed fixtures round-tripped; unsupported P1 scope rejected by adapter unit test |
| `TC-GRT-002-PER-004` | Pass a non-Grant object, terminal Grant to insert, or malformed Grant ID to lookup | Fixed domain/persistence error before unsafe database disclosure; invalid inputs cause no insert | Adapter input validation | PASS — focused adapter tests; no database calls for invalid inputs |
| `TC-GRT-002-PER-005` | Force a scope-row uniqueness error after parent insert | Savepoint rolls back both parent and any earlier scope rows; caller transaction can continue; no partial Grant remains | Atomic repository write | PASS — live PostgreSQL fault injection verified no partial Grant; adapter mock rollback also passes |
| `TC-GRT-002-PER-006` | Read from source/recipient participant Tenants, unrelated Tenant and no-context connection | Only rows visible under existing forced RLS are returned; unrelated/no-context reads return no row; visibility is not business authorization | Tenant RLS boundary | PASS — actual source/recipient Tenant visibility; unrelated and no-context reads hidden |
| `TC-GRT-002-PER-007` | Attempt insert without verified Tenant RLS context | PostgreSQL denies/rolls back the write; repository emits only a fixed persistence error; no Grant or scope row remains | Fail-closed runtime DB boundary | PASS — actual no-context insert denied and follow-up read found no row |
| `TC-GRT-002-PER-008` | Revoke temporary DB-008-only grants after success or failure | Exact 126-column-privilege baseline is restored; no schema, migration or persistent runtime grant is added | Disposable test cleanup | PASS — both clean/reset runs restored 142→126; persistent baseline remains 126 |

These cases do not prove Grant issuance authorization/serialization, Consent freshness, recipient/Tenant/Actor/Package cross-binding, action-scope enforcement, HTTP BOLA, protected Viewer/Download/PACS denial, STOW, or `AT-E2E-003`. Those remain separate gates. `TC-GRT-002-PER-001/008` are run by the parent PowerShell DB-008 harness; actual product database access remains denied until a later recommendation and explicit least-privilege evidence authorize it.

**Execution result (2026-10-01):** `npm run typecheck:api` passed; `npm run test:api` passed 22 files/399 tests. `./scripts/test-db-008-full-schema.ps1` exited 0 for clean migration, reset/reapply, two GRT-002 real PostgreSQL/RLS runs (each 7/7 TAP tests), exact 142→126 privilege restoration, and DB-002~007 regression. No permanent runtime privilege, migration, or schema change was made. See [MEDIQ-GRT-002 evidence](implementation/MEDIQ-GRT-002/TEST-EVIDENCE.md).

# P0 TransferGrant Issue API Acceptance — MEDIQ-GRT-003

Normative decision: `GRT-003-DEC-001`. All fixtures and identities are synthetic. This API creates a narrowly scoped authorization artifact; it does not itself authorize a Viewer, Download, DICOM retrieval, PACS import, or STOW operation. The distinct post-issuance object/action Authorization and Mandatory Preflight remain required.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-003-API-001` | Verified destination requester issues `study:view` with exact active Consent and Package | `201`; ACTIVE Grant is bound to verified Tenant/Hospital/Actor, Session, Consent and non-null exact Package; one scope; no image/PACS call | P0 issue API | PASS — signed-OIDC HTTP→PostgreSQL/RLS integration |
| `TC-GRT-003-API-002` | Each P0 scope individually with its exact Consent action | `study:view↔VIEW`, `study:download↔DOWNLOAD`, `study:pacs-transfer↔PACS_IMPORT` only | P0 scope mapping | PASS — 3-way service policy matrix |
| `TC-GRT-003-API-003` | Requester actor differs from Session requester or verified Hospital differs from Session destination | `403`; no Grant/Scope/success Audit | Issuer binding | PASS — service negative matrix |
| `TC-GRT-003-API-004` | Caller is `SERVICE`, tenant-level USER, or a USER from the wrong Tenant | Fail closed with safe response; no Grant/Scope/success Audit | IAM/Tenant boundary | PASS — service matrix + cross-Tenant HTTP integration |
| `TC-GRT-003-API-005` | Session missing or Consent belongs to another Session/Patient/Source/Destination | `403` or fixed `409` per public error contract; no resource detail, Grant, Scope or success Audit | Cross-entity binding | PASS — service binding negative matrix |
| `TC-GRT-003-API-006` | Consent missing, PENDING, WITHDRAWN, elapsed, future-issued, or has withdrawn timestamp | Deny; no Grant/Scope/success Audit | Consent freshness | PASS — service state/freshness matrix |
| `TC-GRT-003-API-007` | Consent action snapshot is empty, duplicate, unknown, or includes unsupported P1 action | Deny all requested scopes; no partial Grant | Consent evidence integrity | PASS — fail-closed service matrix |
| `TC-GRT-003-API-008` | Scope is unknown, duplicate, P1 `study:mobile-export`, or exceeds Consent actions | `400` for malformed shape or `403` for valid-shape policy denial; no write | Scope enforcement | PASS — unit policy matrix + HTTP denial case |
| `TC-GRT-003-API-009` | Package is missing, not in same Session/Patient/Source, unavailable, deleted, retention-expired, or conflicts with Consent's package binding | Deny; no Grant/Scope/success Audit | Exact resource binding | PASS — service matrix + HTTP wrong-Package denial |
| `TC-GRT-003-API-010` | Session is not `CONSENTED` or an applicable Session/Consent/Package expiry is elapsed | Deny; issue expiry is capped at the earliest applicable future Session/Consent limit | Lifecycle checks | PASS — service state/expiry matrix |
| `TC-GRT-003-API-011` | Body tries to specify recipient Hospital or `expiresAt`, or contains malformed/unsupported fields | `400`; recipient values are never trusted; no writes | Request contract | PASS — unit validation + HTTP denial cases |
| `TC-GRT-003-API-012` | Server computes Grant expiry | `min(issue time + 30 minutes, Session expiry, Consent expiry)`; never client-extended; response uses UTC ISO timestamp | P0 TTL cap | PASS — service caps + live 30-minute response assertion |
| `TC-GRT-003-API-013` | Same verified Actor repeats same Idempotency-Key and same semantic request | Same Grant ID/body; `Idempotency-Replayed: true`; exactly one Grant, exact scope set, and one success Audit pair | HTTP idempotency | PASS — live replay and persisted Audit/row counts |
| `TC-GRT-003-API-014` | Same verified Actor reuses Idempotency-Key for a different requested scope | `409`; existing Grant unchanged; no second Grant or success Audit; one minimized denial Audit | Idempotency conflict | PASS — unit + live scope-conflict assertions |
| `TC-GRT-003-API-015` | Two concurrent identical requests use same key | Both resolve to the same Grant; at most one parent, exact scope rows and success Audit pair | Concurrency | PASS — live concurrent HTTP/PostgreSQL test |
| `TC-GRT-003-API-016` | Two requests use distinct valid keys | Each Grant has independent ID and exact bindings; no cross-request scope inheritance | Isolation | PASS — live distinct-key HTTP/PostgreSQL test |
| `TC-GRT-003-API-017` | Grant scope insert or either success Audit insert fails | Entire verified transaction rolls back; no Grant, scope or partial success Audit remains; fixed `503` | Atomicity | PASS — live fault injection for Scope and Audit |
| `TC-GRT-003-API-018` | A verified-context policy/binding check denies issue | Fixed `AUTHORIZATION_DENIED/DENY` metadata is audited; no Grant/Scope/success event; public response does not reveal which binding failed | Denial Audit | PASS — unit denials + live minimized Audit counts |
| `TC-GRT-003-API-019` | Injected Scope/Audit persistence failure or malformed correlation/idempotency key | Fixed `400`/`503`; no driver detail, tenant data or secret; no partial writes | Safe failure | PASS — live malformed-input and rollback tests |
| `TC-GRT-003-API-020` | Response inspection | `Cache-Control: no-store`; no PACS URL/credential, DICOM payload/UID, Local Patient ID, key, or secret; Grant ID alone is not a bearer credential | Data minimization | PASS — exact live response-shape/header assertion |
| `TC-GRT-003-DB-001` | Apply migration and inspect schema | Nullable legacy-compatible UUID `idempotency_key`, unique Tenant/Actor/key index and Actor-binding CHECK | Migration/schema | PASS — migration ledger/schema/index/check and reset/reapply |
| `TC-GRT-003-DB-002` | Inspect runtime column privilege catalog | Exact persistent inventory is 144 column-privilege rows: baseline 126 + 13 Grant INSERT + 3 Scope INSERT + 2 Grant SELECT; no broad table/PUBLIC/DDL/DELETE/TRUNCATE privilege | Least privilege | PASS — DB-009 exact catalog + live GRT-003 privilege assertion |
| `TC-GRT-003-DB-003` | Insert/replay Grant and idempotency key under verified destination Tenant | Exact bindings and scope persist; key lookup/replay is Tenant/Actor-bound; key is not authorization | Persistence | PASS — live signed-OIDC/PostgreSQL/RLS issue and replay |
| `TC-GRT-003-DB-004` | Different Tenant attempts to issue/read the Session-bound Grant | Forced RLS and verified membership deny/hide unrelated data; no cross-Tenant Grant or Audit write | Tenant isolation | PASS — live third-Tenant HTTP/RLS denial |
| `TC-GRT-003-DB-005` | Two concurrent HTTP requests use same Tenant/Actor/key | Unique constraint and transactional conflict/re-read produce one durable Grant, one scope set and one success Audit pair | DB concurrency | PASS — live concurrent HTTP/PostgreSQL test |
| `TC-GRT-003-DB-006` | DB-008 clean/reset-reapply and DB-002~007 regression | Migration applies/reapplies; runtime inventory is exactly 144; all legacy schema gates pass | Regression | PASS — full DB-008 clean + reset/reapply gate |

**Current regression follow-up (2026-10-03; GRT-003-DEC-002):** Historical rows above describe their approved implementation checkpoint, not current-schema acceptance. DB-008 session 6711 failed the GRT-003 rollback child case and parent suite (combined GRT-003/004: 12 PASS / 2 FAIL); owned resources were verified absent. Before changing the test harness, require: (DIAG-001) successful connect/query/result and query-timeout/parameter objects forward unchanged, release keeps its receiver; (DIAG-002) unexpected connect/query errors retain identity while emitted diagnostics contain only fixed stage/category/coarse timing, including a deliberately sensitive raw-error sentinel; (DIAG-003) existing scope/second-Audit/denial-Audit/revoke-Audit/commit fault injection remains fail-closed with unchanged SQL assertions; (DIAG-004) every fault app closes in finally and failure diagnostics identify the rollback substep without payload/SQL/credential output. Real acceptance still requires all 14 signed HTTP/PostgreSQL cases plus the full current 244-privilege scratch clean/repeat/reset/reapply gate and owned cleanup. Diagnostic unit checks cannot replace them; no deadline/permission/assertion relaxation.

The issue API's policy is separate from `ResolvedObjectAuthorizationPolicy`: the latter requires an already-existing Grant and is evaluated only when a later protected operation is attempted. GRT-003 does not make `AT-FUNC-010` or `AT-SEC-012` pass and does not claim A→MediQ→B completion.

**Execution result (2026-10-01):** `npm run typecheck:api`, `npm run test:api -- --reporter=dot` (23 files/442 tests), and `npm run db:migrations:check` passed. The full DB-008 gate passed clean migration and reset/reapply, both signed-OIDC GRT-003 PostgreSQL/RLS runs (8/8 TAP each), exact 144 privilege inventory, migration ledger 17, and DB-002~007 regression. The initial post-migration run exposed only a stale DB-005 harness inventory; that harness was updated for the additive nullable idempotency field/index/check and its clean rerun passed. See [MEDIQ-GRT-003 evidence](implementation/MEDIQ-GRT-003/TEST-EVIDENCE.md). Protected Viewer/Download/PACS execution and complete P0 E2E remain unverified.

---

# P0 TransferGrant Revocation Acceptance — MEDIQ-GRT-004

Normative decision: `GRT-004-DEC-001`. All actors and rows are synthetic. Revocation is limited to the exact verified recipient USER Actor and its matching Tenant/Hospital/Session. It changes authorization metadata only; it does not recall offline copies or prove cancellation of in-flight image operations.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-004-REV-API-001` | Exact verified recipient Actor revokes an ACTIVE Grant | `200`; status becomes `REVOKED`; server `revokedAt`; scopes/bindings unchanged; one success Audit | P0 revocation | PASS |
| `TC-GRT-004-REV-API-002` | Another Actor in same Tenant/Hospital attempts revocation | Fixed deny; no state change or success Audit; minimized denial Audit only after verified context | Actor binding | PASS |
| `TC-GRT-004-REV-API-003` | Wrong Tenant/Hospital, `SERVICE`, or tenant-only USER attempts revocation | Fail closed; no Grant state change | IAM/Tenant boundary | PASS |
| `TC-GRT-004-REV-API-004` | Route Session differs from Grant/Session, or Grant is missing | Non-disclosing fixed deny; no state change | Route/resource binding | PASS |
| `TC-GRT-004-REV-API-005` | Same verified Actor repeats revocation after it is already REVOKED | `200`; exact original `revokedAt` and Grant ID preserved; `Idempotency-Replayed: true`; no second success Audit | State idempotency | PASS |
| `TC-GRT-004-REV-API-006` | Consent is withdrawn/expired or Session is terminal/expired while Grant remains ACTIVE | Revocation still succeeds; these conditions cannot block a risk-reducing operation | Risk-reduction availability | PASS |
| `TC-GRT-004-REV-API-007` | Grant expiry time elapsed but persisted status remains ACTIVE | Revocation still succeeds and sets `REVOKED`; does not relabel as EXPIRED | Lifecycle | PASS |
| `TC-GRT-004-REV-API-008` | Grant status is EXPIRED or CONSUMED | Fixed `409`; state and timestamp unchanged | Terminal-state handling | PASS |
| `TC-GRT-004-REV-API-009` | Two concurrent exact-recipient revoke requests | Both safely resolve to REVOKED; exactly one transition and one success Audit; original timestamp stable | Concurrency | PASS |
| `TC-GRT-004-REV-API-010` | Request body attempts to override actor, scope, status or `revokedAt` | `400`; no caller-controlled identity/state; no writes | Input minimization | PASS |
| `TC-GRT-004-REV-API-011` | Audit insert fails after attempted status transition | Fixed `503`; entire transaction rolls back, leaving ACTIVE Grant and no success Audit | Atomicity | PASS |
| `TC-GRT-004-REV-API-012` | Inspect response/cache/audit fields and ensure no implied remote recall | `Cache-Control: no-store`; metadata only; no DICOM/PHI/secret; response contract documents non-recall boundary | Data minimization | PASS |
| `TC-GRT-004-REV-DB-001` | Inspect persistent runtime privilege catalog after migration | Exact 146 column privilege rows: GRT-003 144 + only `UPDATE(status, revoked_at)`; no table-wide/PUBLIC/default/DDL/DELETE/TRUNCATE/broad UPDATE | Least privilege | PASS |
| `TC-GRT-004-REV-DB-002` | Runtime role attempts to update binding, scope, issue/expiry or creation metadata | PostgreSQL rejects every non-approved UPDATE; approved two columns remain usable under verified context | Column privilege | PASS |
| `TC-GRT-004-REV-DB-003` | Cross-Tenant/no-context SELECT or UPDATE attempt | Forced RLS hides/denies row; no unauthorized mutation or Audit | Tenant isolation | PASS |
| `TC-GRT-004-REV-DB-004` | Concurrent transactions revoke the same Grant under Session/row locks | One durable `ACTIVE→REVOKED` transition and one success Audit; post-commit read reflects exact row; DB-008 cleanup leaves no scratch resources | DB concurrency/regression | PASS |

`AT-FUNC-009` is the user-facing functional summary; the detailed API/DB cases above are the implementation gate. This Ticket does not establish operation-time Viewer/Download/PACS denial or E2E completion.

# P0 TransferGrant Scope Enforcement Acceptance — MEDIQ-GRT-005

Normative decision: `GRT-005-DEC-001`. This is a pure policy decision/test boundary over server-resolved synthetic evidence. It reuses `decideObjectAuthorization`; it does not register a route, return medical-image data, or call Viewer/Download/PACS side effects. An `ALLOW` below means only that this scope predicate is satisfied within the wider policy.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-005-AUTH-001` | Requested `VIEW`, Consent allows `VIEW`, Grant contains `study:view` | `ALLOW` from pure policy only | Exact action/scope | PASS |
| `TC-GRT-005-AUTH-002` | Requested `DOWNLOAD`, Consent allows `DOWNLOAD`, Grant contains `study:download` | `ALLOW` from pure policy only | Exact action/scope | PASS |
| `TC-GRT-005-AUTH-003` | Requested `PACS_IMPORT`, Consent allows `PACS_IMPORT`, Grant contains `study:pacs-transfer` | `ALLOW` from pure policy only; no PACS call | Exact action/scope | PASS |
| `TC-GRT-005-AUTH-004` | A scope for one action is presented for another action, e.g. `study:view` for `DOWNLOAD` or `PACS_IMPORT` | `DENY`; no scope coercion | Action mismatch | PASS |
| `TC-GRT-005-AUTH-005` | Grant omits the scope required by the requested action | `DENY` | Missing required scope | PASS |
| `TC-GRT-005-AUTH-006` | Grant contains duplicate, unsupported, unknown or P1 `study:mobile-export` scope | `DENY` | Scope allowlist/integrity | PASS |
| `TC-GRT-005-AUTH-007` | Any Grant scope is not contained in the Consent's corresponding allowed actions, or Consent lacks the exact requested action | `DENY` | Consent containment | PASS |
| `TC-GRT-005-AUTH-008` | Scope list/evidence is missing, malformed or contradictory, or policy/evidence resolution fails | `DENY` | Default-deny | PASS |

These cases trace to `TC-AUT-003-OBJ-001/005/009` and existing policy tests. The dedicated run passed all eight IDs in `tests/api/object-authorization-policy.test.mjs`; the focused file reports 96 tests total. This does not establish live HTTP, evidence-reader, Viewer, Download, PACS, STOW, or race-fencing completion.

# P0 TransferGrant Payload Restriction Acceptance — MEDIQ-GRT-006

Normative decision: `GRT-006-DEC-001`. A Grant is authorization metadata, not a DICOM package, Capsule, or key container. Responses must be built from an explicit metadata allowlist, never by spreading arbitrary entity properties.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-006-PAY-001` | Inspect immutable Grant snapshot/property set | Only approved IDs/references, P0 scopes, status and lifecycle timestamps; no DICOM/UID/payload/key/credential/secret field | Domain metadata | PASS |
| `TC-GRT-006-PAY-002` | Serialize Grant issuance response | Exact approved metadata response allowlist; no raw DICOM, DICOM UID, DEK/KEK, password, private key or long-lived secret | Issue response | PASS — controller unit boundary |
| `TC-GRT-006-PAY-003` | Serialize Grant revocation response with injected synthetic forbidden properties on the source object | Same approved response allowlist as issue; injected forbidden/unknown fields are not copied | Revoke response | PASS — controller unit boundary |
| `TC-GRT-006-PAY-004` | Compare issue and revoke serializers and response types | Both share one explicit response mapper and cannot drift or serialize arbitrary Grant properties | Serializer consistency | PASS |

These tests concern metadata serialization only. They do not verify DICOM/Capsule encryption, key lifecycle, protected-image Authorization, PACS transfer, or persistence of actual medical data.

# P0 TransferGrant Expiration Acceptance — MEDIQ-GRT-007

Normative decision: `GRT-007-DEC-001`. Server time is authoritative. Grant use is valid only on the half-open interval `issuedAt <= now < expiresAt`, with active Grant status and non-expired Session/Consent. Expiry enforcement denies use; it does not imply that an asynchronous process rewrites the stored Grant status.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-GRT-007-EXP-001` | `now` equals `issuedAt` and is earlier than `expiresAt` | `ALLOW` from pure policy if all other evidence is valid | Inclusive issue boundary | PASS |
| `TC-GRT-007-EXP-002` | Grant `issuedAt` is after server `now` | `DENY` | Future issue time | PASS |
| `TC-GRT-007-EXP-003` | `now` equals `expiresAt` | `DENY` | Exact expiry boundary | PASS |
| `TC-GRT-007-EXP-004` | `now` is after `expiresAt` although persisted status is `ACTIVE` | `DENY`; do not rely on stored status alone | Expired ACTIVE Grant | PASS |
| `TC-GRT-007-EXP-005` | Missing/malformed timestamps or `expiresAt <= issuedAt` | `DENY` | Invalid temporal evidence | PASS |
| `TC-GRT-007-EXP-006` | Grant status is non-ACTIVE or has `revokedAt`, with future expiry | `DENY` | Lifecycle status | PASS |
| `TC-GRT-007-EXP-007` | Consent or Session is expired/terminal despite a future Grant expiry | `DENY` | Parent lifecycle bound | PASS |
| `TC-GRT-007-EXP-008` | Server issues a Grant when Session/Consent expiry precedes 30-minute TTL | Grant expires at the earliest parent expiry; it never exceeds the 30-minute cap | Issuance TTL bound | PASS — unit service test; GRT-003 DB integration separately passed |

**Execution result (2026-10-01):** All eight dedicated Acceptance IDs pass; focused policy/issue-service suite passed 2 files/145 tests and full API regression passed 25 files/473 tests. The pure cases do not prove HTTP route enforcement, cache invalidation, viewer session termination or in-flight operation fencing.

# P0 DICOM Gateway Port Acceptance — MEDIQ-DCM-001

Normative decision: `DCM-001-DEC-001`. This Ticket defines only the internal TypeScript port and compile-time conformance. It does not implement an HTTP client/Orthanc adapter, authorize an operation, or establish QIDO/WADO/STOW interoperability. `MEDIQ-DCM-002` owns the real adapter compatibility and streaming spike; historical `MEDIQ-DICOM-001` references are crosswalked there.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DCM-001-PORT-001` | Define all approved operations: Study query, Study metadata, one-instance WADO, frame stream, one-instance STOW, destination verification and capabilities | One typed `DicomGateway` port matches the detailed approved adapter contract | Port surface | PASS — compile-time |
| `TC-DCM-001-PORT-002` | Inspect every request context | Server-resolved `hospitalId`, `correlationId` and required `AbortSignal`; no raw endpoint URL or PACS credential argument | Routing/credential boundary | PASS — compile-time negative assertions |
| `TC-DCM-001-PORT-003` | Inspect QIDO/metadata result types | Typed allowlisted Study/Series/Instance metadata; no PatientName, AccessionNumber, or unfiltered raw DICOM JSON projection | Metadata minimization | PASS — type/source review |
| `TC-DCM-001-PORT-004` | Inspect WADO/STOW payload types | One DICOM Instance or Frame is represented by WHATWG `ReadableStream<Uint8Array>`; no Study-sized `Buffer[]` or aggregate buffer contract | Streaming/cancellation boundary | PASS — compile-time; runtime behavior untested |
| `TC-DCM-001-PORT-005` | Inspect STOW and verification results | Typed per-instance stored/warning/failed UID outcome and actual destination UID evidence; `200/202` alone cannot mean transfer completion | Partial result boundary | PASS — compile-time |
| `TC-DCM-001-PORT-006` | Compile synthetic conforming and intentionally invalid adapter fixtures | Conforming implementation type-checks; compile-time negative assertions prove endpoint/credential and non-stream payload shapes are rejected | Compile-time contract only | PASS — dedicated type-contract command |

**Execution result (2026-10-01):** `npm run test:dicom-port-contract` PASS; `npm run build:api`, `npm run typecheck:api`, and `npm run test:api -- --reporter=dot` PASS (25 files / 473 tests). Evidence: `docs/implementation/MEDIQ-DCM-001/TEST-EVIDENCE.md`.

**Execution boundary:** DCM-001 does not run network calls. Orthanc A/B contract tests, QIDO/WADO/STOW payload checks, TLS/auth, URL allowlisting, multipart handling, maximum size, timeout/backpressure/cancellation and authorization-before-call remain DCM-002 onward. `AT-DICOM-001~004`, `AT-SEC-012/013`, and the A→MediQ→B E2E are not satisfied by these port cases. Destination PatientMapping versus byte-preserving DICOM `PatientID` reconciliation must be decided before STOW implementation.

# P0 Synthetic Orthanc DICOMweb Adapter Acceptance — MEDIQ-DCM-002

Normative recommendation: `DCM-002-DEC-001`. This ticket implements and probes an internal adapter against the existing synthetic local Test Orthanc services only. It is not a protected product operation and does not register an HTTP route. Live Orthanc checks are read-only: QIDO/WADO against A and a bounded QIDO baseline against B. STOW request framing and response normalization are tested with synthetic mocked streams only; no STOW is sent to either Orthanc because the required product Authorization and Mandatory Preflight path is not implemented. Existing PACS data is never modified or deleted. Local HTTP is an explicitly isolated Test-profile exception and never counts as `SEC-TLS-001` evidence.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-DCM-002-CFG-001` | Resolve an operation by verified server-supplied Hospital ID and operation | Only A QIDO/WADO and B QIDO/STOW configurations resolve; unknown Hospital and wrong Hospital-role pairs deny before network I/O | Server endpoint selection | PASS — adapter unit tests |
| `TC-DCM-002-CFG-002` | Attempt URL/host/path/query/userinfo/redirect/credential override and SSRF-shaped values | Caller cannot provide endpoint or credentials; exact configured service origin only; redirects rejected | SSRF/secret boundary | PASS — fixed resolver and `redirect:error` contract; no public caller surface |
| `TC-DCM-002-CFG-003` | Resolve local endpoint metadata and server-side test credential | Immutable Test profile matches ORG-003 A/B role pairs; no runtime `hospital_endpoints` query/grant is added | Registry/configuration | PASS — resolver unit and isolated integration container; no DB dependency |
| `TC-DCM-002-QIDO-001` | Query the synthetic PatientID in Hospital A Test Orthanc | Fixture Study UID, date, modalities and instance count return in a typed allowlisted projection | Real Test Orthanc contract | PASS — A QIDO integration |
| `TC-DCM-002-QIDO-002` | Wrong media type, malformed DICOM JSON, invalid UID/value, excessive result count/body, unauthorized status or timeout | Fixed sanitized failure, bounded body/deadline; no raw upstream detail or unbounded retry | QIDO negative/resource cases | PASS — malformed, page overflow, media, 401 and idle-deadline unit cases |
| `TC-DCM-002-WADO-001` | Retrieve Study metadata from A for the fixed fixture | Typed minimal hierarchy; requested Study/Series/Instance UID relationship checked; no unrestricted metadata or patient name/accession escapes | Metadata contract | PASS — A Orthanc metadata integration |
| `TC-DCM-002-WADO-002` | Retrieve one instance as `multipart/related` | Streaming MIME parser yields exactly one `application/dicom` part; stream SHA-256 and byte count match source manifest | Orthanc streaming contract | PASS — all 3 A instances, byte/hash matched |
| `TC-DCM-002-WADO-003` | Invalid media/boundary, truncated body, multiple parts, header/instance cap exceeded, idle timeout/cancel | Fail closed, cancel upstream, expose no partial-success result | Multipart/limit/cancellation negatives | PASS — truncated/multiple/wrong-media, >16 KiB headers, >64 MiB part, idle deadline |
| `TC-DCM-002-WADO-004` | Retrieve one synthetic frame through the rendered-frame path | Only bounded `image/jpeg` is exposed as a stream | Frame compatibility probe | PASS — A Orthanc JPEG frame integration |
| `TC-DCM-002-STOW-001` | Serialize one fixed synthetic instance as one-instance streaming STOW to a mocked endpoint | Exact B role resolution, multipart framing and byte identity are verified; no live Orthanc write or Preflight claim | Mocked adapter contract only | PASS — unit test |
| `TC-DCM-002-STOW-002` | STOW returns partial `202` or response loss after request begins | Preserve per-instance failure/unknown outcome; 200/202 alone is not Transfer complete; never blind retry POST | STOW semantics | PASS — partial 202 and lost-response unit tests |
| `TC-DCM-002-STOW-003` | Destination mapping differs from payload PatientID or cannot be established | Future PACS Preflight must deny before any STOW; this adapter-only ticket does not prove that gate | Patient-mapping boundary | NOT RUN — no product Preflight/caller; live STOW deliberately prohibited |
| `TC-DCM-002-VER-001` | Query bounded B baseline for the fixture Study/SOP UIDs | Capture repeatable read-only state; never modify existing content or claim post-STOW completion | Destination QIDO baseline only | PASS — B baseline had 0 matching SOP instances; repeated query stable |
| `TC-DCM-002-SEC-001` | Run adapter test using exact local Test A/B service DNS names on internal-only Compose networks | No host-published Orthanc port; synthetic Test HTTP exception only; no TLS claim | Network/transport boundary | PASS — isolated DICOM adapter test on A/B networks |
| `TC-DCM-002-SEC-002` | HTTPS invalid-certificate behavior or production/non-test HTTP configuration | Test-only resolver fails closed outside development/test; no insecure TLS fallback | TLS fail-closed boundary | PARTIAL — environment boundary tested; no HTTPS/TLS adapter or certificate Acceptance |
| `TC-DCM-002-SEC-003` | Inspect typed projections/errors for unnecessary DICOM tags and raw upstream details | Allowlist excludes PatientName/AccessionNumber/raw payload; adapter emits no log | Data minimization | PASS — projection tests; adapter has no logging path |
| `TC-DCM-002-SEC-004` | Confirm adapter is not registered behind a product route or Authorization executor | Adapter stays internal and cannot be invoked by external user; no Authorization-before-call claim | Scope boundary | PASS — static repository wiring review; intentionally not registered |
| `TC-DCM-002-RUN-001` | Abort/deadline during QIDO/WADO/STOW stream or response wait | Request/body streams cancel; no unbounded wait or STOW retry; started STOW response loss is UNKNOWN | Runtime resilience | PASS — idle/deadline and lost-response unit cases |
| `TC-DCM-002-RUN-002` | Exercise upper bounds and stream backpressure with synthetic streams | Enforce 100-study QIDO page, 2,000 metadata instances, 64 MiB per-instance, 16 KiB multipart-header and concurrency-2 ceilings | P0 resource guardrails | PASS — page/input, actual streamed >64 MiB, header, and concurrency caps tested |

# MEDIQ-PACS-006 — Destination Study Verification Acceptance

Normative decision: `PACS-006-DEC-001`. The cases below distinguish the internal QIDO verification primitive from the later protected post-STOW completion workflow. No case in this section authorizes STOW or makes `AT-FUNC-013` PASS.

| ID | Scenario | Required result | Scope | Status |
|---|---|---|---|---|
| `TC-PACS-006-INPUT-001` | Empty, malformed, duplicate, over-limit, or structurally invalid expected Series/SOP inventory | Reject with a fixed error before any upstream request; expected inventory is non-empty, each SOP UID is unique, every UID is valid, and configured Series/Instance ceilings are enforced | Internal request validation | PASS — focused request-validation cases; no network on invalid input |
| `TC-PACS-006-QIDO-001` | Destination Series/Instance inventory spans QIDO pages or an origin result cap | Use bounded `limit`/`offset`; continue when the DICOM Warning 299 signals more results; prove completeness only at a terminal page; reject malformed/unrecognized warning, inconsistent remaining count, non-progress, repeated page identity, timeout, cancellation, body cap, or result ceiling. Two full scans must match within a five-minute overall deadline | Mock QIDO + read-only Test Orthanc B | PASS — Warning 299, 100-item and smaller-origin pages, offset progression, inconsistent count, total deadline and repeated B baseline tested; no arbitrary-vendor conformance claim |
| `TC-PACS-006-EXACT-001` | Actual destination matches expected Series set and per-Series SOP UID sets exactly; equal-count cases have missing/extra instances, extra Series, or the same SOP placed under a different Series; inventory changes between complete scans | Only identical exact hierarchy across two complete scans reports `matchesExpected=true`; missing, extra, wrong-Series or wrong-Study identity reports mismatch and cannot support completion | Internal verifier | PASS — exact match, missing, extra Series, wrong Series and scan drift cases; no post-STOW claim |
| `TC-PACS-006-DUP-001` | Duplicate Series row, duplicate SOP row within/across pages/Series, malformed UID, or response identity contradicts the requested Study/Series path | Fail closed; `Set.has()` detects duplicates before mutation; no identifiers or upstream response details enter errors/logs | Negative protocol/security | PASS — duplicate Series/SOP, later-page duplicate, invalid UID and Study/Series-path mismatch cases |
| `TC-PACS-006-FAIL-001` | B QIDO 401/5xx, malformed JSON/media, timeout, cancellation, byte/result cap or paging inconsistency | Fixed sanitized failure or explicit mismatch; never report verified, never call STOW, and never transition an operation to `COMPLETED` | Negative/read-only | PASS — adapter failure paths fail closed; operation-completion integration remains NOT RUN |
| `TC-PACS-006-COMP-001` | Equal source/destination counts, matching UID inventory alone, STOW 200/202, missing integrity/provenance/Audit, or a failed/unknown destination query | Must not transition to `COMPLETED`; completion requires exact hierarchy, integrity verification, completed Provenance, and atomic state+completion-Audit persistence. Unknown outcomes remain `RESULT_UNKNOWN`; no blind retry | Protected product completion | NOT RUN — coordinator/evidence integration absent |
| `TC-PACS-006-BOUNDARY-001` | Execute all scoped checks against the local synthetic Test Orthanc profile | Only Test B read-only QIDO is used; Hospital B contents are unchanged; no STOW/POST, route/provider or public result is introduced; cleanup and existing-stack preservation pass | Environment boundary | PASS — 7/7 integration tests, B empty/repeatable, no STOW/POST; no product transfer claim |

**Not covered / remains NOT RUN:** any live STOW or A→B write; positive HTTPS/mTLS; live protected HTTP auth or safe-error/BOLA; operation-time Consent/Authorization/Grant/revocation fencing; Mandatory Preflight and wrong-mapping no-STOW; patient mapping administration; retry/reconciliation workflow; integrity/provenance/audit transaction; public Viewer/Download/API; general Hospital interoperability; full `AT-DICOM-001~004`, `AT-SEC-012/013`, or complete P0 A→MediQ→B Acceptance. The interface/runtime network test must not be reported as these product gates.

---

# P0 PACS Destination PatientMapping Gate — MEDIQ-PACS-004

**Decision:** `PACS-004-DEC-001` (recommendation recorded before implementation)
**Scope:** Internal, Authorization-gated destination mapping check only. No public route and no DICOM Gateway/STOW dependency.

The gate accepts only server-resolved internal references (`exchangeSessionId`, `studyRefId`, `consentId`, `grantId`) plus the verified-authentication input, Tenant candidate and correlation ID. It constructs `PACS_IMPORT` context itself; patient/local-patient identifiers, destination Hospital, endpoint URL and authorization facts are not caller inputs. The Authorization executor must return exact `ALLOW` before the Session or PatientMapping lookup runs. Mapping is queried on the same verified Tenant transaction and must be bound to the persisted Session patient reference and destination Hospital, with exactly one `VALID` record and non-null validation evidence.

`MAPPING_VALIDATED` is an internal mapping-only result, not a PACS permission. This gate intentionally has no `DicomGateway` dependency. The complete Mandatory Preflight, PACS import route, successful import and live STOW remain separate unfinished Acceptance gates. Consequently these scoped tests do not by themselves mark `AT-SEC-012` complete.

| Test ID | Scenario | Expected result | Scope | Result |
|---|---|---|---|---|
| `TC-PACS-004-REQ-001` | Malformed command, unknown property, caller-supplied patient/destination/endpoint field | Fixed invalid-request failure before DB, Authorization or DICOM calls; no input echo | Unit/security | PASS — 1 focused case |
| `TC-PACS-004-AUTH-001` | Missing principal/context, policy DENY, evaluator exception or non-exact effect | Deny/fixed unavailable result; no Session/Mapping query or onward callback | Authorization-gated unit | PASS — 4 focused cases; real DB evidence reader remains separate |
| `TC-PACS-004-BIND-001` | Session, Study, Consent, Grant, verified Tenant/Hospital binding is mismatched or absent | Exact `PACS_IMPORT` policy denies before Mapping lookup | Authorization/policy boundary | PARTIAL — action/context construction and persisted destination recheck tested; no real DB evidence fixture through PACS service |
| `TC-PACS-004-DB-001` | Authorized context resolves destination mapping | Session patient/destination come from persisted Session; mapping query uses verified destination Hospital + persisted PatientReference on the same transaction client | SQL/domain integration | PASS — mocked PoolClient contract only; no live DB/RLS claim |
| `TC-PACS-004-MAP-001` | No mapping row | Deny as fixed `PATIENT_MAPPING_INVALID`; never infer/select another patient | Unit/integration | PASS — missing-row deny and minimized Audit query mock |
| `TC-PACS-004-MAP-002` | Multiple rows, wrong patient/hospital binding, `AMBIGUOUS`, `UNVERIFIED`, `REVOKED`, invalid record or `VALID` without `validatedAt` | Fail closed; fixed denial; no local Patient ID in result | Unit/integration | PASS — status/binding cases; duplicate-row persistence error fails closed; mock only |
| `TC-PACS-004-MAP-003` | Exactly one valid, evidence-backed mapping | Return internal `MAPPING_VALIDATED` and mapping ID only; does not authorize Import or invoke STOW | Unit/integration | PASS — mocked PoolClient; no import capability |
| `TC-PACS-004-AUD-001` | Mapping is missing/invalid after exact Authorization ALLOW | Record `PACS_TRANSFER_FAILED` / `FAILURE` / `PATIENT_MAPPING_INVALID` with actor, tenant, session, resource and correlation; no Patient ID, DICOM UID/payload or credential | DB/security | PASS — SQL/parameter unit contract only; live DB/RLS/audit atomicity NOT RUN |
| `TC-PACS-004-AUD-002` | Denial Audit write fails | Transaction rolls back; operation fails closed; no import/adapter continuation | DB/security | PASS — mocked transaction failure; live DB rollback NOT RUN |
| `TC-PACS-004-SEC-001` | Inspect the gate and its provider graph | Gate has no DICOM Gateway/STOW capability and no HTTP route; only a future full Preflight/import coordinator may call STOW | Structural/security | PASS — source/module wiring review; product no-STOW Acceptance remains NOT RUN |

**Required no-side-effect boundary:** For this ticket, mapping denial cannot issue a STOW request because the gate does not receive or resolve a DICOM Gateway. This is a scoped internal-gate guarantee, not proof of the absent product import endpoint. `AT-SEC-012` remains `NOT RUN` until a protected PACS Import application path invokes this gate, emits the required Audit, and demonstrates zero STOW requests and unchanged Hospital B destination state against Test Orthanc.

---

# P0 PACS Import Coordinator Preconditions — MEDIQ-PACS-001

**Current execution checkpoint (2026-10-03; supersedes historical notes below):** STAGE-005 is scoped PASS after the original DEC-011 scratch wrapper's exit 0 and owned cleanup. STAGE-009 is scoped PASS for the unregistered single-process boundary: corrected real multipart FLOW-001~003, CONC-001~003, LIFE-001~008 and exact 2 GiB/2,000-object workload. Final API 40 files/732 tests, typecheck/Port contract and isolated container resolution pass. No runtime activation, actual STOW consumer, clinical DICOM conformance, global multi-process bound or product E2E claim follows. MEDIQ-PACS-001 remains PARTIAL; next STAGE-010 SERVICE cleanup. [Evidence §26](implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md#26-dec-014-implementation-and-integrated-workload).

**Decision:** `PACS-001-DEC-001` (recommendation and Acceptance recorded before implementation)
**Current status (2026-10-03, DEC-012 follow-up):** Earlier identity/fence/handoff and scoped metadata/purge/quota evidence remains valid. API regression now passes 38 files/701 tests, including adapter admission and cooperative test-cleanup cases. DEC-011's first scratch payload-runtime round passed, but full DB-008 repeat/reset/reapply/cleanup is still running; STAGE-005 remains PARTIAL. STAGE-009 is PARTIAL: adapter-only tests pass, the initial maximum workload was cancelled by its test timeout, and the corrected-budget run is pending. STAGE-002/003/004/010/011/012, product coordinator and DEC-004 product Acceptance remain NOT RUN. See Ticket evidence §23; no runtime activation.
**Boundary:** No public import route, DICOM write capability or live STOW is enabled by this sub-gate.

**DEC-010 exact environment-cap subcase — PASS (scoped):** In disposable PostgreSQL, five independent synthetic Packages at their unchanged 2 GiB cap (128 × 16 MiB reservations each) reached exactly 10 GiB. A sixth, otherwise valid Package with zero reserved bytes was denied with quota-exhaustion SQLSTATE `54000` on its next 16 MiB reservation; global and probe Package/ref counters and ledger rows remained unchanged. This verifies the approved reservation quantum before any ciphertext for that block is written; it does not allocate 10 GiB of payload files. After confirming the test-owned ciphertext paths were absent, reservations were released through the normal `PURGED`+success-Audit quota-release path and counters returned to zero. Full DB/filesystem/Audit fault injection remains separate and open; evidence: [PACS-001 §19](implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md#19-stage-005-exact-10-gib-environment-quota-boundary).

PACS-001 must not become a thin wrapper that treats `MAPPING_VALIDATED` as transfer permission. An effect-capable coordinator is dependent on durable per-study transfer operation state/idempotency, operation-time Consent/Grant revocation fencing, PatientID binding, positive endpoint/TLS evidence, full integrity/provenance/Audit, STOW response handling and destination verification. The recommended implementation order is PACS-007 transfer lifecycle/idempotency, then PACS-001 coordinator. Existing policy/unit tests for action/scope or destination binding do not constitute complete product-operation evidence.

| Test ID | Scenario | Expected result | Scope | Result |
|---|---|---|---|---|
| `TC-PACS-001-CMD-001` | Caller injects Patient ID, local Patient ID, DICOM UID, destination Hospital, endpoint URL, credential or authorization evidence | Reject before authorization/data/network; no input echo or secret disclosure; references resolve only from server-owned Session/Study/Consent/Grant records | Internal application command | NOT RUN — coordinator not implemented |
| `TC-PACS-001-PRE-001` | Authentication/Tenant, Session/Study/Package/source binding, Consent, exact `PACS_IMPORT`/`study:pacs-transfer`, recipient/destination, PatientMapping, endpoint/TLS or integrity/provenance gate is missing/invalid/stale | Deny/fail closed before STOW; no patient/DICOM data returned; minimized denial Audit where required | Mandatory Preflight ordering | NOT RUN — product coordinator not implemented |
| `TC-PACS-001-PRE-002` | Caller substitutes Actor/Tenant, Session/Study/Package, Patient/Local Patient ID, Hospital, endpoint/URL, credential or Authorization evidence | Ignore no caller-provided authority; resolve exact references from authenticated identity and persisted server records; reject mismatches before source retrieval; never echo identifiers/secrets | Trusted reference resolution | NOT RUN — coordinator not implemented |
| `TC-PACS-001-PRE-003` | One or more persisted Session/source/package/Consent/Grant/action/scope/recipient/destination/PatientMapping facts are missing, expired, withdrawn, revoked, stale, cross-Tenant or contradictory | Fail closed; no `STOW_STARTED`, STOW call or patient/DICOM result; write only minimized denial Audit when its policy requires it | Mandatory evidence completeness | NOT RUN — full evidence resolver absent |
| `TC-PACS-001-PRE-004` | Source/destination endpoint is disabled, wrong-role, not allowlisted, non-HTTPS, untrusted CA, hostname mismatch or TLS validation fails | Reject before the corresponding PACS network call; no HTTP fallback, `verify=false` or credential disclosure | Endpoint/TLS | NOT RUN — endpoint/TLS resolver not integrated with coordinator |
| `TC-PACS-001-PRE-005` | Retrieved package is over configured bounds, has missing/extra instances, PatientID mismatch, changed bytes/digest, invalid integrity or incomplete provenance | Do not rewrite DICOM; do not dispatch; no `STOW_STARTED` or STOW call; sanitize the denial and preserve no payload in logs | Package identity/integrity/provenance | NOT RUN — product package/preflight path absent |
| `TC-PACS-001-PRE-006` | Required Audit writer, operation CAS, DB transaction, Session fence or evidence dependency fails | Roll back the authorization/operation transaction; do not call STOW; return a fixed fail-closed/unavailable result | Audit and persistence fail-closed | NOT RUN — full coordinator absent |
| `TC-PACS-001-DISPATCH-001` | All preflight evidence is valid at dispatch time; final Consent/Grant state may have changed during source retrieval | In one short verified-Tenant transaction, acquire the shared Session fence, re-read mutable evidence, re-evaluate exact `PACS_IMPORT`, transition legally through `PREFLIGHT_PASSED` to durable `STOW_STARTED`, and write required Audit; commit before one STOW call | Atomic Authorization/dispatch claim | NOT RUN — no coordinator; decision `PACS-001-DEC-004` |
| `TC-PACS-001-DISPATCH-002` | Consent withdrawal/Grant revocation races the dispatch claim | If mutation commits before dispatch-claim commit, deny and call STOW zero times; after claim commit, do not claim remote cancellation/recall; no network I/O while holding DB transaction/fence | Linearization and lock lifetime | NOT RUN — only internal fence sub-gate exists |
| `TC-PACS-001-DISPATCH-003` | CAS, required Audit insert, or transaction commit fails while claiming dispatch | Operation transition/Audit roll back atomically and STOW count remains zero; commit must be observed before Gateway invocation | Commit-before-effect | NOT RUN — coordinator absent |
| `TC-PACS-001-DISPATCH-004` | STOW response times out, connection drops, worker stops or result is ambiguous after dispatch claim commit | Persist/retain `RESULT_UNKNOWN`; never blind-retry or claim completion; only a separate bounded read-only reconciliation may resolve it | Ambiguous outcome/no retry | NOT RUN — PACS-007 primitive exists; coordinator/reconciliation absent |
| `TC-PACS-001-DISPATCH-005` | Same idempotent request is replayed or concurrent duplicate Session/Study dispatches race | At most one durable dispatch claim and at most one STOW attempt; exact replay does not resend; changed semantics conflict | Idempotency/concurrency | NOT RUN — PACS-007 persistence primitive exists; product invocation absent |
| `TC-PACS-001-COMP-002` | STOW response is successful/partial but destination does not contain exactly the expected verified SOP Instance set, or integrity/provenance/Audit verification fails | Do not mark `COMPLETED`; preserve `PARTIAL`/`RESULT_UNKNOWN`/`FAILED` according to verified evidence; only exact verified destination and complete evidence can complete | Destination verification/completion invariant | NOT RUN — no product import path |
| `TC-PACS-001-SEC-002` | Inspect route/module/worker and DICOM Gateway wiring before every preceding product Acceptance passes | No public import route or reachable effect-capable STOW path; keep the feature disabled until `AT-SEC-012/013`, `AT-FUNC-012` and `AT-E2E-003` pass | Release/scope gate | NOT RUN — implementation pending |
| `TC-PACS-001-FENCE-001` | PACS operation-time authorization runs while a Consent/Grant mutation may race | Acquire the canonical Session transaction fence before querying current Authorization evidence; policy query and DB-only callback share one verified Tenant transaction | Authorization ordering | PASS — API ordering test + isolated PostgreSQL integration |
| `TC-PACS-001-FENCE-002` | Grant revocation or Consent withdrawal commits before PACS obtains the Session fence | Resolve the committed current state after acquiring the fence; deny before callback; no authorization token, DICOM request or operation-state change | Revocation-first | PASS — post-revocation operation denied; persisted withdrawn Consent denied; callback not invoked |
| `TC-PACS-001-FENCE-003` | PACS obtains the Session fence and enters its DB-only callback while the exact recipient attempts Grant revocation | Revocation blocks on the same Session fence until callback transaction commits; then revoke succeeds. No DICOM/network operation is performed. This verifies DB serialization only, not a transfer. | Fence-first concurrency | PASS — real `GrantRevocationService` + two PostgreSQL connections in isolated synthetic DB |
| `TC-PACS-001-FENCE-004` | Session fence, evidence query, or policy dependency fails | Deny/unavailable with sanitized error; protected callback is never invoked | Fail-closed | PASS — unit cases prove both lock failure and policy-engine exception return sanitized unavailable without callback; persisted Consent/Grant denial also passed in PostgreSQL integration |
| `TC-PACS-001-FENCE-005` | Inspect code and database after the fenced mapping-eligibility check | No DICOM Gateway invocation, STOW/POST, `pacs_transfer_operations` state transition, or reusable authorization capability. This DB-only test does not query B Orthanc; product B-unchanged evidence remains a separate Acceptance. | No-side-effect internal gate | PASS scoped — operation-row count unchanged and no DICOM call/route; B Orthanc not directly probed here |
| `TC-PACS-001-PID-001` | Validate a synthetic destination PatientID and all per-instance source PatientIDs | Accept only a non-empty instance set where every source ID is canonical `TEST-*` and exactly equals the server-resolved destination mapping; return no ID values | Pure identity gate | PASS — 11 cases; match, empty/malformed/overlength, mismatch and invalid mapping covered; result contains no PatientID |
| `TC-PACS-001-PID-002` | WADO Study metadata contains missing, malformed, multi-valued PatientID or wrong VR | Reject malformed metadata with a fixed sanitized upstream error; internal projection includes one ID per instance only; no ID is logged or returned publicly. Different IDs across instances are denied by PID-001. | Adapter contract/read-only Orthanc | PASS — 4 unit cases; A Orthanc read-only integration confirmed each synthetic instance's ID matches the fixture mapping; unrelated patient fields are excluded |
| `TC-PACS-001-PID-003` | Mismatched/missing identity is exercised through the eventual transfer coordinator | Zero STOW calls and unchanged B destination; byte-preserving P0 never rewrites any DICOM identity attribute | Product no-side-effect integration | NOT RUN — no coordinator; must be proven separately even after PID-001/002 pass |
| `TC-PACS-001-STATE-001` | Exact same semantic request is replayed; same operation key is reused for changed scope/resource; concurrent operation is attempted | Exact replay returns the same operation; changed semantics conflict; only one transfer claim may own a given session/study side effect | Durable idempotency/concurrency | NOT RUN — PACS-001 coordinator/HTTP path absent; ledger primitive scoped PASS under PACS-007 |
| `TC-PACS-001-UNKNOWN-001` | STOW request may have started but response is lost/timeout | Persist `RESULT_UNKNOWN`; do not retry STOW; perform bounded read-only destination reconciliation and preserve uncertainty until proven | Unknown outcome/recovery | NOT RUN — durable unknown/no-retry primitive PASS under PACS-007; coordinator and reconciliation absent |
| `TC-PACS-001-COMP-001` | STOW returns success/partial success or destination verification/integrity/provenance/Audit fails | `COMPLETED` only when expected and destination SOP UID sets match and integrity/provenance/Audit gates pass; otherwise remain partial/unknown/failed, never false success | Completion invariant | NOT RUN — product import path absent |
| `TC-PACS-001-SEC-001` | Inspect module/API registration before all prerequisite Gates pass | No public PACS route and no effect-capable STOW path is registered; `AT-FUNC-012`, `AT-SEC-012/013`, `AT-E2E-003` remain separate full-path Acceptance | Scope/release gate | NOT RUN — implementation pending |
| `TC-PACS-001-HANDOFF-001` | Valid synthetic operation passes source capture and the exact instance streams are hashed | Return a coordinator-only in-memory object binding the persisted operation/session/package/study/source/destination references, pending source-evidence reference/digest/count, and the exact server-derived Series/SOP inventory; do not include PatientID/Local Patient ID | Internal source-evidence handoff | PASS (scoped) — focused unit + real synthetic HTTPS Orthanc A/DB integration; see [PACS-001 evidence §8](implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md#8-pacs-001-dec-005--ephemeral-source-identity-handoff) |
| `TC-PACS-001-HANDOFF-002` | Caller adds or substitutes Series/SOP inventory, Patient ID, hospital, Study UID, endpoint, credential, digest, mapping, or Authorization evidence | Reject unknown/authority-bearing input before PACS I/O; resolve all inventory and bindings from persisted records and validated source metadata | Trust boundary | PASS (scoped) — forged input rejected before Authorization or DICOM calls; evidence §8 |
| `TC-PACS-001-HANDOFF-003` | Consent/Grant denial, invalid mapping/PatientID, malformed metadata, source stream/hash failure, changed scope, failed final fence, or persistence/Audit failure | Return no coordinator handoff and no partial inventory; preserve existing sanitized denial/unavailable behavior and evidence rollback | Fail-closed | PASS (scoped) — unit denial/failure matrix and isolated runtime-role evidence/Audit failure injection; evidence §8 |
| `TC-PACS-001-HANDOFF-004` | Serialize the ordinary `capture()` result or its denial/error | Preserve the existing success allowlist exactly (`kind`, `evidenceId`, `status`, `objectCount`); no Series/SOP UID, digest, PatientID, Local Patient ID, endpoint, credential, or raw error enters the ordinary result | Output minimization | PASS (scoped) — ordinary capture remains four-field allowlist under API regression; evidence §8 |
| `TC-PACS-001-HANDOFF-005` | Inspect service type, module graph, execution and Test Orthanc state for this handoff slice | Retrieval-only DICOM port; no `storeInstanceStream`, no `PREFLIGHT_PASSED`/`STOW_STARTED` transition, no route/controller/worker; A reads only, B unchanged and zero STOW/POST | No-side-effect boundary | PASS (scoped to internal handoff) — isolated HTTPS A reads, B EMPTY before/after, zero STOW/destination verification, operation `CREATED`; this is not the full product no-STOW gate; evidence §8 |
| `TC-PACS-001-HANDOFF-006` | Compare returned inventory to the exact metadata descriptors whose instance streams produced the pending manifest | Every Series/SOP pair appears once, under the exact server-resolved Study; count equals manifest object count; no caller-derived or later re-queried identity is accepted | Source identity/integrity binding | PASS (scoped) — exact source-fixture Series/SOP set and byte manifest match; evidence §8 |
| `TC-PACS-001-HANDOFF-007` | Final pending-evidence or success-Audit persistence/transaction fails | No handoff is observable to the caller; evidence/Audit transaction rolls back according to `INT-001-CAP-012`, and operation remains at its recorded pre-dispatch state | Commit-before-handoff | PASS (scoped) — actual isolated PostgreSQL runtime-role evidence/Audit INSERT failure plus unit commit-failure injection; no evidence/success Audit and operation remains `CREATED`; evidence §8 |
| `TC-PACS-001-DIGEST-001` | Build a source manifest from a fixed synthetic multi-instance byte fixture | Return each exact SOP UID's byte length and `sha256` digest, plus the unchanged deterministic `SHA256-MANIFEST-V1` aggregate known vector | Per-instance byte integrity | PASS (scoped) — fixed aggregate vector and exact per-instance digests; evidence §9 |
| `TC-PACS-001-DIGEST-002` | Reorder source descriptors or provide mismatching/duplicate SOP metadata | Per-instance evidence is canonically ordered, one-to-one with the validated descriptors, and no duplicate/extra/missing instance is accepted | Deterministic binding | PASS (scoped) — reordered descriptors yield byte-identical immutable evidence; existing duplicate/count/error matrix passes; evidence §9 |
| `TC-PACS-001-DIGEST-003` | Successful `captureForCoordinator()` after source streaming | Bind each digest and exact byte length to the same server-derived Series/SOP pair whose WADO stream was hashed; aggregate object count and total bytes equal the per-instance sums | Coordinator-only source evidence | PASS (scoped) — exact HTTPS A synthetic byte fixture and independent stream observer; evidence §9 |
| `TC-PACS-001-DIGEST-004` | Consent/Grant/mapping/source/hash/fence/evidence/Audit/commit failure | Return no partial per-instance UID/hash/length inventory; preserve fixed sanitized denial/unavailable behavior | Fail closed | PASS (scoped) — unit denial/failure matrix and isolated runtime-role persistence/Audit failures; evidence §9 |
| `TC-PACS-001-DIGEST-005` | Serialize ordinary `capture()` success/denial and inspect persisted source evidence | Ordinary success remains exactly `kind`, `evidenceId`, `status`, `objectCount`; PostgreSQL stores only the existing aggregate evidence, with no per-instance UID/hash/length, payload, PHI or new schema | Data minimization | PASS (scoped) — allowlist regression, unchanged aggregate evidence persistence and no schema/migration; evidence §9 |
| `TC-PACS-001-DIGEST-006` | Inspect module/API graph, operation state, Test Orthanc counters and B baseline | Digest handoff remains internal and non-authorizing; no route/worker, `PREFLIGHT_PASSED`/`STOW_STARTED`, destination call, STOW/POST or B mutation occurs | No-side-effect boundary | PASS (scoped) — operation stayed `CREATED`, B EMPTY before/after and zero destination/STOW calls; not the full product no-STOW gate; evidence §9 |
| `TC-PACS-001-STORE-CORE-001` | Stage one synthetic byte stream, seal the in-process package, then read it through the internal primitive | File contains only AES-256-GCM ciphertext; authenticated read returns exact byte length/SHA-256/source bytes; no route or external consumer is registered | Cryptographic spool primitive | PASS (scoped) — local unit test only; not connected to source capture; evidence §10 |
| `TC-PACS-001-STORE-CORE-002` | Read with a different Tenant or StudyReference binding | Deny before bytes are returned; use sanitized error only | In-memory binding | PASS (scoped) — local unit tests; no database/RLS claim; evidence §10 |
| `TC-PACS-001-STORE-CORE-003` | Tamper with stored ciphertext | GCM authentication fails and no plaintext result is returned | Authenticate-before-release primitive | PASS (scoped) — local unit test; no downstream port exists; evidence §10 |
| `TC-PACS-001-STORE-CORE-004` | Read at TTL and repeat an in-process purge | Deny immediately at expiry; purge removes the package directory and is idempotent in the live process | Primitive expiry/purge | PASS (scoped) — no durable metadata or Audit claim; evidence §10 |
| `TC-PACS-001-STORE-CORE-005` | Narrow the unit instance cap and exceed it | Reject and remove partial ciphertext; injected limits cannot raise the fixed production maxima | Primitive bound | PASS (scoped) — small-fixture unit test; environment-wide quota concurrency remains untested; evidence §10 |
| `TC-PACS-001-STORE-CORE-006` | Instantiate a new process store over a directory containing old package files | Initialization/read fail with `RECOVERY_REQUIRED`; no restart/replica decryption or automatic unaudited cleanup | Process-key lifecycle | PASS (scoped) — fail-closed unit test; Tenant cleanup/Audit recovery remains NOT RUN; evidence §10 |
| `TC-PACS-001-STORE-CORE-007` | Race three in-process package writers against a narrowed shared 8-byte environment cap, then abort and retry | Synchronous quota reservation permits at most two 4-byte writes; the third fails closed and aborted reservations are released | Single-process admission primitive | PASS (scoped) — local unit test; no cross-process/shared-volume claim; evidence §10 |
| `TC-PACS-001-STAGE-001` | Capture a bounded synthetic instance whose exact stream also produces the expected source digest, then read it through the trusted internal storage port | Stored object decrypts to byte-for-byte identical content only after full authentication; length and SHA-256 equal the exact `DIGEST` handoff; source bytes are not re-fetched or caller-substituted | Exact-byte staging | **PASS (scoped, internal)** — actual signed-OIDC/registry/RLS/HTTPS-Orthanc capture and exact three-instance byte/hash readback through the same encrypted store; source-only wrapper 92681 passed. No deployed mount/coordinator/STOW claim. Evidence §54. |
| `TC-PACS-001-STAGE-002` | Inspect staged files, process key registry, database rows and logs | DICOM file content is AES-256-GCM ciphertext; each instance uses an independent random 256-bit DEK held only in process memory; no raw/wrapped DEK or KEK, plaintext, UID, PatientID or payload is persisted/logged/Audited; reference is opaque and not a URL/path | At-rest confidentiality and minimization | **PARTIAL** — actual encrypted lifecycle, quota/metadata/Audit/live-value/output and ordinary projection gates pass (§54). No deployed volume/process-dump guarantee; process-key/crypto component evidence must remain separately scoped in the full reconciliation. |
| `TC-PACS-001-STAGE-003` | Alter, truncate, swap or replay ciphertext, nonce/tag or authenticated metadata; restart the process or read from another replica | Authentication/binding fails closed before any plaintext is returned or destination port invoked; process restart/other replica cannot decrypt; old bytes are purge-only and may be re-fetched only before `STOW_STARTED`; no fallback or blind retry | Authenticate before release and key lifecycle | **PARTIAL** — actual corrupt/truncated/swapped ciphertext and independent no-DEK replica/purge-only scenarios pass in 92681; nonce/tag/key/binding variants have component evidence. No killed-origin/host-crash or destination integration claim. Evidence §§43, 54–55. |
| `TC-PACS-001-STAGE-004` | Read with wrong Tenant, Session, Package, StudyReference, purpose, object reference, expected digest, or after expiry | Deny before plaintext release; exact binding is checked from server-owned metadata and authenticated data; no destination call, no identifier/secret echo | Object-scope authorization | **PARTIAL** — actual source/read Consent/Grant/Tenant/mapping/actor/current-metadata checks and no callback on denial verified; exhaustive selector/fault matrix also has explicit model evidence. Finish LIFECYCLE mapping before full-stage acceptance; no runtime mount/consumer activation. Evidence §§37, 54–55. |
| `TC-PACS-001-STAGE-005` | Exercise 64 MiB+1 instance, 2,001 objects, 2 GiB+1 aggregate per ImagingPackage/Exchange, shared 10 GiB environment quota exhaustion from at least two independent `mediq_runtime` sessions, same-ref competing writers, and reserve/settle/release fault boundaries | Reject before accepting bytes or objects beyond each cap; serialize DB-backed 16 MiB reservations so environment and package aggregates never exceed 10 GiB/2 GiB; runtime has only EXECUTE on fixed quota functions and no direct counter/ledger privileges; exact Tenant/Study/ref/expiry/writer binding is required; successful seal settles to actual bytes; quota is released only after ciphertext absence and atomically with `PURGED`+success Audit; DB/quota/filesystem/Audit failure is fail-closed, retains retryable reservation where ciphertext may remain, and never records false success; source store reserves before ciphertext writes | Resource-exhaustion control and least privilege | **PASS (scoped)** — exact size/object/2 GiB/10 GiB bounds, independent-session contention, binding/RLS/function-only grants and full DEC-011 reserve/write/sync/settlement/release/Audit failure matrix verified by synthetic tests and disposable PostgreSQL. Original wrapper exit 0 after clean/repeat/reset/reapply/cleanup; no persistent DB or runtime activation. Evidence §§17–19, 21 and 26. |
| `TC-PACS-001-STAGE-006` | Persist and reload temporary payload metadata for a `PACS_TRANSFER_OPERATION`/`STUDY_REFERENCE` under `mediq_runtime` and verified Tenant RLS | `study_references` stores only the exact temporary payload fields (`temporary_storage_ref`, `temporary_payload_state`, `temporary_payload_expires_at`, `temporary_payload_purged_at`); operation/session/package/study binding is resolved and cross-checked from server-owned rows; only exact column grants; package metadata is not mutated; no table-wide privilege or RLS bypass | Least privilege and operation-level metadata binding | PASS — PostgreSQL scratch verified exact grants/forced RLS, metadata persistence and reload, operation binding, no-context/wrong-Tenant denial, package unchanged |
| `TC-PACS-001-STAGE-007` | Purge one transfer operation's payload on terminal outcome, explicit close, expiry or capture failure; repeat the same purge | Commit `PURGE_PENDING` first; expired/pending objects are unreadable; destroy in-process DEK/nonce/tag buffers before unlink; confirm only the exact ciphertext directory is absent before atomically committing `PURGED` and success Audit; repeat is idempotent; ImagingPackage and sibling Study payload remain unchanged | Lifecycle and purge evidence | PASS — scoped internal synthetic + scratch PostgreSQL/RLS test; no runtime registration |
| `TC-PACS-001-STAGE-009` | Stream the maximum bounded Study with instrumented source, crypto and downstream ports | Backpressure is preserved; only one instance plaintext buffer (≤64 MiB) is released at a time; at most two DICOM operations execute concurrently; no whole-Study RAM/Blob buffer or plaintext disk spill | Memory and streaming bounds | **PASS (scoped, unregistered single process)** — actual multipart adapter → manifest/crypto → borrowed consumer at exact 2 GiB/2,000 objects, max source lag 262,145 bytes, one ≤64 MiB consumer buffer; default adapter two-permit CONC and cross-store LIFE cases pass separately. No global/multi-process memory or active product runtime guarantee. Evidence §26. |
| `TC-PACS-001-STAGE-010` | Run expiry cleanup for two synthetic Tenants, including missing/inactive service actor and invalid Tenant context | Each cleanup runs as that Tenant's verified active `SERVICE` Actor under forced RLS and exact grants; absent identity/context fails closed and retries; no global unrestricted query, superuser, migration role or `BYPASSRLS` | Tenant-isolated cleanup | **PASS (scoped, unregistered DEC-016 baseline)** — 32 expiry unit/model cases and three signed-OIDC/real-RLS/ciphertext rounds; original DB-008 ScratchOnly wrapper exited 0 with repeat/reset/reapply/final cleanup and independently confirmed zero owned resources. Evidence §34. No deployed scheduler, persistent DB regression or DEC-017 acceptance is implied |
| `TC-PACS-001-STAGE-011` | Inspect PostgreSQL, Audit, application logs, crash diagnostics and ordinary `capture()` serialization | No DICOM binary, raw/wrapped key, SOP/Study UID, PatientID, filesystem path or arbitrary exception is stored/emitted; ordinary response remains the exact existing allowlist | Privacy boundary | **PARTIAL** — live/final schema/value and ordinary response/error/output privacy observers pass (§54), preserving approved source UID/PatientMapping baseline and no new copies. Bounded scans do not prove OS/process dumps, arbitrary encodings or future runtime logs. |
| `TC-PACS-001-STAGE-012` | Exercise the implemented temporary-storage path with isolated Test Orthanc A/B and an independent DB/Audit observer | A-only authorized QIDO/WADO; B remains EMPTY before/after; zero STOW/POST/destination writes, no `PREFLIGHT_PASSED`/`STOW_STARTED`, and the existing development stack is unchanged | No-side-effect boundary | **PASS (scoped, internal)** — actual 57-case wrapper 92681, independent B EMPTY before/after, exact CREATED/no-STOW/Audit/evidence checks and automatic cleanup; independent zero owned resources and healthy unchanged existing stack. No destination transfer or runtime activation authorized. Evidence §54. |
| `TC-PACS-001-STAGE-008` | Inject physical-storage removal, metadata update, Tenant-context/transaction and Audit-writer failures at purge boundaries | A failure before `PURGE_PENDING` commit never touches storage; failure after it leaves the ref retryable and unreadable; keys are destroyed before unlink attempt; no success Audit or `PURGED` state before path absence; retry converges to exactly one success Audit without cross-Tenant/sibling mutation | Fail-closed cleanup recovery | PASS — scoped injected failures/retry and scratch PostgreSQL/RLS; host disk/power-loss faults not covered |
| `TC-PACS-001-STAGE-013` | Create two Study-scoped transfer operations sharing one `ImagingPackage`; stage concurrently, purge one, and retry the other only before `STOW_STARTED` | Each `StudyReference` has independent opaque storage ref/state/expiry; same-operation concurrent staging is denied; purge/retry of one Study cannot overwrite, deny or purge the sibling; after `STOW_STARTED`, re-fetch is denied; no DICOM UID or payload enters temporary metadata/Audit | Shared-package isolation and retry scope | PASS — metadata plus local physical sibling-isolation sub-scope; no runtime registration |
| `TC-PACS-001-STAGE-014` | Restart the storage primitive with staged ciphertext, then recover using the exact opaque ref read from a verified Tenant metadata row; repeat across unlink/final-metadata/Audit failures and concurrent purge calls | Restarted process cannot decrypt; recovery is purge-only and cannot accept a path; unresolved discovered refs block reads/new staging; safe unlink is confined to a real package directory containing regular UUID `.enc` files and rejects symlinks/unexpected entries; missing path is idempotent; only after removal may metadata/Audit finalize; ambiguous commit/retry yields one Audit; sibling payload remains available; no route/STOW | Restart and physical lifecycle | PASS — scoped restart/purge-only, retry, concurrency and scratch PostgreSQL/RLS evidence; final whole `-ScratchOnly` wrapper passed (see `MEDIQ-PACS-001` evidence §13) |

### PACS-001 STAGE-005 quota failure matrix — PACS-001-DEC-011

DEC-011 closes only deterministic application/database failure boundaries within the unregistered temporary store. Tests use synthetic bytes and the DB-008 disposable `-ScratchOnly` stack; no persistent DB, Orthanc, runtime provider/volume, route, destination call or STOW is allowed. Host power-loss, disk-controller/volume durability, multi-host failover and production database outages remain separate operational gates.

**Current failure-matrix result:** FAIL-001~004 PASS within the synthetic local-store/disposable PostgreSQL boundary. Original DEC-011 wrapper exited 0 after all clean/repeat/reset/reapply rounds and owned cleanup; final API regression is 732/732. Store quota failures are modeled where stated, while settlement/release rollback and RLS are real PostgreSQL evidence. No persistent DB or production-outage claim. Evidence §26.

| Test ID | Injected boundary | Required result | Current result |
|---|---|---|---|
| `TC-PACS-001-STAGE-005-FAIL-001` | Shared quota reserve fails before first ciphertext write, or a later 16 MiB reservation fails after an earlier reservation/write succeeded | Stop consuming source; return fixed `QUOTA_UNAVAILABLE`; do not issue a receipt or expose bytes; remove partial local object when removal succeeds; never release committed reservation in the writer; normal purge must retain/release it only through `PURGE_PENDING` → physical absence → `PURGED`+success Audit | PASS — local synthetic store tests with modeled quota; final matrix wrapper/cleanup confirmed in §26 |
| `TC-PACS-001-STAGE-005-FAIL-002` | Ciphertext file write fails after a quota reservation, including a partial write; ciphertext sync fails during completion | Return fixed `STORAGE_UNAVAILABLE`; do not seal or make an object readable; destroy in-memory key material and attempt partial-file cleanup; retain DB reservation until authoritative purge; if cleanup is incomplete, reads/staging fail closed and purge remains retryable | PASS in local filesystem tests including cleanup obstruction/retry; no forensic memory-erasure claim |
| `TC-PACS-001-STAGE-005-FAIL-003` | Quota settlement fails or the successful DB commit acknowledgement is lost | Package is not reported sealed/readable until settlement is positively confirmed; exact same settlement may be retried idempotently; no new writes after finalization begins; unresolved state can only be purged through the normal lifecycle | PASS — store and all applicable scratch PostgreSQL rounds; final wrapper exit 0 and cleanup confirmed |
| `TC-PACS-001-STAGE-005-FAIL-004` | SQL error immediately before/after `release_temporary_payload_quota` inside the final `PURGED`+Audit transaction after physical payload absence | Entire transaction rolls back: StudyReference remains `PURGE_PENDING`, reservation and both counters remain unchanged, no success Audit is committed; retry after recovery yields one `PURGED` state, one success Audit and one quota release | PASS — all applicable scratch PostgreSQL rounds; final wrapper exit 0 and cleanup confirmed. Injection is at the SQL call boundary, not inside the PL/pgSQL function |

Prior `TC-PACS-001-STAGE-008/014` evidence remains authoritative for failure before `PURGE_PENDING`, unlink failure, Audit rollback, ambiguous commit/retry, key destruction ordering, idempotency and sibling isolation; DEC-011 does not reclassify those cases. The completed FAIL-001~004 results and wrapper cleanup are recorded in §26; overall STAGE-005 is now scoped PASS, not runtime activation.

### PACS-001 STAGE-009 maximum workload — DEC-012

`TC-PACS-001-STAGE-009-MAX-001` requires an explicit separate-process test of exactly 2 GiB in 2,000 synthetic objects (one 64 MiB instance), lazy chunks ≤64 KiB, real AES-GCM/filesystem staging and complete authenticated sequential readback. Assert unchanged ceilings, exact object/byte/digest agreement, one active source, no next pull during pending ciphertext writes, and one consumer buffer ≤64 MiB while awaiting its acknowledgement. Record measured peak RSS/array-buffer memory and duration; measured array-buffer use must remain below the 512 MiB test safety guard (not a product SLO). Inventory only ciphertext objects, then purge all test-owned payload and remove the empty unique temporary directories. At least 4 GiB free space is required up front. No network, PACS/STOW, DB or patient information is used. This does not validate DICOM encoding or clinical images.

**Before implementation:** NOT RUN. This subcase cannot alone close `STAGE-009`: integrated adapter concurrency (at most two DICOM operations), production-intended consumer buffer lifetime/backpressure and the later authorized runtime path remain separate. Never replace those requirements with sequential test-harness behavior.

**Current result:** MAX-001 and LIFE-008's revised primitive workload pass (§§24–25); FLOW-003 additionally passes through the real corrected multipart adapter (§26). Initial timeout, cancellation race and false-truncation failures remain recorded, not erased. CONC-001~003 and LIFE-001~008 pass. Combined evidence closes scoped STAGE-009, not active runtime Authorization/STOW or cross-process guarantees.

`TC-PACS-001-STAGE-009-CONC-001~003` (before implementation: NOT RUN): use the real adapter and only a synthetic HTTP responder. (001) Two WADO body lifetimes occupy the default two permits; a third request cannot reach HTTP until the first body reaches EOF. (002) Explicit body cancellation releases a permit exactly once and permits the third request. (003) Eight queued operations are bounded; a ninth queued request fails with fixed capacity error without HTTP, aborting queued requests makes no extra HTTP calls, and a fresh request succeeds after cleanup. Do not infer cross-process/global-instance limits or the full integrated STAGE-009 result from these adapter-only cases.

Test-harness cancellation regression (DEC-012 follow-up, before implementation): abort the object-count exercise immediately after its third awaited writer creation; no fourth writer may open, all three writers must be aborted/closed, and the exact object directory must be empty before teardown. The full 2,000-object ceiling assertion and its timeout remain unchanged; cancellation is a failed/incomplete exercise, never PASS for the quota ceiling.

Maximum-workload execution budget follows the unchanged DEC-007 bounds: source capture ≤30 minutes, post-capture inventory/read-consumer phase ≤15 minutes, with a 47-minute outer test ceiling including cleanup. The initial arbitrary 10-minute harness cancellation is a failed/incomplete attempt, not evidence of a product deadline violation or a passed workload. Record phase durations and retain all exact maxima and memory assertions on rerun.

### PACS-001 STAGE-009 borrowed buffer lifetime — DEC-013

**Current result:** LIFE-001~008 PASS in the isolated internal-primitive scope, including 21 lifetime cases and exact maximum-workload readback/zeroing. Their pre-implementation state was NOT RUN. Verifier-hook invocation does not prove actual runtime Consent/Grant/RLS decisions; no route, runtime registration or STOW is authorized.

| Test ID | Required success/failure/denial behavior |
|---|---|
| `TC-PACS-001-STAGE-009-LIFE-001` | Fully authenticate/length/hash-check before the consumer receives exact synthetic bytes; return void, then zero the same owned buffer before releasing admission. Tamper/digest/binding failures never call the consumer |
| `TC-PACS-001-STAGE-009-LIFE-002` | Two distinct store instances share the one-active lifetime gate; a slow consumer blocks the next decrypt/consumer, not merely the next callback |
| `TC-PACS-001-STAGE-009-LIFE-003` | Eight waiting requests contain metadata only; ninth waiting request rejects before verifier/decrypt; queued abort removes its entry; no permit leak after cancellation |
| `TC-PACS-001-STAGE-009-LIFE-004` | Required verifier runs after queue admission before decrypt, then after authentication before delivery. A rejection at either boundary emits only AUTHORIZATION_DENIED and no consumer call; absent verifier is invalid, not default allow |
| `TC-PACS-001-STAGE-009-LIFE-005` | TTL expiry or purge while queued or during final verifier blocks delivery and zeroes any owned plaintext |
| `TC-PACS-001-STAGE-009-LIFE-006` | Consumer throw is sanitized and owned bytes are zeroed. In-flight cancellation cannot release admission until consumer settles, even if it ignores abort; next request then proceeds |
| `TC-PACS-001-STAGE-009-LIFE-007` | Mutating caller-owned request/binding objects while waiting cannot change the queued immutable selectors or digests |
| `TC-PACS-001-STAGE-009-LIFE-008` | Raw-buffer read method is not publicly callable; primitive remains unregistered/non-authorizing; updated maximum workload uses the actual borrowed-buffer boundary without reduced bytes/object/memory constraints |

LIFE-004 requires an explicit `VERIFIED` result at both verifier boundaries. Void, false, denial strings, unknown strings or structurally similar objects are not authorization and must fail closed. LIFE-005 also tests expiry/purge while queued, not only during the final verifier.

### PACS-001 STAGE-009 integrated WADO flow — DEC-014

**Current result:** FLOW-001~003 PASS (scoped), with DEC-015's slow-valid/truncated regression, final API 732/732 and exact integrated workload/cleanup recorded in §26. Pre-implementation was NOT RUN. Required cases remain: FLOW-001 feeds the actual multipart adapter an 8 MiB synthetic body in lazy 64 KiB chunks, holds consumption, and requires ≤512 KiB upstream prefetch at the stalled boundary. FLOW-002 preserves the existing exact 64 MiB cap and denial above it, abort/timeout/multipart/header/part-count checks, sanitized errors, upstream closure and permit reuse; no successful complete capture may follow a cap violation. FLOW-003 runs the unchanged exact 2 GiB/2,000-object workload through the actual adapter, manifest/encrypted store and DEC-013 borrowed consumer, records bounded in-flight source lag plus memory/durations/cleanup, and uses an injected synthetic HTTP responder only. No actual PACS, DB or STOW, and no claim that test verifier hooks implement Authorization.

### PACS-001 STAGE-010 verified SERVICE cleanup — DEC-016

Before implementation: all cases NOT RUN. Use generated ciphertext and disposable DB-008 PostgreSQL only; the worker remains internal/unregistered. Existing exact schema/grants/RLS are preserved. Prior STAGE-005/009 PASS does not certify these cases.

**Current DEC-016 execution (2026-10-03):** Bounded discovery, immutable commands and SERVICE/atomic-expiry rechecks are implemented. 32 expiry unit/model cases plus six prior purge cases pass; API 41 files/764 tests, typecheck and Port contract pass, including the commit-time rerun. The first signed-OIDC/two-Tenant PostgreSQL/ciphertext integration round now passes in the existing DB-008 disposable workflow; full repeat/reset/reapply, final exit and owned cleanup remain pending. Modeled SQL is not RLS evidence. STAGE-010 and CLEAN acceptance remain PARTIAL until the whole-wrapper gate completes (evidence §§29–30).

| Test ID | Required success/failure/denial behavior |
|---|---|
| `TC-PACS-001-STAGE-010-CLEAN-001` | Signed synthetic OIDC principals resolve to active Tenant-level SERVICE actors for two Tenants; each batch discovers and purges only its Tenant-owned operation refs under real forced RLS; unexpired sibling and other-Tenant ciphertext remain unchanged |
| `TC-PACS-001-STAGE-010-CLEAN-002` | Missing/invalid principal, inactive/unknown actor or Tenant, USER, hospital-bound SERVICE, wrong Tenant or invalid verified context denies before candidate SQL/physical purge; no false empty-success batch |
| `TC-PACS-001-STAGE-010-CLEAN-003` | Expired STAGING/AVAILABLE/PURGE_PENDING selected; null metadata, unexpired and PURGED omitted; candidate graph, reference and expiry are rechecked by atomic mark-pending update; stale/ref-replaced/expiry-extended targets do not touch files |
| `TC-PACS-001-STAGE-010-CLEAN-004` | One failed purge does not erase its retry reference or report success; healthy candidates finish; retry converges to one final success Audit/quota release; duplicate/concurrent calls remain idempotent |
| `TC-PACS-001-STAGE-010-CLEAN-005` | Active SERVICE checked in discovery and each purge metadata transaction; deactivation/type change after discovery denies before physical effects; loss after committed purge admission leaves finalization retryable without fabricated Audit |
| `TC-PACS-001-STAGE-010-CLEAN-006` | Discovery/mark/finalization transactions commit or roll back and reset context; no DB transaction remains open during physical purge; exact runtime column/function grants and no-context/cross-Tenant RLS remain enforced |
| `TC-PACS-001-STAGE-010-CLEAN-007` | Batch limit is validated (default 50, max 100), query is bounded by limit+1, stable ordering and sequential purge; result exposes only fixed aggregate counters/hasMore; input mutation and invalid clock cannot redirect deletion |
| `TC-PACS-001-STAGE-010-CLEAN-008` | No route/controller/provider/active timer/worker registration, unrestricted global sweep, superuser purge, PACS/network transfer or STOW is introduced; evidence distinguishes isolated worker execution from deployed scheduling |

### PACS-001 source/lifecycle integration — DEC-017

**R9/R9-A scoped actual result (2026-10-03 22:27 KST):** Corrected source wrapper 87439 exited 0, 58 cases/live+final observers/B EMPTY/log privacy/automatic cleanup; independent zero resources/unchanged inputs/healthy existing services. LIFECYCLE-010 has actual caller-negative and same-role READ ONLY overlap evidence, including exact returned-client reset and both idempotent purge attempts with one final Audit. Old global-monitor RED and native-reader/model denial regressions are retained. This is internal-only scoped PASS, not original product transfer or LIFECYCLE-014: updated API 32141 separately timed out, and R9-B diagnosis/revalidation remains pending. Evidence §59.

**R9-B final current regression (22:32 KST):** After bounded phase-diagnostic contracts (4 PASS), the targeted old timeout case passed and full 33404 exited 0: **43 API files/894 tests**, build/type/Port PASS. Combined script tests **275 PASS**; no timeout/denial relaxation. API 32141 remains a failed historical run with unknown root cause. Source 87439 inputs were already terminal/verified before API-only diagnostic edits. Current actual LIFECYCLE-010 proof and source/API evidence may now enter the final internal gate reconciliation with unchanged DB 51950 evidence; no new DB run, runtime activation or A-to-B acceptance is implied. Evidence §59.

**R9-B API timing diagnostic Acceptance (before edits):** Preserve failed API 32141 (Hospital-changed/read phase 1, 5,000 ms) and the original timeout/assertions. Fixed per-case diagnostics may identify setup, source capture, physical write/sync, read/verification and fixture-cleanup stages with coarse monotonic elapsed buckets only. Unknown/free-text inputs must be suppressed; exact operations/arguments/results/errors must still forward. Do not mutate 87439's frozen inputs until terminal cleanup. After diagnostic contracts, run the existing targeted case once, then full API/build/type/Port once if the target passes; record all failures and limits. No timeout extension, skipped test, retry loop or product fix inferred from a pass. Actual R9 overlap/source acceptance and original full P0 stay independently required.

**R9-A repeat-purge correction Acceptance (2026-10-03, before change):** Preserve run 44194 as failed/cleaned. Existing roundtrip calls purge twice; assert outcomes PURGED then ALREADY_PURGED, observe a still-open independent transaction at BOTH physical-purge port calls, and retain the final exactly-one purge Audit/zero-quota/absent-files assertions. Reject one or three observations instead of using a lower bound. Actual coordinator repeat-model tests and full corrected 58-case source/observer/B/cleanup run are required. Only the new observation count changes; no product, runtime grant, deadline or original expected Audit/outcome changes.

**R9 caller-side boundary Acceptance (2026-10-03, before edits):** (1) Keep a controlled unrelated transaction open: the former global assertion deterministically rejects a read whose caller is outside that transaction; retain RED evidence. (2) The replacement guards fetch/effect entry and actual reader.read caller, preserving native stream identity/protocol, bytes/EOF/error/cancel and no speculative reads. Pre-created streams AND pre-acquired readers demanded within BEGIN/pending COMMIT/uncertain/nested outer transactions must reject before physical read. Pull-context NONE/OTHER is never sufficient permission. (3) Exercise actual Node Readable.fromWeb and the capture builder's getReader path, including transaction entry after reader creation and closure/error recovery. (4) In the unchanged roundtrip fixture, hold a distinct verified runtime READ ONLY transaction without source locks; independently observe same-role distinct backend, non-null xact_start and idle-in-transaction during source requests, ciphertext write/sync, borrowed callback and purge. Exact bytes/Audit and all 58 cases must still pass. (5) Guaranteed release/rollback-or-commit, Tenant reset and no remaining transaction/resources on success/failure/abort; metadata/quota/fence commits still precede effects. No elevated grants, raw diagnostics, source/PACS mutation, product/runtime activation or scope expansion. Model tests alone cannot satisfy the actual overlap condition; full wrapper and independent B/privacy/cleanup remain required. Do not relabel old intermittent failures as solved without evidence.

**R8 transaction-lifetime diagnostic Acceptance (2026-10-03, before edits):** Execute the actual test observer with controlled barriers: outside-run NONE; own BEGIN pending/open/COMMIT pending/closed; rejected COMMIT or ROLLBACK remains UNKNOWN until acknowledged recovery; unrelated concurrent and nested runs remain distinct; callbacks escaping a settled run cannot remain falsely active; all frames removed on return/throw. Compose the actual HTTP monitor with these contexts to prove a demanded read inside its own run still fails, and to label (not silently permit) a read overlapping another run. Query arguments/results/errors and original global assertions stay unchanged. Fixed diagnostics validate stage/phase enums, reject malformed/raw fields, deduplicate and bound output. No new role/grant, real data, retry or timeout. Run the full frozen 58-case source suite once, preserving failure and exact-owned cleanup/privacy evidence; model GREEN or non-recurrence alone cannot close LIFECYCLE-010/014 or establish a root cause. Actual unrelated-transaction overlap, runtime activation and the original A-to-B P0 remain separately required.

**R8 result/interpretation limit (21:54 KST):** Diagnostic 97027 passed the full 58-case source wrapper and cleanup; 255 final lightweight checks pass. A ninth observer regression proves a pre-created stream read awaited inside its caller's open transaction can still report OWN_NONE/OTHER_OPEN at pull. Therefore that snapshot is diagnostic only, never authorization or sufficient proof of unrelated work. Original assertions remain. Caller-side negative controls and actual same-runtime-role PostgreSQL overlap are still required before LIFECYCLE-010/014 acceptance; 38034/17902 remain unexplained, not fixed by non-recurrence. Evidence §58.

**R7-B monitor Acceptance (before regression/fix):** Execute the actual extracted monitor constructor with a fake reader. It must make no reads before demand or after one delivered chunk while the consumer pauses, preserve the active-transaction assertion when a read is demanded, forward bytes/EOF/source-error identity and cancellation without leaking raw data. Retain RED with the default strategy, then set highWaterMark=0 on the test monitor only and rerun unchanged contracts. Original real adapter/backpressure/assertions/deadlines stay unchanged. Require all 58 source cases/live+final observer/B/automatic cleanup and independently unchanged inputs; component GREEN is not actual acceptance or root-cause proof for 17902.

**R7-A diagnostic regression:** Preserve actual 17902 as failed/cleaned. Test-only diagnostics must forward original transport/error semantics, emit only fixed source stage, static error category, transaction-active Boolean and allowlisted failed-Audit statement-return reason; no raw names/messages/headers/paths/IDs/assertion values. Projector tests must reject untrusted and malformed fields, deduplicate/bound markers and preserve existing 58 tests/timeout/ownership/privacy gates. A diagnostic re-run is required to collect evidence, not proof of a fix from non-recurrence. Evidence section 56.

**R7 Acceptance (before implementation, 2026-10-03):** Add one actual capture-time Consent withdrawal without removing 57 R6 tests. Known-valid signed clinician retrieves A metadata; before any reserved ref/allocation/instance read, a verified patient invokes the approved withdrawal service under runtime RLS. An independent read-only WITHDRAWN probe must see exact Consent/Session binding, non-null withdrawal timestamp and still-ACTIVE Grant; no fixture restore or new privilege. The capture returns only DENIED/AUTHORIZATION_DENIED with zero handoff, instance calls, allocations, quota, evidence or purge. Require DENIED/FINAL read-only probes, the exact three-event start/withdrawal/denial Audit multiset and persisted WITHDRAWN state. Existing operations stay CREATED/B remains EMPTY; the entire expected 58-test wrapper, all 23 graph observations, six R6 restorations, 22 purge Audits and owned cleanup must pass. Wrong phase, false ACTIVE Consent, changed Grant and phantom metadata/quota/evidence must be rejected by observer contracts before real execution. Capture failure must not be mislabeled a successful withdrawal; no automatic reapproval/retry. Scope: LIFECYCLE-001/007/011/012/014; product A-to-B E2E remains separate. Result: actual 65501 provides positive 58-case withdrawal evidence; current monitor-corrected 38034 failed an existing source case with HTTP_BODY_ASSERTION_TX_ACTIVE and cleaned up. R7/current wrapper remains PARTIAL until diagnosed and revalidated; evidence section 56.

**R6 mapping/actor Acceptance (before implementation, 2026-10-03):** Preserve all 51 source cases and existing independent/privacy/cleanup gates. Add actual committed synthetic mutations using a separate fixture-only process, never runtime UPDATE grants/admin credentials or a writing privacy observer. Require exact registered scenario/pre-state/allowed transition, bounded token-authenticated protocol, fixed responses, serial mutation ownership and independent observation before fixture restoration. Wrong/missing token, unknown/extra field, arbitrary selector/value, oversized body, invalid phase/pre-state, concurrent conflict and DB/commit failure must not yield success or unintended SQL effects. Unit fakes alone do not satisfy the following actual gates:

| R6 case | Required actual denial/recovery evidence |
|---|---|
| Capture mapping revoked after A metadata | Committed VALID→REVOKED before reservation revalidation; no successful handoff, staged allocation or instance payload read; current graph/scope and baseline identifiers otherwise unchanged |
| Read mapping revoked between admissions | First admission succeeds, committed revocation is independently visible, second denies with zero borrowed callback/delivery admission; no implicit fetch/STOW |
| Read mapping local ID rebound between admissions | Exact fixed TEST-only local-ID change while mapping remains VALID; second check denies the formerly valid handoff with zero callback, preserving the source PatientID binding; observe changed field and unchanged non-target fields before restoration |
| Capture actor inactive after reservation | Exact actor becomes INACTIVE after committed STAGING; quota/write and final handoff fail closed. Inactive-actor cleanup cannot delete or falsely finalize; preserve recoverable ref and actual quota state until separately authorized cleanup |
| Read actor inactive before first admission | After valid capture, committed deactivation makes current registry lookup deny before decryption/callback/admission; retain exact metadata/files/quota and no privileged fallback |
| Read actor inactive between admissions | First admission succeeds, actual deactivation is acknowledged before the second; second denies callback/admission. Prove failed same-actor purge has no physical effect; record any fixture restore and subsequent fresh-authorized purge separately |

For every case, compare expected mutation plus all non-target rows/identifiers, exact Audit multiset, operation CREATED/no STOW/independent B EMPTY, ordinary fixed response and new-field/output privacy; failed attempts remain evidence. Restore only controller-owned synthetic targets from a validated saved baseline after observing denial; restoration cannot convert the denial into a successful source/read result. New controller/process teardown, terminal wrapper exit and independent zero-resource checks are required. Missing SERVICE expiry identity is still a separate existing gate, not inferred from restoring a USER fixture. R6 actual result (2026-10-03 20:50 KST): full wrapper 92681 exit 0, 57 tests, independent live/final observations, six restored cases, B EMPTY and both controller/observer log checks plus automatic owned cleanup PASS. Independent zero resources, healthy existing services and 267 unchanged input hashes confirmed. Lightweight checks 149 Node/29 cleanup/47 output/10 readiness PASS. R6 scoped PASS, not all LIFECYCLE/runtime/P0; evidence sections 54–55.

**R5-C cleanup Acceptance (before code):** After scanning live observer logs, stop only the exact current project's `source-capture-db-observer` container with the expected generated name and auto-remove flag, then perform existing Compose down/zero-resource/unchanged-stack checks. No matching observer is an idempotent no-op; invalid name/project, multiple/malformed IDs, wrong project/service/name/auto-remove, Docker inventory/inspect/stop failure, or bounded auto-removal timeout must not yield PASS. Unit tests must execute the actual helper with fake Docker and verify stop precedes Compose down; no broad prune or unrelated deletion. Keep 90568's assertion success and failed cleanup separate; require fresh full-wrapper exit 0 and independent zero-resource inventory for acceptance.

**R5 catalog correction Acceptance (2026-10-03, before fix):** Preserve the observed RESERVED/PHYSICAL_ABSENT CATALOG failures. Independently compare exact observer columns with approved migration DDL, including later ADD COLUMN statements, so fake rows generated from the same stale contract cannot self-confirm it. The pre-existing reservation `settled` Boolean must be validated (AVAILABLE requires true); STAGING may be unsettled, arbitrary values/omissions/extra fields must still fail. No migration/runtime grant/product change or skipped catalog check. Record RED before the contract correction and actual R5 revalidation afterward.

**R5-A diagnostic regression (after first actual failure, before correction):** A raw transcript with more than sixteen fixed `DEC017_CASE_*` markers must still surface bounded fixed ERROR/QUERY/PRIVACY/ORIGIN markers; case context has a separate bound and arbitrary test names remain hidden. A failed privacy probe emits only its validated fixed phase/error before the product's expected generic error translation; no row/SQL/token/URL/raw exception is logged. Preserve the failed 71777 result, 51 cases and all privacy/assertion/time limits; diagnostics are not a product fix or acceptance.

**Latest execution checkpoint (2026-10-03 22:32 KST; supersedes historical status below):** R9/R9-A actual **87439 exited 0**: 58 source cases, real caller-negative/same-role READ ONLY overlap, both purge attempts/one Audit, independent observers/B EMPTY/privacy/cleanup; independent zero resources/healthy stack/frozen inputs verified. Current **275 lightweight checks** and **API 33404: 43 files/894 tests/build/type/Port PASS**. Failed purge-count run 44194 retained and corrected with RED/GREEN; API 32141 timeout diagnosed with fixed phases but did not recur, root cause still UNKNOWN (likewise older 38034/17902). No product/schema/grant/runtime change or live heavy process. Next final internal LIFECYCLE/STAGE evidence reconciliation with separately recorded unchanged DB 51950, then recommendation/Acceptance for runtime storage/SERVICE cleanup and full coordinator/Preflight/STOW/destination/P0. Overall PARTIAL; changes uncommitted. Evidence §59.

**R5-C refinement boundary:** The pre-code recommendation in evidence §48 specifies a 30-second monotonic infrastructure removal deadline with 250 ms polls, not a changed product/test-case deadline. Identity-verified stop/wait failure must still attempt normal owned Compose down and remain a failure even after absence; invalid ownership must not trigger deletion. Require the actual-helper unit cases, minimal owned network-disabled/no-volume Docker smoke, then fresh full-wrapper exit 0 and independent zero-resource evidence. Unit PASS or manual recovery alone does not close this gate.

**R5 transport check (before unit extension):** The observer's actual HTTP handler must also be exercised through an ephemeral loopback socket with a fake read-only snapshot, not only a fabricated request iterator. Verify wrong/missing token, valid probe, malformed/oversized/extra-field requests, fixed responses, no snapshot on rejection, incomplete/failed summary and owned listener closure. This lightweight local test uses no Docker/PostgreSQL/PACS and does not replace actual R5 integration. If real stream behavior differs from the fake, retain the failure before any handler correction; do not weaken body limits or privacy rejection.

**R5-A raw output Acceptance (before wrapper edits):** Before returning source-test or final-observer stdout/stderr, and before formatting failed TAP, reject any known synthetic patient/DICOM identifier, actual configured password/credential URL or observation token (plain/URI/base64), private-key/JWT/temporary-ciphertext-path/payload marker or output above 8 MiB. An output failure returns only `INT001_OUTPUT_PRIVACY_REJECTED`; neither matched data nor arbitrary failed-test names may escape. Live observer logs must be inspected even on failure after confirmed container ownership; log inspection failure blocks acceptance but cannot skip owned cleanup. Unit tests load the actual wrapper functions without executing its body, mock Docker and assert raw success/failure denial, unchanged arguments/exit semantics, short-value coverage, generic failure projection and bounds. Actual source matrix remains 51 cases plus live/final observer/B/cleanup; no acceptance from mocked tests or marker scan alone. Record platform/arbitrary-encoding limits separately.

**R5 privacy Acceptance (before test edits):** Keep all 51 cases. A distinct fixture-observer process (not the API's runtime DB client) must read committed reserved/active-quota/available/read-result/physical-purge/final snapshots for each lifecycle graph. It accepts only bounded fixed scenario/phase requests authenticated by a per-run test token, returns no DB rows, runs no mutation, exposes no host port and gives the application no fixture credential/new grant. Verify exact new row/column contracts and every value: opaque UUIDs with exact scope binding, bounded numeric quota values, timestamps, fixed enums, the expected source-manifest digest, nullable destination fields, and exact minimized Audit context/reasons. Known synthetic UIDs/PatientID/path/payload/key/credential patterns cannot appear in these new fields or ordinary result/error projections; approved existing Study UID/PatientMapping columns are explicitly compared, not globally forbidden or copied to new tables. Require a live quota witness before bytes, exact final zero quota, physical absence before finalization, ordinary success's four fields/denial's two fields, unchanged schema and final B/cleanup. Reject wrong/missing token, oversized/malformed/extra-field/unregistered scenario/phase without a DB observation; a failed/incomplete probe ledger cannot report PASS. Unit fakes and post-purge-only scans cannot close this gate. Actual matrix and full current DB regression remain required; document OS/process-memory limitations and no product HTTP API changes.

**R4 independent-replica Acceptance (before test changes):** Preserve the existing 50 cases and add a separately seeded source graph. Capture three actual A instances; launch a different Node PID with no DEK/private key/plaintext passed. Fresh source-service read rejects a serialized handoff. Under verified signed identity, real AuthorizationEngine/Consent/Grant/RLS and exact AVAILABLE ref/expiry/evidence, primitive read rejects specifically with RECOVERY_REQUIRED after one completed authorization and zero callbacks. Missing/wrong-Tenant cleanup denies before physical work and leaves metadata/ciphertext unchanged. Correct exact-ref PROCESS_RESTART purge observes committed PURGE_PENDING and physical absence before final Audit/quota release; repeat is idempotent. Parent's retained handoff denies after purge, with no new source read/STOW. Child exits and is awaited before teardown, including failure/timeout paths; bounded output contains only fixed diagnostic codes. Independent DB observer verifies one restart purge Audit, fixed parent read failure, unchanged approved identifiers, zero quota and CREATED operation; B remains EMPTY before/after. Final owned cleanup and wrapper exit required. This is replica proof, not a killed-origin/host-crash claim or full lifecycle completion.

**R4 runner checks (before the additional test file):** Exercise the actual runner function extracted by a JavaScript AST, with fake child streams/events and fake timers only. Success must wait for close; spawn/stdin errors, timeout, test cancellation, combined-output overflow, unexpected stdout/stderr and nonzero exit must reject only after close and never include raw output in the error. Oversized input or pre-existing cancellation must spawn nothing; process arguments must not contain token/handoff data, test-runner inherited flags must be removed. Remove the abort listener after close so later cancellation cannot affect another PID. These unit checks do not prove child identity, real key loss, PostgreSQL or Orthanc behavior.

**R4 scoped result (2026-10-03):** Actual source wrapper session 11645 exited 0 with **51 tests**, 16 lifecycle graphs/17 purge Audits/zero quota, independent DB observer, B EMPTY before/after and owned cleanup. Exact resource inventory is empty. The real distinct-PID replica test passed unknown-handoff denial, real-authorized RECOVERY_REQUIRED/no callback, identity-gated purge and physical-before-finalize ordering, then original-parent handoff denial. Runner protocol 12 and serial API 893/type/Port checks pass. This closes the added R4 scenario only, not every full LIFECYCLE condition, original-process death or host-crash recovery. Full DB session 6711 failed GRT-003 rollback; diagnostic-only rerun 51950 is live and not accepted. Remaining mapping/actor mutation/privacy/runtime/STOW/P0 gates stay open; Ticket evidence §§41–44 supersedes the historical R3 checkpoint below.

**R3 actual fault/replay Acceptance, specified before test edits:** Add eleven cases without removing the existing 39. Valid retained/refetched handoffs deliver exact known-fixture bytes only after both real admissions. Consent withdrawal, PURGE_PENDING and expired metadata committed between checks deny the callback and preserve one pre-decrypt admission, with no delivery admission. Bit-flipped/truncated/swapped ciphertext denies before callback; preserve existing key/nonce/tag unit coverage. Write/fsync/evidence SQL failures yield no handoff/evidence, and exact-ref physical purge precedes one purge Audit/quota release. A paused committed STAGING winner survives a competing same-operation attempt with unchanged ref/expiry and no loser allocation or bytes; release/await the winner in finally. AVAILABLE replay cannot replace or extend the receipt. Only after explicit authorized purge may a new capture use a distinct ref and matching existing pending source evidence; old handoff reads deny, new bytes verify, final quota is zero and exactly two refs have purge evidence. A separate same-scope observer verifies the exact Audit multiset and baseline identifiers; B remains EMPTY and all operations CREATED. Generated test DICOM/runtime least privilege only; no migration/privileged connection or STOW. Final wrapper exit/owned cleanup required for any scoped PASS. Eleven additional cases do not close the remaining full LIFECYCLE/STAGE conditions.

**R3-A runner Acceptance:** Before bootstrap writes, authenticated TCP SELECT succeeds on the owned network. Refused/closed/timeout probes may retry boundedly, but invalid password/HBA/DNS/database/SQL/unknown failures stop immediately; no credentials/raw psql output are logged. Assert SELECT-only probe calls, bounded retries and no DDL replay with deterministic PowerShell fakes; verify actual runner readiness separately. Existing lifecycle failure assertions/timeouts and final observer/B/cleanup gates remain mandatory.

**Sequence-4 first actual matrix:** Preserve all original 35 source cases; add four distinct seeded Session/Package/Study/Consent/Grant/operation graphs. (1) Signed-OIDC→registry→RLS→HTTPS A→ciphertext→three exact authorized byte/hash reads→idempotent purge; no-context/cross-Tenant and cloned/wrong-Tenant read denial, expired/replaced metadata must remain protected. (2) Revoke the actual Grant through its service between read checks: no callback, one pre-decrypt admission, fixed failure, exact authorized purge. (3) Actual capture-success Audit trigger failure: roll back AVAILABLE/evidence/success, preserve failure and exact-ref purge evidence. (4) Actual BEFORE_DELIVERY Audit trigger failure: no callback or delivery admission, then purge. Separate DB observer verifies exact per-case metadata/evidence/Audit/quota/unchanged approved identifiers and Package/sibling state; separate B probe verifies EMPTY before/after. Final wrapper exit and owned cleanup are mandatory. This first matrix is PARTIAL toward the full LIFECYCLE/STAGE suite, not full lifecycle/P0 acceptance.

**Sequence-3 R2 criteria, specified before changes:** The internal consumer accepts only the exact frozen source-issued handoff, registered after known final commit, never a clone/forgery/restarted-service handoff. It snapshots principal/selectors before awaits and exposes no verifier/purpose/operation override. At BOTH checks use actual AuthorizationGatedOperationExecutor and current graph/PatientMapping/AVAILABLE exact ref/expiry/pending evidence; fail before callback on Consent/Grant/actor/Tenant/mapping/resource/expiry changes, missing or tampered evidence, Audit/DB/commit failure, cancellation or ciphertext corruption. Success returns no plaintext, invokes the bounded borrowed callback outside its own transaction and zeros the buffer when it settles. Admission Audit uses fixed phases and never claims delivered bytes. Do not add PatientID to serialized handoff. Unit/model tests prove only component behavior; signed-OIDC/real registry/RLS/Orthanc and existing LIFE/CONC regressions remain required.

**Integrated Acceptance status: PARTIAL, 15-scenario matrix scoped positive evidence.** R3 wrapper exited 0 with **50 tests**, independent observer/16 exact purge Audits/zero quota, B EMPTY before/after and owned cleanup (§40). Eleven additions cover actual patient Consent withdrawal, metadata expiry/PURGE_PENDING, three ciphertext faults, write/fsync/evidence failure, competing capture and AVAILABLE replay/purge/new-ref re-fetch. Original four signed cases and all older source tests remain. Three first-run failures did not recur but their cause is unproven; do not erase that evidence. Serial API 43 files/893/type/Port PASS; readiness 10 PASS. Current scratch clean/repeat/reset/reapply (§41) and remaining full lifecycle/mapping/actor/restart/privacy gates are not complete. No STOW/runtime/product E2E acceptance follows.

**Test-first preparation:** Before product-source changes, add isolated unit contracts for LIFECYCLE-002/004 in `tests/api/temporary-imaging-capture-lifecycle.test.mjs`: (a) an explicit per-package quota port works without constructor quota; (b) two packages use only their own snapshotted reserve/settle functions, never a global fallback; (c) an explicitly malformed/null port rejects with fixed QUOTA_UNAVAILABLE before package allocation even if a fallback exists; (d) a held quota settlement followed by a trusted clock advance starts the 30-minute TTL after settlement. Constructor-only legacy reserved-package behavior remains compatible. These are model/real-file unit checks, not identity or RLS evidence. Run them RED against the unchanged implementation and record actual failures; no skip/todo/expected-failure masking. The live DB Docker stage does not include this test file. Product implementation and full LIFECYCLE acceptance remain gated by DEC-016 completion.

**Initial test-first result (superseded by R1 below):** Seven cases written/executed: six intended RED contracts and one constructor-compatibility PASS. Default full API run was 762 PASS/9 FAIL (six new cases plus three existing timeouts); unchanged-limit serial rerun was 765 PASS/6 FAIL, with all original 764 tests passing. Evidence §32 preserves both attempts, scope and cleanup.

**DEC-017-R1 race contracts (specified before changes):** Extend LIFECYCLE-004/005/013 with held-settlement races. A concurrent second seal must reject before a second quota settlement; releasing the first permits one receipt only. Purge during held settlement must leave the exact ciphertext directory absent and prevent a seal receipt when settlement resumes. Preserve existing sequential retry after failed/ambiguous settlement, unchanged write-freezing and fixed non-sensitive errors. These real-file/model-quota tests alone cannot establish the final DB AVAILABLE transaction or integrated authorization.

**Historical R1 RED result:** Both races reproduced before the fix: a second settlement started, and a seal receipt returned after physical purge. Focused suite was 8 FAIL/1 PASS; serial API was 765 PASS/8 FAIL. Evidence §33 retains that failure. After §34's final gate and the product fix, the same nine assertions pass unchanged; metadata adds 14 unit contracts and sequence-1 full API was 787 PASS (§35); current sequence-2 full API is 814 PASS (§36). Full integrated LIFECYCLE acceptance remains open.

| Test ID (`TC-PACS-001-LIFECYCLE-*`) | Success, failure and denial requirements | Required evidence / parent gate |
|---|---|---|
| `001` | Fresh fenced Authorization plus exact mapping after metadata validation; reserve new ref and STAGING before directory/instance bytes. Initial/mid-setup denial, malformed metadata and invalid mapping produce no staged files. Two concurrent same-operation attempts yield one reserved ref; loser cannot delete winner. | Real DB transaction observer plus source/filesystem counters; STAGE-001/004/006 |
| `002` | Lifecycle-enabled capture requires explicit scoped DB quota adapter and `beginReservedPackage`, never primitive fallback. Mutation of principal/Tenant after invocation cannot redirect quota. Active membership, no-context/wrong-Tenant denial, fixed functions/244 grants/no direct quota-table access; no file write before quota success. | Unit fault and real RLS; STAGE-005/006 |
| `003` | Stream actual synthetic DICOM bytes from HTTPS A through the same hash/encryption observer; authenticated reads reproduce each exact source byte/hash/count. Files differ from plaintext, no plaintext spool; primitive/backpressure caps unchanged. | Real Orthanc plus independently calculated known-fixture digests; STAGE-001/002/009/012 |
| `004` | A delayed metadata/reservation phase does not reset the initial 30-minute capture deadline. Delayed quota settlement occurs before the seal completion timestamp. Final STAGING→AVAILABLE installs the exact receipt expiry (completion+30 minutes), atomically with source evidence and capture-success Audit. Expired staging, deadline/cancellation, ref change or late final commit never yields a usable handoff. Reads/replay cannot extend TTL. | Trusted-clock unit cases plus real transactional metadata/evidence/Audit; STAGE-006/011 |
| `005` | Source/crypto/write/fsync/settlement/reservation/final-metadata/evidence/Audit failure, including before a handle returns and ambiguous commit, yields no successful handoff. Exact ref remains recoverable; no blind re-fetch, no clearing ref or early quota release. After permitted recovery, physical absence precedes one purge Audit/quota release. Preserve failed evidence and test ownership before cleanup. | Deterministic fault injection and real DB rollback cases; STAGE-007/008 |
| `006` | Concrete internal verifier runs fresh real Consent+Grant/Authorization under Tenant RLS before decrypt and before callback. Valid exact source-produced binding succeeds; wrong Tenant/actor/Hospital/Session/Patient/Package/Study/purpose/ref/object/hash/length or mismatched pending evidence denies without callback. No caller-provided verifier/default allow. | Signed OIDC, registry/AuthorizationEngine, PostgreSQL and real store; STAGE-004 |
| `007` | Withdraw Consent/revoke Grant/change mapping or actor status between capture phases and between read checks; invalid final authority prevents handoff/plaintext callback. Missing SERVICE identity prevents expiry cleanup, not a privileged bypass. Read denial does not automatically authorize STOW/re-fetch. | Actual approved revoke/withdraw services and separate transactions; STAGE-004/010 |
| `008` | Tamper/truncate/swap/replay ciphertext and authenticated selectors; no consumer invocation. Retain nonce/tag/key tamper unit tests without exposing a product mutation API. Independent restarted process/replica has no DEK, cannot read; exact authorized purge-only recovery succeeds, re-fetch only before dispatch and after prior purge. | Crypto unit matrix plus child-process/filesystem/real metadata; STAGE-003/007/013/014 |
| `009` | Advance to expiry or mark PURGE_PENDING during the final verifier; no callback. A slow/cancelled consumer retains its admission permit until settled, then buffer is zeroed; no whole-Study buffer and bounded waiters. | Actual consumer adapter with existing LIFE/CONC regressions; STAGE-004/009 |
| `010` | Source HTTP, filesystem work and consumer callback occur outside their own DB transaction. Quota/fence transactions finish before each physical effect; pool context resets on rollback/commit. Concurrent unrelated transactions are not falsely treated as a failure. | Transaction-local instrumentation plus same-role PostgreSQL observer; STAGE-006/008 |
| `011` | Snapshot exact approved baseline Study UID/PatientMapping columns and verify unchanged. Inspect every newly written lifecycle/quota/evidence/Audit value and ordinary result/error/log projection for synthetic UID/PatientID/path/payload/key sentinels. No new per-instance identifier table or widened grants. Ordinary capture remains exact four-field success/two-field denial, without handoff. | Independent DB schema/value observer and captured public serialization/diagnostics; STAGE-002/011. Do not claim OS crash-dump protection from this test |
| `012` | Independent B inventory EMPTY before/after; source path only A GET/QIDO/WADO; zero STOW/POST/destination verifier, no PREFLIGHT_PASSED/STOW_STARTED/COMPLETED. Existing stack/resources, Package and sibling payloads unchanged. | Owned isolated Compose wrapper, unavailable B credentials/network, independent B/DB observer and final cleanup; STAGE-012 |
| `013` | Same-operation replay while AVAILABLE/STAGING cannot replace its ref or extend retention. A permitted re-fetch after PURGED uses a new ref, respects prior source-evidence digest conflict and refuses operation >= STOW_STARTED. Failure/identity loss leaves retryable evidence, never a false terminal success. | Real unique/CAS/RLS/evidence tests and read/fetch counters; STAGE-003/006/014 |
| `014` | Existing no-storage source-capture tests, full API/type/Port contracts, current DB scratch clean/repeat/reset/reapply and isolated Orthanc cases pass with final cleanup. New implementation stays unregistered; route/provider/scheduler/public API/schema/grants unchanged. | Record commands/results/failed attempts in Ticket; code diff and runtime-surface review. Passing a model or one integration round does not close this gate |

**Privacy interpretation for STAGE-002/011:** The prohibition applies to newly introduced temporary-processing persistence and all output/log/Audit surfaces. Existing approved source-reference/PatientMapping columns in DATA-MODEL §§32–34/58 are preserved, read under current grants and checked unchanged. Do not claim a database-wide absence of UID/PatientID, remove existing identifiers, suppress unrelated findings, or use arbitrary scan exclusions. Internal handoff selectors remain volatile and must never enter the ordinary response. This reconciles existing normative requirements without allowing new sensitive persistence.

**Completion:** Record per-case PASS/PARTIAL/NOT RUN and limitations; do not mark STAGE-002/003/004/011/012 or runtime activation complete from the implementation alone. The later product dispatch coordinator, Mandatory Preflight, STOW, destination verification, result-unknown reconciliation, Viewer/Download and overall P0 E2E remain separate required work.

**Prerequisite order:** `MEDIQ-PACS-007` durable operation lifecycle/idempotency and its least-privilege DB/RLS Acceptance → PACS-001 internal identity-binding and session-serialized operation-time Authorization-fence slices → `PACS-001-DEC-004` complete Preflight/dispatch boundary and existing `PRE-002~006`/`DISPATCH-001~005`/`COMP-002` Acceptance → `PACS-001-DEC-005`/`HANDOFF-001~007` exact source identity handoff → `PACS-001-DEC-006`/`DIGEST-001~006` ephemeral per-instance source-byte digest binding → `PACS-001-DEC-007/008/009` and `STAGE-001~014` authenticated bounded temporary payload staging, operation-level metadata, physical purge/restart recovery, quota, Tenant-RLS cleanup and purge evidence → DEC-017 integrated source lifecycle and actual read-authorization/privacy/no-side-effect evidence → full coordinator integrating PACS-003 destination binding, PACS-004 mapping, endpoint/TLS, integrity/provenance/Audit, durable `STOW_STARTED`, STOW result handling and destination verification → separately gated reconciliation and full security/E2E Acceptance. Handoffs and digests remain internal, ephemeral, non-authorizing, and no-STOW. The DB fence, source-digest and purge gates alone do not prove final dispatch safety, product no-STOW/B-unchanged, or transfer success; no step authorizes live STOW without the complete `AGENTS.md` §5 Mandatory Preflight.

---

# P0 PACS Transfer Operation State — MEDIQ-PACS-007

**Decision:** `PACS-007-DEC-001` (recommendation and Acceptance recorded before implementation)
**Scope:** Durable internal transfer operation state/idempotency only; no HTTP route, DICOM call or live STOW.
**Status:** PASS — scoped internal persistence/lifecycle Acceptance; no product transfer/E2E claim.

The operation record is the durable guard against duplicate PACS writes and lost-response ambiguity. It does not authorize a transfer by itself. The claim must be created only after full operation-time Authorization and Preflight evidence is available; STOW must not be enabled by this Ticket.

| Test ID | Scenario | Expected result | Scope | Result |
|---|---|---|---|---|
| `TC-PACS-007-DOM-001` | Construct/reconstitute operation with invalid IDs, state, timestamps, semantic digest or mismatched binding | Reject invalid snapshots; immutable valid state and exact legal transition graph | Domain | PASS — focused domain tests |
| `TC-PACS-007-STATE-001` | Attempt legal/illegal transitions, preflight skip and `RESULT_UNKNOWN`→STOW | Only documented transition edges accepted; direct preflight skip rejected; unknown cannot return to dispatch | Domain/PostgreSQL trigger | PASS |
| `TC-PACS-007-IDEM-001` | Same verified Actor repeats identical key+semantic request; changes resource/scope/session while reusing key | Exact replay returns the same operation; changed semantics conflict without mutation | Persistence contract/PostgreSQL | PASS |
| `TC-PACS-007-CONC-001` | Concurrent claims for one Session/Study or same-key creation | Uniqueness/locking/CAS leaves one operation and one state transition | PostgreSQL integration | PASS |
| `TC-PACS-007-DB-001` | Create/read/transition operation in one verified Tenant transaction | Parameterized SQL; state+Audit share transaction; Audit failure rolls back; no network call in transaction | Repository integration | PASS |
| `TC-PACS-007-RLS-001` | Missing Tenant context, other Tenant, immutable binding update and connection reuse | Forced RLS denies cross-Tenant access; exact minimal column privileges; transaction context is isolated | Security/DB | PASS |
| `TC-PACS-007-AUD-001` | Create or advance state while Audit insert fails | Operation state rolls back; prior state/version remains | Atomicity | PASS |
| `TC-PACS-007-UNK-001` | Ambiguous post-dispatch result | Persist/retain `RESULT_UNKNOWN`; no blind retry transition; reconciliation resolver remains future scope | Recovery boundary | PASS — durable no-retry boundary; no DICOM call |
| `TC-PACS-007-SEC-001` | Inspect schema, grants, module registration and dependencies | No DICOM Gateway/STOW/provider route; no PHI/payload/credential stored; exact grants only | Scope/privacy | PASS — 15 SELECT, 15 INSERT, 7 UPDATE; no route/STOW |

`MEDIQ-PACS-007` PASS proves only the durable state/idempotency boundary. It does not prove operation-time Authorization, DICOM transmission, destination reconciliation/verification, integrity/provenance completion, or `AT-FUNC-012`/`AT-SEC-012`/`AT-E2E-003`.

---

# P0 Local Test Orthanc HTTPS Acceptance — MEDIQ-TLS-001

**Decision:** `TLS-001-DEC-001` (recommendation and Acceptance recorded before implementation)
**Scope:** Local synthetic Compose transport from MediQ API / isolated DICOM test client to Hospital A/B Test Orthanc only. Orthanc built-in HTTPS is permitted only for this isolated profile. Test CA and leaf private keys are generated locally under ignored runtime data and never committed. No STOW is authorized by this Ticket.
**Boundary:** This does not establish Client↔MediQ ingress TLS, mTLS, production PKI/key custody, production deployment readiness, PACS Authorization, or a transfer coordinator. Passing this Ticket closes only the local API↔Test Orthanc transport prerequisite.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-TLS-001-HTTPS-001` | Resolve A/B endpoint configured with `http://` or alternate host/port/path/userinfo/query/fragment | App configuration rejects before upstream I/O; only exact HTTPS Test Orthanc origins are valid | Endpoint scheme/origin | PASS — 7 invalid origin variants plus exact HTTPS acceptance |
| `TC-TLS-001-HTTPS-002` | API / isolated adapter client connects to A `/system`, QIDO/WADO and B QIDO using local Test CA | TLS chain and DNS SAN validate; HTTP auth and DICOMweb media types work; Orthanc ports remain unpublished | Positive service transport | PASS — runtime health and isolated HTTPS integration |
| `TC-TLS-001-HTTPS-003` | Send plaintext HTTP to HTTPS-only Orthanc listener | Connection fails; no redirect, downgrade, credential resend, or automatic HTTP fallback | Downgrade resistance | PASS — live TLS integration |
| `TC-TLS-001-CERT-001` | Connect without trusting the local Test CA | TLS handshake fails before any DICOM response | Untrusted CA | PASS — explicit empty trust store rejected |
| `TC-TLS-001-CERT-002` | Trust the local Test CA but verify peer using an incorrect DNS name | Hostname validation fails; no HTTP request is accepted | Hostname binding | PASS — `ERR_TLS_CERT_ALTNAME_INVALID` |
| `TC-TLS-001-CERT-003` | Supply a malformed CA bundle to the client | TLS context/handshake fails; it cannot silently skip the malformed trust input | Invalid trust configuration | PASS — malformed bundle did not authorize peer |
| `TC-TLS-001-HEALTH-001` | Run A/B Orthanc healthchecks | Healthcheck validates CA and `localhost` identity; no `CERT_NONE`, verify bypass, or credential output | Runtime health | PASS — A/B healthy; repo-owned Python probe uses `ssl.create_default_context(cafile=...)` |
| `TC-TLS-001-DICOM-001` | Run existing read-only A QIDO/WADO/frame and B baseline suite over HTTPS | Synthetic projection and each instance SHA-256/byte count match; B stays unchanged; zero STOW/POST requests | DICOM compatibility over TLS | PASS — 7/7 integration cases; A 1 Study/1 Series/3 Instances, B 0 matching instances |

**Execution result (2026-10-01):** All eight Ticket cases passed. Verification included API config 11/11, full API 29 files/526 tests, TypeScript build/typecheck, DICOM Port compile contract, Compose/AppConfig validation, A/B authenticated HTTPS/network probes, the runtime environment health gate, and DICOM/TLS integration 7/7. Evidence: `docs/implementation/MEDIQ-TLS-001/TEST-EVIDENCE.md`.

Passing these cases is not global `AT-SEC-022/023` completion: Client↔MediQ TLS and certificate lifecycle remain separate gates.

---

# P0 Source Integrity Manifest Primitive — MEDIQ-INT-001

**Decision:** `INT-001-DEC-001` (recommendation and Acceptance recorded before implementation under `PDEC-001`)

---

# Operation-bound Pending Provenance Acceptance — 2026-10-01

`MEDIQ-PROV-001` implements only an internal idempotent writer for a PACS-import Provenance row in `PENDING`. The writer records no transfer outcome and performs no PACS/DICOM side effect. A successful row is not evidence of completed transfer or verified integrity.

| Test ID | Scenario | Expected Result | Scope |
|---|---|---|---|
| `TC-PROV-001-001` | Schema migration and relationship inventory | Nullable `operation_id` references `pacs_transfer_operations` with `RESTRICT`; unique operation binding prevents a second PACS provenance row; every `PACS_IMPORT` row requires operation, destination, and Study | DB/schema |
| `TC-PROV-001-002` | Persist a PACS provenance record for a Tenant-visible `CREATED` operation | Exactly one `PENDING` row is created; Session, Study, Package, source and destination are derived from persisted operation/session/study data | DB/integration |
| `TC-PROV-001-003` | Persist a record for an eligible `PREFLIGHT_PASSED` operation, then replay | Replay returns the same `provenance_id` and immutable binding; no second row is created | DB/idempotency |
| `TC-PROV-001-004` | Caller supplies only a server-owned operation ID; conflicting request identity is attempted | Internal input contract has no caller-controlled patient, hospital, session, study, package, status or outcome fields; SQL-derived bindings cannot be replaced by caller data | Unit/security |
| `TC-PROV-001-005` | Read or create with no verified Tenant context | No row is returned/created; operation fails closed without fabricating Tenant identity | DB/RLS |
| `TC-PROV-001-006` | Tenant C attempts to access Tenant B operation/Provenance | No row is visible or created; no identifying fields leak | DB/RLS |
| `TC-PROV-001-007` | Unknown operation, mismatched Study/Session/Package/Source, or invalid persisted binding | Fixed persistence failure; no Provenance row is committed | DB/integration |
| `TC-PROV-001-008` | First-time creation after operation has advanced to `STOW_STARTED`, `VERIFYING`, terminal, or unknown state | Deny; a missing pre-dispatch Provenance row must not be backfilled after a possible side effect | State/security |
| `TC-PROV-001-009` | Direct insert of `PACS_IMPORT` without operation, destination, or Study | Database CHECK/FK rejects the row; non-PACS legacy rows may retain NULL operation reference | DB/schema |
| `TC-PROV-001-010` | Runtime privilege and transaction boundary probe | Current approved catalog is exact262 overall. `provenance_records` has exactly 13-column `SELECT`, 13-column `INSERT`, and only four-column `UPDATE` (`integrity_id`, `transfer_status`, `ingested_at`, `transferred_at`) for separate DEC-023/024 evidence and terminalization writers; it has no `DELETE`, table-level, PUBLIC or DDL privilege. The pending Provenance writer itself remains INSERT-only and caller rollback removes its pending row. A direct incomplete terminal UPDATE is denied by `provenance_records_terminalization_guard` with SQLSTATE `23514`, not accepted merely because UPDATE privilege exists. Full DB-008 reset/reapply and DB-002~007 regressions pass | DB/security |

This ticket does not satisfy full `AT-PROV-001`, `AT-E2E-001~007`, `AT-SEC-*`, destination verification, Integrity, Audit completeness, or the P0 golden path. `PENDING` must remain the only writer result until a separately accepted coordinator proves atomic dispatch, source/destination evidence, integrity, destination verification and terminal-state consistency.

**DEC-024/027 privilege-and-guard reconciliation (recorded before correcting the PROV-001 test expectation):** historical PROV-001 wording that denied all Provenance UPDATE privileges predates the separately accepted DEC-023/024 four-column UPDATE set. Under exact262, a runtime UPDATE to a granted terminal column reaches the invoker terminal trigger; when terminal proof/correlation context is absent it must fail with SQLSTATE `23514` and the exact named guard, rather than `42501` from the old missing-column-privilege path. This does not make the pending-row writer an UPDATE capability or accept a terminal result.
**Scope:** Internal TypeScript stream-to-manifest primitive only. It receives already-described single-instance `application/dicom` streams through a caller-supplied lazy opener; it does not resolve an identity or depend on a concrete DICOM Gateway/PACS adapter, write database evidence, emit Audit/Provenance, register an API route, or perform STOW.
**Algorithm:** `SHA256-MANIFEST-V1`. Hash each exact instance stream with SHA-256, then hash the canonical manifest: ASCII domain separator `MEDIQ-DICOM-MANIFEST\0V1\0`; 32-bit big-endian instance count; and for each SOP Instance UID in ASCII lexical order, 32-bit big-endian UID byte length, ASCII UID bytes, 64-bit big-endian actual stream byte length, and the 32-byte instance digest. Aggregate output is `sha256:<lowercase hex>`; no per-instance digest is returned.
**Bounds:** 2,000 nonempty instances maximum, 64 MiB actual bytes per instance, and 2 GiB total actual bytes; streams are processed one at a time and are never concatenated/buffered as a study. These are MediQ P0 guardrails for this primitive, not DICOM standard limits or a throughput/clinical compatibility guarantee.
**Status:** PASS — bounded hashing primitive only; product source evidence remains incomplete.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-INT-001-HASH-001` | Fixed known byte/UID manifest vector, independently recalculated from the framing specification | Exact documented algorithm ID, digest, count and total byte count | Deterministic algorithm | PASS — independent Node reference matches `sha256:855de908…d1c0cca` |
| `TC-INT-001-HASH-002` | Same objects arrive in different enumeration order | Same aggregate digest; canonical UID ordering is deterministic | Canonical manifest | PASS — same digest; opener invoked in canonical order, one at a time |
| `TC-INT-001-HASH-003` | Alter one byte or UID | Aggregate digest changes; digest is over exact raw stream bytes | Bit-preserving hash | PASS — byte/UID mutation changes digest |
| `TC-INT-001-HASH-004` | Empty set/object, invalid/duplicate UID, count mismatch, non-DICOM media type, or response UID mismatch | Reject; no digest/manifest result is produced | Input completeness | PASS — all rejection cases covered |
| `TC-INT-001-HASH-005` | Per-instance, total-study, or instance-count limit is exceeded; attempt to raise a ceiling | Reject over-limit metadata before opening streams; cancel an active reader on observed byte overflow; never return a partial digest; callers may narrow but never raise fixed limits | Resource bounds | PASS — lowered test limits, hard 2,001-instance ceiling, stream cancellation, and ceiling-escalation denial |
| `TC-INT-001-HASH-006` | Declared Content-Length differs from bytes read, invalid/over-limit length, stream error, or cancellation | Reject and cancel/close active reader; do not return a manifest | Stream integrity/failure | PASS — mismatch, invalid/over-limit length, sanitized read error and abort covered |
| `TC-INT-001-HASH-007` | Lazy streams are supplied as bounded chunks | Hash without whole-study buffering; open/read one instance at a time | Memory boundary | PASS — sequential lazy opening verified; no payload aggregation in implementation |
| `TC-INT-001-HASH-008` | Inspect module dependency and result/error surface | No concrete Gateway/PACS client, DB, HTTP route, Audit/Provenance claim, STOW, patient/local ID, credentials, payload, or per-instance digest; errors sanitized | Scope and data minimization | PASS — isolated application helper; synthetic stream fixtures only |

**Execution result (2026-10-01):** `npm run test:api -- --reporter=dot` passed the API build and full regression (30 files/541 tests). The focused source-integrity suite passed 12/12 in its final run. No DB, Test Orthanc, route, or STOW operation was invoked.

Passing this sub-gate does not satisfy `REQ-INT-001` end-to-end. Authorized source retrieval, Session/Study/PatientMapping/Consent/Grant binding, reauthorization before evidence persistence, Audit/Provenance, destination digest comparison, and `FAILED` completion blocking remain separate NOT RUN Acceptance gates. No transfer may be marked `COMPLETED` based on this primitive.

## TC-INT-001-DB-001~010 — Source Capture Evidence Persistence Sub-gate

`INT-001-DEC-002` records only an operation-bound persistence foundation. Runtime privileges used by the integration test are temporary scratch-only grants and must be removed before the DB-008 baseline assertion. This sub-gate does not authorize or perform DICOM retrieval.

| Test ID | Scenario | Expected Result | Scope | Actual Evidence / Result |
|---|---|---|---|---|
| `TC-INT-001-DB-001` | Apply migration and inspect operation relation/index/checks | Nullable operation FK uses RESTRICT; `(operation_id, verification_stage)` is unique when operation-bound; `SOURCE_CAPTURE` requires operation, Study, supported algorithm, canonical digest and positive count; destination result fields and `verified_at` remain null; status is PENDING | DB/schema | **PASS** — DB-008 catalog: 22 migrations, 18 tables, `18|50|17|40`; DB-007 inventory includes 39 scoped columns, 14 FKs, 9 CHECKs, 2 partial unique indexes |
| `TC-INT-001-DB-002` | Record a valid manifest against Tenant-visible `CREATED` operation | Exactly one row is created; Session/Package/Study derive from persisted operation/session/study data | DB/integration | **PASS** — actual synthetic PostgreSQL/RLS integration; persisted binding matched fixture |
| `TC-INT-001-DB-003` | Replay the same operation and same manifest | Same `integrity_id` and immutable binding returned; no duplicate row | DB/idempotency | **PASS** — same row returned, no second row |
| `TC-INT-001-DB-004` | Replay operation with changed digest, algorithm or object count | Fixed conflict; existing row unchanged | DB/security | **PASS** — changed digest conflicted; existing baseline retained |
| `TC-INT-001-DB-005` | Supply malformed manifest, unsupported algorithm, noncanonical digest, empty/over-limit count or totalBytes | Reject before SQL; no row | Unit/domain | **PASS** — evidence repository unit suite 6/6; hash suite 12/12 retains count/byte-boundary coverage |
| `TC-INT-001-DB-006` | Attempt to read/create without verified Tenant transaction context | No row visible or committed; fail closed, no fabricated Tenant | DB/RLS | **PASS** — actual runtime role saw no row and first create failed closed |
| `TC-INT-001-DB-007` | Another Tenant attempts to read/create | No row visible/created and no identifiers disclosed | DB/RLS | **PASS** — unrelated synthetic Tenant C saw no row and could not create evidence |
| `TC-INT-001-DB-008` | Unknown/mismatched operation binding or first-write after operation leaves `CREATED` | Deny with no evidence row | DB/state | **PASS** — unknown operation and first write after `PREFLIGHT_PASSED` denied; no evidence row |
| `TC-INT-001-DB-009` | Direct invalid `SOURCE_CAPTURE` SQL row missing one required field or claiming `VERIFIED`/destination result | Database CHECK rejects; no false verified result | DB/schema | **PASS** — direct SQL missing source metadata or attempting VERIFIED/verified_at rejected by CHECK |
| `TC-INT-001-DB-010` | Runtime privilege and transaction boundary probe | Scratch-only exact 12-column SELECT + 12-column INSERT; no UPDATE/DELETE/table-level/PUBLIC privilege; caller rollback removes evidence; persistent runtime catalog is restored to 209 | DB/security | **PASS** — 233 temporary total during test; exact grants revoked; 209 persistent total restored; rollback passed |

**Explicitly not covered:** authenticated source WADO/QIDO, PatientMapping/Consent/Grant/Authorization enforcement, reauthorization, Audit atomicity, permanent runtime grant, destination comparison, transfer state transition, STOW, or full `AT-FUNC-014`/`AT-SEC-018`/`AT-E2E-003`. The DB persistence sub-gate is not trusted product source evidence and cannot authorize or mark an Exchange completed.

## TC-INT-001-CAP-001~014 — Authorized Synthetic Source Capture Sub-gate

Normative recommendation: `INT-001-DEC-003`. These cases authorize only an internal synthetic/Test source-capture service. The service uses two short verified-Tenant transactions around network I/O: initial fenced `PACS_IMPORT` authorization + start Audit; configured source-A WADO and bounded hashing outside a transaction; final fenced authorization/mapping/state recheck + operation-bound `SOURCE_CAPTURE/PENDING` and success Audit atomically. It has no route or STOW dependency. Persistent privilege inventory increases only by the exact evidence columns required by the runtime service; the writer has no update/delete privilege.

For `TC-INT-001-CAP-002`, execute the actual internal service against disposable PostgreSQL/RLS and synthetic Test Orthanc A/B. Cover absent Consent, absent Grant, withdrawn/expired Consent, revoked/expired Grant, wrong Grant scope, an operation hidden by another verified Tenant, and database-unavailable failure. Authorization denials with a verified Tenant and resolvable operation must return the fixed `DENIED/AUTHORIZATION_DENIED` outcome, make zero DICOM gateway/A network calls, create no source evidence, and write exactly one minimized fixed denial Audit. An RLS-hidden operation must disclose neither row nor Audit; database unavailability must map to the fixed unavailable error, with no DICOM call or denial Audit. No HTTP route, production service, real patient data, destination write, or STOW is in scope.

For `TC-INT-001-CAP-003`, use disposable PostgreSQL/RLS fixtures to exercise operation aggregates whose individual rows/FKs exist but whose Session↔Package↔Study or Session↔source-Hospital binding is inconsistent, plus a fully resolvable operation in a non-`CREATED` state (`FAILED`). All operations must first be inserted as `CREATED`; prepare the non-`CREATED` case through the existing `PacsTransferOperation` domain transition and `PostgresPacsTransferOperationRepository`, with its own explicit synthetic fixture-transition Audit. Never bypass the DB initial-state/transition trigger with direct SQL state fabrication. The malformed/unresolvable aggregates must return only fixed `DENIED/AUTHORIZATION_DENIED`, make zero source metadata/instance or any other DICOM calls, create no evidence, reveal no operation-scope details, and produce no source-capture denial Audit because no complete trusted scope resolves. The valid `FAILED` operation must be denied before DICOM I/O, create no evidence, remain `FAILED`, and produce exactly one minimized fixed source-capture denial Audit under the verified Tenant. Assert all tested operation states are unchanged by capture; B remains empty; STOW and destination verification are zero; cleanup removes only the disposable project. This does not test CAP-009 in-flight state races or authorize a route/production service.

For `TC-INT-001-CAP-004`, test the real internal source-capture service through the disposable PostgreSQL/RLS + synthetic HTTPS Test Orthanc A/B runner. The command must reject caller-supplied PACS endpoint, username/password, or Authorization fields as an invalid request before entering verified-Tenant context or making any upstream request. For an authorized operation, observe every actual adapter request and assert `https`, exact configured `orthanc-a:8042`, `/dicom-web/` path, no URL userinfo/fragment, `GET`, redirect mode `error`, and only the configured Hospital A Basic Authorization value; do not print credentials. Assert zero requests to Hospital B, any other host/port, or an HTTP scheme, and zero STOW/destination-verification calls. Adapter/config negative tests must reject HTTP downgrade, untrusted hostname, wrong port, userinfo, path/query/fragment override before `fetch`; operation-role checks must deny WADO to B and A-side STOW without `fetch`. Re-run the existing local TLS Acceptance for trusted CA/SAN, untrusted or malformed CA, wrong DNS name, and plaintext downgrade. The source-capture module must remain without a browser-facing controller/OpenAPI route; this is a static wiring/contract boundary, not a claim of production browser or Client↔MediQ testing. Use only the ignored local Test CA/credentials and synthetic DICOM; do not add dynamic hospital endpoint lookup, public route, real PACS, STOW, or production TLS claims.

| Test ID | Scenario | Expected Result | Scope | Status |
|---|---|---|---|---|
| `TC-INT-001-CAP-001` | Resolve an existing PACS operation | The exact command contains only operation/Consent/Grant references, verified principal/Tenant candidate, correlation ID and optional cancellation signal. Derive Session, Package, Study UID, source/destination Hospital and patient reference only from the Tenant-visible operation graph; reject caller-supplied or conflicting scope; never return local PatientID or DICOM UIDs | Domain/DB security | **PASS —** focused API regression plus isolated PostgreSQL/Test Orthanc A/B integration: spoofed Study UID rejected before Tenant transaction or A/B I/O; successful A WADO path derived from the operation-bound manifest; response allowlist contains no PatientID/Study UID; see [MEDIQ-INT-001 evidence](implementation/MEDIQ-INT-001/TEST-EVIDENCE.md) |
| `TC-INT-001-CAP-002` | Initial exact `PACS_IMPORT` authorization is missing, denied, expired, withdrawn, revoked, cross-tenant or unavailable | Against disposable PostgreSQL/RLS: absent Consent/Grant, withdrawn/expired Consent, revoked/expired Grant and wrong scope return fixed `DENIED/AUTHORIZATION_DENIED`, zero DICOM gateway/A calls and no evidence; exactly one minimized fixed denial Audit only when verified Tenant + operation scope resolve. RLS-hidden cross-Tenant operation returns generic denial with no Audit; unavailable DB returns fixed unavailable with no DICOM call/Audit. Synthetic/Test only; no route/STOW | Integration/security | **PASS —** isolated synthetic PostgreSQL/RLS + Test Orthanc A/B; 3 consecutive runner passes × 19 TAP tests (shared suite including CAP-003/004), 7 exact CAP-002 denial Audits, hidden/unavailable Audit=0, zero DICOM/A calls for denied paths and no source evidence; see [MEDIQ-INT-001 evidence](implementation/MEDIQ-INT-001/TEST-EVIDENCE.md) |
| `TC-INT-001-CAP-003` | Wrong operation/session/study/package/source binding or operation not `CREATED` | On disposable PostgreSQL/RLS + HTTPS Test Orthanc A/B, exercise: (a) operation references a Study/package from a different Session, (b) Study/package source Hospital differs from the operation Session source, and (c) fully bound `FAILED` operation prepared from `CREATED` through the approved domain/repository transition. (a)/(b): fixed generic denial, zero DICOM calls, no evidence, no existence/scope-revealing denial Audit, state unchanged. (c): fixed denial plus exactly one minimized source-capture denial Audit, zero DICOM calls/evidence, state remains `FAILED`; separately observe the setup transition Audit. Assert capture does not alter any operation state, B stays empty, STOW/destination verification stay zero, and disposable cleanup succeeds | Integration / DB / security | **PASS —** 3 consecutive isolated runner passes × 19 TAP tests; two mismatched aggregates denied with zero DICOM/evidence/Audit and unchanged `CREATED`; valid aggregate transitioned to `FAILED` through domain/repository, then denied with exactly one fixed source-capture Audit and no evidence/state change; independent observer confirmed setup Audit, B empty and cleanup; see [MEDIQ-INT-001 evidence](implementation/MEDIQ-INT-001/TEST-EVIDENCE.md) |
| `TC-INT-001-CAP-004` | Resolve and use source endpoint | Disposable live source-capture invocation rejects endpoint/credential override fields before Tenant/network; valid operation uses only exact configured `https://orthanc-a:8042/dicom-web/` GETs with verified Test CA/SAN and configured A credential, no redirect or URL userinfo; invalid scheme/host/port/path/query/fragment and WADO-to-B/A-STOW role misuse fail before `fetch`; zero B/other-host/HTTP/STOW/destination calls. No browser controller/OpenAPI route is present; no production/client-ingress claim | Integration / adapter / TLS / security | **PASS —** source-capture runner 19/19 on three consecutive runs; TLS/DICOM 7/7; AppConfig 11/11; API 34 files/585 tests. Caller overrides rejected pre-context/network; four actual HTTPS A WADO requests per capture used exact configured host/port/path, GET, redirect error and server-configured A credential; invalid origins/roles had zero fetch; B EMPTY, no STOW/destination calls and cleanup/stack preservation passed; see [MEDIQ-INT-001 evidence](implementation/MEDIQ-INT-001/TEST-EVIDENCE.md) |
| `TC-INT-001-CAP-005` | Persisted source count is missing/invalid; or A WADO metadata is empty, count/series-count mismatched, malformed, wrong-Study, duplicate, internally inconsistent, or exceeds 2,000 instances | Invalid persisted counts are denied before WADO. Semantically valid but empty/count-mismatched metadata returns fixed `DENIED/SOURCE_METADATA_INVALID`; malformed wire data, wrong Study identity, duplicate identity, or over-limit response maps to fixed `SOURCE_CAPTURE_UNAVAILABLE` plus minimized `PACS_SOURCE_CAPTURE_FAILED/SOURCE_READ_FAILED`. Every case opens zero instance payload streams, persists no evidence/success Audit, leaves operation state unchanged, and discloses no raw DICOM/upstream detail, PatientID, UID, or credential. Following prior transient DB-context failures, PASS requires three consecutive fresh isolated runner executions with no in-run retries; if a failure recurs, diagnose/fix rather than masking | DICOM/domain/integration/security | **PASS — scoped.** The historical metadata matrix remains valid; after the COMMIT-only 5,000 ms client deadline, API 35 files/606 tests and three fresh isolated runs each passed 31/31 with independent Audit/evidence observer, B EMPTY before/after, cleanup and existing-stack preservation. No retry occurred. Underlying DB/host/storage latency remains a residual risk; see `MEDIQ-INT-001` evidence |
| `TC-INT-001-CAP-006` | Destination mapping missing/ambiguous/unverified/revoked/invalid or any source metadata PatientID differs from the server-resolved destination mapping | Mapping failures deny before metadata WADO; source PatientID mismatch denies after one metadata WADO but before any instance payload WADO. Use only fixed non-identifying results and minimized Audit. No payload stream, evidence, success Audit or operation-state change; no PatientID/UID in result, log or Audit. Cover missing, ambiguous, unverified, revoked and invalid mapping evidence in service tests; exercise a real HTTPS A metadata response with one mismatched synthetic instance PatientID mutated only in test memory | Mapping / identity / DICOM / security | **PASS — scoped.** API 34 files/601 tests and isolated PostgreSQL/RLS + HTTPS A runner 31/31 passed. Six invalid mapping cases made zero metadata/instance requests and produced only fixed denial Audit; one mismatched synthetic PatientID caused one A metadata GET, zero instance WADO/evidence/success Audit, unchanged `CREATED`, B EMPTY and cleanup. No identifiers were exposed; no STOW/destination call |
| `TC-INT-001-CAP-007` | Valid operation-bound source metadata and instance streams | On disposable synthetic PostgreSQL/RLS + HTTPS Test Orthanc A/B, fetch only the persisted Study from configured A; instrument the DICOM Gateway return stream with a test-only incremental observer that retains no payload; prove each expected instance is opened once, fully consumed before the next opens, peak active instance streams is one, and request order is canonical. Each stream's observed byte count/SHA-256 must equal the deterministic synthetic CT fixture manifest. Independently recompute `SHA256-MANIFEST-V1` framing from fixture UID/length/per-instance hashes and compare with internal pending evidence algorithm/source_digest/object_count. Capture remains `CREATED` with one `SOURCE_CAPTURE/PENDING` row and fixed success Audit; response/Audit/output disclose no payload, PatientID, UID or digest. Assert configured HTTPS A only, no Tenant DB transaction spans WADO, B unchanged, zero STOW/destination calls, and cleanup/existing-stack preservation. Static review confirms no study-sized payload aggregation or filesystem spill dependency in the builder/service/adapter path. Existing hash-unit Acceptance remains responsible for hard count/byte ceilings and cancellation; no 2-GiB performance claim | DICOM/integrity/integration | **PASS — scoped.** API build/regression 35 files/606 tests and three fresh isolated runs each passed 31/31; each included the non-retaining stream observer, independent Audit/evidence check, B EMPTY before/after, zero STOW/destination calls, cleanup and existing-stack preservation. Static review found sequential per-instance hashing, no DICOM study aggregation or filesystem spill; the multipart parser is capped at one 64 MiB instance and may buffer within that per-instance cap, so no 2 GiB memory/performance claim is made. Production PACS and complete transfer remain outside this scope |
| `TC-INT-001-CAP-005-RCA-001` | A recurring failure in verified Tenant transaction `COMMIT` prevents source-capture metadata tests from reaching WADO | In the isolated synthetic CAP runner, record only fixed query phase, validated five-character SQLSTATE, allowlisted driver code/error class or `UNCLASSIFIED`; optionally a coarse failed-query duration bucket. Never record raw message, stack, SQL params, DSN/host, environment values, actor/Tenant/patient identifiers, DICOM bytes or credentials. Ensure the `authorized-source-capture-test` Docker target copies every imported test helper. A module/bootstrap failure before Node tests execute is recorded and corrected as setup failure; it is not DB diagnostic evidence. Then make one fresh diagnostic runner invocation without in-run/automatic retry; record outcome and cleanup/existing-stack preservation. This diagnostic run never counts toward the CAP-005 three-consecutive-run threshold. If it passes, root cause remains unknown and CAP-005 stays open; if it fails, diagnose before proposing any behavior/config correction | Test harness / database / privacy | **PASS — diagnosis scoped.** Test-image import failure was corrected before the valid diagnostic run; the safe classifier identified `QUERY_READ_TIMEOUT` on COMMIT (`GTE1000MS`) with no SQLSTATE/raw details. Installed driver code confirms its client timer and the configured 1,500 ms default. The underlying database/host/storage latency cause is not established |
| `TC-INT-001-CAP-005-TIMEOUT-001` | `ActorTenantContextService` COMMIT periodically exceeds node-postgres pool `query_timeout=1500ms` and returns `Query read timeout` without a PostgreSQL SQLSTATE | Override only COMMIT with `query_timeout=5000`; keep connect timeout and pool query default at 1500 ms. Unit tests prove the exact per-query option and fail-closed timeout handling, client discard and no retry. API regression passes. Then run three consecutive fresh isolated CAP runners, each 31/31 with independent Audit/evidence observer, B EMPTY before/after, zero STOW/destination calls, cleanup and existing-stack preservation. Stop at first failure; inspect safe class. Do not infer rollback from a timed-out COMMIT or blindly retry an ambiguous transaction outcome | P0 database reliability / security | **PASS — scoped.** Unit coverage and API 35 files/606 tests pass; three consecutive fresh isolated runners each passed 31/31 with observer, B, cleanup and stack-preservation checks. Timeout remains bounded; underlying host/storage latency and production SLO are not proven |
| `TC-INT-001-CAP-008` | Source metadata/instance WADO failure, body stream error after partial consumption, wrong stream media type or SOP UID, content-length mismatch, lower configured byte/object cap, caller cancellation, or the fixed 30-minute capture deadline | Layered proof: (1) manifest-builder unit matrix rejects media-type/UID/length/cap/read errors without returning a partial manifest and closes/cancels the active reader where possible; (2) service tests map transport/integrity failures to generic `SOURCE_CAPTURE_UNAVAILABLE` and one fixed `PACS_SOURCE_CAPTURE_FAILED/FAILURE` reason `SOURCE_READ_FAILED`, caller abort to `SOURCE_CAPTURE_CANCELLED`, and total deadline to `SOURCE_CAPTURE_DEADLINE`; no `SOURCE_CAPTURE/PENDING`, no `PACS_SOURCE_CAPTURED/SUCCESS`, operation stays `CREATED`, no raw error/UID/PatientID/payload/credential disclosure; (3) use fake timers for the 30-minute deadline rather than a 30-minute wall-clock test; (4) inject one mid-body failure only at the synthetic HTTPS A test boundary, then verify the real service/adapter path, fixed Audit/evidence state, active-stream cleanup, B EMPTY and zero STOW/destination calls. Failure Audit is required only when verified Tenant/operation context is available; no Audit is emitted for unresolved/hidden scope. Synthetic/Test only; no production PACS mutation. Run API build/regression and three consecutive fresh isolated runners without in-run retries; each full suite passes, independent Audit/evidence observer passes, B remains EMPTY, cleanup succeeds and existing stack is unchanged. Stop on first failure | DICOM stream / integrity / cancellation / Audit security | **PASS — scoped.** API build/regression passed (35 files/614 tests); three consecutive fresh isolated runners each passed 31/31 with active-stream closure, Audit/evidence observer, B EMPTY before/after, zero STOW/destination calls, cleanup and existing-stack preservation. A mid-body WADO failure exposed an adapter hang; the adapter now observes multipart iterator failure while reading the part stream. Synthetic internal source-capture only; see `MEDIQ-INT-001` evidence |
| `TC-INT-001-CAP-009` | Consent/Grant/Session expiry, withdrawal, revocation, destination mapping change, or operation/session state change during WADO | Layered proof: (1) deterministic API service tests start with valid authorization, consume all synthetic source streams, then advance the authorization clock and mutate one current authorization/scope fact before final persistence; cover Consent expiry/withdrawal, Grant expiry/revocation, Session expiry/ineligible state, operation leaving `CREATED`, and destination mapping binding change. Final fenced revalidation denies before evidence persistence; preserve changed operation/session state; create no `PACS_SOURCE_CAPTURED/SUCCESS` or `SOURCE_CAPTURE/PENDING` for the denied attempt; return only fixed denial and minimized capture-denial Audit where trusted scope resolves. (2) Disposable PostgreSQL/RLS + HTTPS Test Orthanc A/B uses a distinct `CREATED` operation and real runtime `GrantRevocationService` as the synthetic destination actor. Commit revocation after all three A instance bodies are consumed and before the last observed stream closes; final Session-fenced authorization must observe it and deny. Independent observer verifies zero evidence for that operation, capture start+fixed-denial Audit with no capture-success Audit, separate Grant-revocation Audit, unchanged `CREATED`, all A streams closed, no Tenant transaction spanning WADO, B EMPTY, and zero STOW/destination calls. State mutation uses the runtime application service, not admin SQL. Synthetic/Test only; bytes already received during WADO are not recallable. Cleanup and existing-stack preservation are mandatory | Concurrency / authorization / security / audit | **PASS — scoped.** API build/regression 35 files/620 tests; focused service suite 38/38; three fresh isolated runs each passed 32/32 with exact independent Audit/evidence observer, live committed Grant revocation before final reauthorization, B EMPTY, stream closure, zero STOW/destination calls, cleanup and existing-stack preservation. An initial fixture-seed uniqueness failure occurred before the CAP suite and was corrected with a separate synthetic Session/Package/Study; it is excluded from the three passing runs. No route, production PACS, remote recall, STOW, destination verification or full-transfer claim |
| `TC-INT-001-CAP-010` | Successful operation-bound source capture | Reuse the single valid success capture in the isolated HTTPS Test Orthanc A/B + PostgreSQL/RLS suite; do not invoke a second success for the same operation. Prove verified initial `PACS_IMPORT`, no Tenant transaction during WADO, all expected A instance streams consumed once and byte/manifest-bound to the synthetic fixture, then in the final fenced Tenant transaction persist exactly one immutable operation-bound `SOURCE_CAPTURE/PENDING` row and exactly one correlation-bound `PACS_SOURCE_CAPTURED/SUCCESS` Audit. Independent read-only observer checks `SHA256-MANIFEST-V1`, expected digest/count, pending-only fields, zero destination fields and exact Audit cardinality. Operation remains `CREATED`. Response allowlist is exactly `evidenceId`, `kind=CAPTURED`, `objectCount`, `status=PENDING`; no UID, PatientID, digest, payload or credential. A is the only source; B EMPTY; STOW/destination calls 0; cleanup and existing-stack preservation pass. CAP-012 owns injected failure/rollback proof; no public route/full-transfer claim. Run API build/regression and three fresh isolated suites, each passing 32/32 with no in-run retry; stop on first failure | API / PostgreSQL-RLS / audit / integrity | **PASS — scoped.** API build/regression 35 files/620 tests; three fresh isolated suites each passed 32/32; exact independent observer verified one pending row + one success Audit, operation `CREATED`, response allowlist, A-only WADO/no Tenant transaction, B EMPTY, zero STOW/destination, cleanup and stack preservation. CAP-012 rollback was outside this checkpoint and later passed its separate scoped Acceptance; all product/transfer gates remain open |
| `TC-INT-001-CAP-011` | Start/failure/denial/success source-capture Audit catalog and metadata minimization | Exhaustively accept only these 11 domain tuples: `PACS_SOURCE_CAPTURE_STARTED/STUDY/ALLOW/null`; `PACS_SOURCE_CAPTURED/STUDY/SUCCESS/null`; `PACS_SOURCE_CAPTURE_DENIED/STUDY/DENY/{AUTHORIZATION_DENIED, OPERATION_NOT_CAPTUREABLE, PATIENT_MAPPING_INVALID, SOURCE_PATIENT_ID_MISMATCH, SOURCE_METADATA_INVALID}`; `PACS_SOURCE_CAPTURE_FAILED/STUDY/FAILURE/{SOURCE_READ_FAILED, SOURCE_CAPTURE_CANCELLED, SOURCE_CAPTURE_DEADLINE, SOURCE_CAPTURE_PERSISTENCE_FAILED}`. Reject wrong action/result/resource combinations, unknown/free-text reasons, missing or malformed required UUID/time context, and extra fields for DICOM Study/Series/SOP UID, local PatientID, payload, credential, token, key or free text. On the existing synthetic A/B + PostgreSQL/RLS runner, read-only observer validates persisted row identities (`actor_id`, `tenant_id`, `exchange_session_id`), `resource_type=STUDY`, `resource_id=study_ref_id` UUID (not DICOM UID), fixed action/result/reason, correlation UUID and valid occurred/created timestamps for start/success/denial/failure. Reconcile row shape with the exact metadata-only Audit columns. No route/schema/privilege/PACS behavior change; A-only WADO, no Tenant transaction during WADO, B EMPTY, zero STOW/destination calls, cleanup and existing stack preservation remain required. Run API build/regression and three consecutive fresh isolated suites with no in-run retry; stop on first failure. PASS is scoped to these source-capture producers, not global Audit completeness | Audit/privacy/security | **PASS — scoped.** Domain catalog/negative-field checks, service metadata assertions, API build/regression 35 files/640 tests, focused 78/78, and three fresh isolated runs each 32/32 passed; exact read-only row/schema observer, B EMPTY, zero STOW/destination calls, cleanup and existing-stack preservation verified |
| `TC-INT-001-CAP-012` | Start-Audit, pending-evidence, and final success-Audit persistence failure | In fresh disposable PostgreSQL fixtures, inject operation/correlation-bound `BEFORE INSERT` failures under the real runtime role. (1) Start Audit failure: fixed unavailable result, zero A metadata/instance requests, no source Audit/evidence, operation `CREATED`. (2) Evidence insert failure after WADO: final transaction rolls back; no evidence or success Audit; preserve committed start Audit and only fixed best-effort failure Audit if sink is healthy; fixed unavailable result, operation unchanged. (3) Final `PACS_SOURCE_CAPTURED` Audit failure after evidence insert: rollback evidence + success Audit atomically; persist only fixed failure Audit if possible; fixed unavailable result, operation `CREATED`. Independent observer checks exact per-operation/correlation rows and no raw DB error. Three consecutive fresh isolated PostgreSQL/RLS + HTTPS Test Orthanc A/B runs with no in-run retry; start-failure case has zero A calls, post-WADO cases close all A streams, B EMPTY before/after, STOW/destination calls 0, cleanup removes disposable project/volume and existing `mediq` stack stays unchanged. API build/regression and diff check required; stop at first failure. Scope is these deterministic insert failures, not arbitrary DB/COMMIT outages or full transfer | DB atomicity / audit / fail-closed | **PASS — scoped.** Focused source-capture API tests 40/40; API build/regression 35 files/642 tests; three consecutive fresh isolated PostgreSQL/RLS + HTTPS Test Orthanc runs each passed 35/35 with no in-run retry. Independent observer confirmed start-Audit failure left no capture Audit/evidence and caused zero A WADO; evidence and success-Audit failures each rolled back the final transaction, left no pending evidence/success Audit, retained only the committed start Audit plus one fixed persistence-failure Audit, and kept the operation `CREATED`. Fixed caller error only; B EMPTY before/after, zero STOW/destination calls, all A streams closed, cleanup and existing-stack preservation passed. No arbitrary COMMIT/disk/network failure or full-transfer claim |
| `TC-INT-001-CAP-013` | Runtime privilege/RLS review | Exact evidence `SELECT`/`INSERT` columns, six source-capture `study_references` columns, and four temporary-payload metadata columns; UPDATE is limited to those four temporary-payload metadata columns (no DICOM UID or other StudyReference field update); no DELETE/table-level/PUBLIC/DDL rights; no-context and unrelated Tenant see or change no rows; verify final catalog inventory is exactly 244 and migration reset/reapply | DB security | **PASS — current 244-grant baseline verified in final scratch DB-008 clean/repeat/reset/reapply;** exact runtime grants and forced RLS passed. The earlier INT-001 evidence remains scoped to its historical 236-grant baseline. See [MEDIQ-INT-001 evidence](implementation/MEDIQ-INT-001/TEST-EVIDENCE.md) and [PACS-001 evidence](implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md) |
| `TC-INT-001-CAP-014` | Prove effect boundary with Test Orthanc A/B | Real DB-backed authorization commits before A WADO; invalid Grant causes zero A requests; authorized stream failure does not persist evidence or transition the operation; success records one pending source baseline; B STOW/POST and B-store changes are zero; no Tenant transaction spans WADO headers/stream; temporary resources are removed and existing stack is unchanged | Integration/security | **PASS — isolated synthetic Test Orthanc A/B + disposable PostgreSQL; shared runner 19/19 Node tests on three consecutive runs including CAP-001~004, DB audit/evidence observer, B empty before/after; see [INT-001 evidence](implementation/MEDIQ-INT-001/TEST-EVIDENCE.md)** |

These scoped cases do not satisfy full `REQ-INT-001` source-to-destination verification, `AT-FUNC-014`, `AT-SEC-018`, `AT-E2E-003`, final Mandatory Preflight, STOW/no-STOW product import route, destination verification, global Audit completeness, or Transfer `COMPLETED`. The `PACS_SOURCE_CAPTURED` event means only an authorized synthetic source manifest was durably recorded as `PENDING`.
