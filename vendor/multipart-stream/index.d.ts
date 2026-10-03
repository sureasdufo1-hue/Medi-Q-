import { Readable } from 'node:stream';

/**
 * Public error classes (FR-019, NFR-DR-S-001, NFR-DR-S-004, NFR-DR-S-012,
 * NFR-DR-D-007).
 *
 * Every class:
 *   - extends `Error`
 *   - sets `this.name` literally to its class-name string in the constructor
 *     (NFR-DR-D-007 — survives minification AND is the documented fallback
 *     when `instanceof` returns false across the ESM/CJS module-format
 *     boundary)
 *   - supports `cause` plumbing via `super(message, options)`
 *   - exposes typed structured property fields for caller-side branching
 *
 * The classes are runtime values (NFR-012); consumers may import them as
 * values for `instanceof` checks AND as types in signatures.
 */
/**
 * Thrown when no source-stream bytes arrive for `idleTimeoutMs` consecutive
 * milliseconds. The source has been destroyed and all listeners removed by
 * the time this surfaces.
 *
 * @example
 *   try {
 *     await fetchAndHandleMultipart(url, { idleTimeoutMs: 5000, totalTimeoutMs: 60_000, parser });
 *   } catch (err) {
 *     if (err instanceof MultipartIdleTimeoutError) {
 *       metrics.increment('multipart.idle_timeout', { ms: err.idleTimeoutMs });
 *     }
 *     throw err;
 *   }
 */
declare class MultipartIdleTimeoutError extends Error {
    /** Stable cross-format discriminator (NFR-DR-D-007). */
    readonly name = "MultipartIdleTimeoutError";
    /** The configured idle window (ms) that elapsed without source activity. */
    readonly idleTimeoutMs: number;
    /**
     * @param idleTimeoutMs - The configured idle window in ms.
     * @param options - Optional `{ cause }` for wrapping a lower-level error.
     */
    constructor(idleTimeoutMs: number, options?: ErrorOptions);
}
/**
 * Thrown when the total wallclock budget (`totalTimeoutMs`) elapses,
 * regardless of source activity.
 *
 * @example
 *   if (err instanceof MultipartTotalTimeoutError) {
 *     metrics.increment('multipart.total_timeout');
 *   }
 */
declare class MultipartTotalTimeoutError extends Error {
    readonly name = "MultipartTotalTimeoutError";
    /** The configured total window (ms) that elapsed. */
    readonly totalTimeoutMs: number;
    /**
     * @param totalTimeoutMs - The configured total budget in ms.
     * @param options - Optional `{ cause }`.
     */
    constructor(totalTimeoutMs: number, options?: ErrorOptions);
}
/**
 * Thrown when the caller-provided `AbortSignal` fires (FR-009), or is already
 * aborted at call time. `reason` carries the signal's `reason` verbatim, or
 * is `undefined` if the signal had no reason. The library NEVER synthesizes
 * a server-derived reason (F-S-006).
 *
 * @example
 *   const ctrl = new AbortController();
 *   setTimeout(() => ctrl.abort(new Error('user cancelled')), 5000);
 *   try {
 *     await fetchAndHandleMultipart(url, { signal: ctrl.signal, idleTimeoutMs: 5000, totalTimeoutMs: 30000, parser });
 *   } catch (err) {
 *     if (err instanceof MultipartAbortError) console.warn('aborted because:', err.reason);
 *   }
 */
declare class MultipartAbortError extends Error {
    readonly name = "MultipartAbortError";
    /**
     * The signal's `reason` if the caller supplied one, else `undefined`. Per
     * F-S-006 the library never synthesizes a reason that embeds server bytes.
     */
    readonly reason?: unknown;
    /**
     * @param reason - Optional caller-supplied abort reason.
     * @param options - Optional `{ cause }`.
     */
    constructor(reason?: unknown, options?: ErrorOptions);
}
/**
 * Thrown when the source stream ends without parser observing the closing
 * multipart boundary (FR-022) — typically a mid-flight server hangup or
 * transport-layer cut. Cleanup per FR-010 still runs.
 *
 * @example
 *   if (err instanceof MultipartTruncatedError) {
 *     retryQueue.enqueue({ url, bytesReceived: err.bytesReceived });
 *   }
 */
declare class MultipartTruncatedError extends Error {
    readonly name = "MultipartTruncatedError";
    /** Total bytes pulled from the source before it ended prematurely. */
    readonly bytesReceived: number;
    /**
     * @param bytesReceived - Cumulative bytes received before the source ended.
     * @param options - Optional `{ cause }`.
     */
    constructor(bytesReceived: number, options?: ErrorOptions);
}
/**
 * Info-bag for {@link MultipartPartTooLargeError}.
 */
interface MultipartPartTooLargeInfo {
    /** The configured `maxPartBytes` cap that was exceeded. */
    readonly maxPartBytes: number;
    /** Zero-based ordinal of the offending part. */
    readonly partIndex: number;
    /** Bytes observed at the moment the cap tripped. */
    readonly bytesReceived: number;
}
/**
 * Thrown when a part body's accumulated bytes exceed `maxPartBytes`
 * (NFR-DR-S-001). The offending part body is destroyed and full FR-010
 * cleanup runs before this surfaces.
 *
 * @example
 *   if (err instanceof MultipartPartTooLargeError) {
 *     metrics.increment('multipart.part_too_large', { partIndex: err.partIndex });
 *   }
 */
declare class MultipartPartTooLargeError extends Error {
    readonly name = "MultipartPartTooLargeError";
    readonly maxPartBytes: number;
    readonly partIndex: number;
    readonly bytesReceived: number;
    /**
     * @param info - Structured trip info: `{ maxPartBytes, partIndex, bytesReceived }`.
     * @param options - Optional `{ cause }`.
     */
    constructor(info: MultipartPartTooLargeInfo, options?: ErrorOptions);
}
/**
 * Info-bag for {@link MultipartHeadersTooLargeError}.
 */
interface MultipartHeadersTooLargeInfo {
    /** Discriminator: which limit was hit. */
    readonly limit: 'count' | 'bytes';
    /** Zero-based ordinal of the offending part. */
    readonly partIndex: number;
    /** The configured cap. */
    readonly cap: number;
    /** Observed value at trip-time. */
    readonly observed: number;
}
/**
 * Thrown when a part has more headers than `maxHeadersPerPart` (default 100)
 * OR its header block bytes exceed `maxHeaderBytesPerPart` (default 16 KiB)
 * — NFR-DR-S-004.
 *
 * @example
 *   if (err instanceof MultipartHeadersTooLargeError) {
 *     log.warn({ limit: err.limit, observed: err.observed }, 'oversized part headers');
 *   }
 */
declare class MultipartHeadersTooLargeError extends Error {
    readonly name = "MultipartHeadersTooLargeError";
    readonly limit: 'count' | 'bytes';
    readonly partIndex: number;
    readonly cap: number;
    readonly observed: number;
    /**
     * @param info - Structured trip info: `{ limit, partIndex, cap, observed }`.
     * @param options - Optional `{ cause }`.
     */
    constructor(info: MultipartHeadersTooLargeInfo, options?: ErrorOptions);
}
/**
 * Info-bag for {@link MultipartTooManyPartsError}.
 */
interface MultipartTooManyPartsInfo {
    /** The configured `maxParts` cap that was exceeded. */
    readonly maxParts: number;
    /** Observed part count when the cap tripped (== `maxParts + 1`). */
    readonly observed: number;
}
/**
 * Thrown when the multipart envelope contains more parts than `maxParts`
 * (default `10_000`) — NFR-DR-S-012.
 *
 * @example
 *   if (err instanceof MultipartTooManyPartsError) {
 *     log.warn({ cap: err.maxParts }, 'too many parts');
 *   }
 */
declare class MultipartTooManyPartsError extends Error {
    readonly name = "MultipartTooManyPartsError";
    readonly maxParts: number;
    readonly observed: number;
    /**
     * @param info - Structured trip info: `{ maxParts, observed }`.
     * @param options - Optional `{ cause }`.
     */
    constructor(info: MultipartTooManyPartsInfo, options?: ErrorOptions);
}

/**
 * `extractBoundary` — RFC 2046 boundary extractor (FR-016).
 *
 * Public utility. Pure function — no I/O, no allocations beyond the result
 * and a single intermediate buffer for unescaping a quoted string.
 *
 * Implementation note (NFR-DR-S-011, T-080): this is a hand-written,
 * non-backtracking tokenizer. A naive regex with an alternation between the
 * quoted-string and bare-token forms is ReDoS-prone on adversarial input
 * (megabytes of `\\\"` sequences); the deliberate single-pass tokenizer
 * below runs in O(n) time on any input.
 */
/**
 * Parse the `boundary=` parameter out of an HTTP `Content-Type` header value.
 *
 * Handles RFC 2046 quoted-string and bare-token forms. The first `boundary=`
 * occurrence wins (parameters are scanned left-to-right). Boundary parameter
 * names are matched case-insensitively. The returned token is unquoted and
 * has its backslash escapes resolved.
 *
 * @param contentTypeHeader - The full `Content-Type` header value, e.g.
 *   `multipart/related; boundary="weird;boundary"`. May be `null` or
 *   `undefined`; both are treated as missing-input errors.
 * @returns The unquoted boundary token.
 * @throws {Error} `multipart: Content-Type header is required to extract
 *   boundary` when the input is null, undefined, or empty.
 * @throws {Error} `multipart: boundary parameter missing from Content-Type:
 *   <header>` when the header has no `boundary=` parameter.
 * @throws {Error} `multipart: boundary parameter is empty in Content-Type:
 *   <header>` when the parameter is present but the value is empty.
 *
 * In every error path that embeds the input header, the embedded value is
 * sanitized via the full sanitizer (truncate to 120 chars, control-char
 * redact, ANSI redact, JSON.stringify per NFR-DR-S-006).
 *
 * @example
 *   extractBoundary('multipart/related; boundary=foo'); // 'foo'
 *
 * @example
 *   // Quoted-string form with embedded special chars (RFC 2046):
 *   extractBoundary('multipart/related; boundary="weird;boundary"');
 *   // 'weird;boundary'
 *
 * @example
 *   // Multiple parameters in any order; case-insensitive parameter name:
 *   extractBoundary('multipart/related; type="application/dicom"; BOUNDARY=BAR; charset=utf-8');
 *   // 'BAR'
 */
declare function extractBoundary(contentTypeHeader: string | null | undefined): string;

/**
 * Public type aliases re-exported from `src/index.ts`.
 *
 * Per NFR-DR-A-013, every optional input field on the option-bag interfaces
 * (`ParseMultipartOptions`, `MultipartHandlerOptions<T>`) uses the explicit
 * `field?: T | undefined` form (NOT bare `field?: T`). This lets callers
 * spread-merge dynamically-built option records under
 * `exactOptionalPropertyTypes: true` without TypeScript complaining about an
 * `undefined` slot the schema does not accept.
 *
 * Read-only output fields on `StreamingMultipartPart` and the result struct
 * use the `field?: T | undefined` form too for symmetry.
 *
 * Internal-only types (`src/internal/`) are NOT re-exported and may use the
 * simpler `field?: T` form since callers never construct them.
 */

/**
 * One sub-part yielded by `parseMultipartRelated`. The body is a *streaming*
 * Node `Readable` — callers MUST drain or destroy it; if they neither drain
 * nor destroy, the library destroys it for them in the iterator's `finally`
 * (FR-010).
 *
 * Headers are normalized to lowercase keys (consistent with Node `http`) and
 * collapsed to single strings; convenience getters (`contentType`,
 * `contentId`, `contentLength`) pre-compute the common ones.
 */
interface StreamingMultipartPart {
    /**
     * Zero-based ordinal of this part within the multipart envelope, in the
     * order parser emits them.
     */
    readonly index: number;
    /**
     * The multipart boundary that delimits this envelope. Echoed onto every
     * part for caller-side logging only — parsing has already consumed it.
     */
    readonly boundary: string;
    /**
     * Lowercased part headers as flat strings. Names are normalized to
     * lowercase; repeated values are joined with `, `.
     *
     * Reads are `string | undefined` due to `noUncheckedIndexedAccess`.
     */
    readonly headers: Readonly<Record<string, string | undefined>>;
    /**
     * Raw header block bytes, including the terminating CRLF pair.
     *
     * Surfaced for callers who need byte-exact framing for re-emission or
     * signature verification.
     */
    readonly rawHeaders: Buffer;
    /**
     * Pre-extracted `content-type` header value, or `''` if absent.
     */
    readonly contentType: string;
    /**
     * Pre-extracted `content-id` header value (raw, with angle brackets if the
     * sender included them), or `undefined` if absent.
     */
    readonly contentId?: string | undefined;
    /**
     * Pre-extracted `content-length` parsed via `parseInt(_, 10)`, or
     * `undefined` if the header is absent or non-numeric. Note: parser streams
     * regardless — this value is informational, not a contract.
     */
    readonly contentLength?: number | undefined;
    /**
     * The streaming body of this part as a Node `Readable`. Backed directly by
     * parser's per-part stream — no intermediate buffering. The parser applies
     * backpressure when this stream's buffer fills. Callers should consume
     * (drain, pipe, or destroy) before requesting the next part.
     */
    readonly body: Readable;
}
/**
 * Caller-supplied per-part decision function. Receives a part, returns
 * either a value of type `T` (collected into `MultipartFetchResult.parts`)
 * or `undefined` ("skip this part, contribute nothing").
 *
 * The parser is responsible for either:
 *  - draining `part.body` (e.g. via `streamToString` / `streamToBuffer` /
 *    a pipe), OR
 *  - returning `undefined` without touching `part.body` (the library will
 *    drain it).
 *
 * If the parser throws (or its returned promise rejects), the operation
 * rejects with that error and the source stream is destroyed (FR-014).
 */
type PartParser<T> = (part: StreamingMultipartPart) => Promise<T | undefined>;
/**
 * The resolved value of `fetchAndHandleMultipart` (FR-DR-A-029 — JC-1 shape:
 * `{ parts, bytes, elapsedMs, status, headers }`; the previously-considered
 * `response: Response` field is REMOVED because the body is consumed by the
 * time the result resolves).
 *
 * Successful operations resolve with `parts` populated. Per-part parser
 * failures reject the whole call (FR-014) — they are not bundled into this
 * struct.
 */
interface MultipartFetchResult<T> {
    /**
     * Array of values returned by the caller's `PartParser<T>`, in part order,
     * filtered to drop `undefined`s.
     */
    readonly parts: readonly T[];
    /**
     * Total bytes pulled from the source stream (raw multipart envelope size,
     * not sum of part body sizes).
     */
    readonly bytes: number;
    /** Wall-clock duration from `fetchAndHandleMultipart` entry to resolution. */
    readonly elapsedMs: number;
    /**
     * HTTP status code from the underlying `fetch` response, captured before
     * the body was consumed.
     */
    readonly status: number;
    /**
     * The `Headers` object from the underlying `fetch` response, captured
     * before the body was consumed.
     */
    readonly headers: Headers;
}
/**
 * Snapshot passed to `onProgress`. All fields are computed at the moment of
 * the call.
 */
interface ProgressSnapshot {
    /** Cumulative bytes received from the source stream so far. */
    readonly bytes: number;
    /** Wall-clock ms since the operation started. */
    readonly elapsedMs: number;
    /** Bytes per second over `[start, now]`; `0` when `elapsedMs === 0`. */
    readonly rateBps: number;
}
/**
 * Pluggable structured-logging shim (FR-018, JC-2). Event-style: the library
 * calls the function with a single object describing the event.
 *
 * The library currently only emits events with `level: 'warn'`. Adding more
 * levels in a future minor version is non-breaking because `level` is a
 * union, not a positional argument.
 *
 * Per NFR-DR-S-008, `meta` NEVER contains raw chunk bytes. When the library
 * logs an `Error` whose source is parser or the source stream, it passes only
 * an `errSummary: { name, message }` object with `message` truncated to <=
 * 120 chars, control characters redacted, and the value JSON-stringified
 * per NFR-DR-S-006.
 *
 * @example
 *   // Pino adapter:
 *   const logger: Logger = (event) => log[event.level](event.meta, event.msg);
 *
 * @example
 *   // Default (when omitted): falls back to `console.warn(msg, meta)`.
 */
type Logger = (event: {
    level: 'warn';
    msg: string;
    meta?: unknown;
}) => void;
/**
 * Options accepted by `parseMultipartRelated`. `idleTimeoutMs` and
 * `totalTimeoutMs` are REQUIRED on this entry point too (FR-006 / JC-3 —
 * required-on-both kills the slow-loris vector when the function is used
 * server-side on `req.body`).
 */
interface ParseMultipartOptions {
    /**
     * REQUIRED. Idle timeout (ms). Resets on every chunk received from the
     * source `Readable` (per-chunk `'data'` listener; FR-DR-A-025).
     * Validated as a positive finite integer in the inclusive range
     * `[1, 2_147_483_647]` (NFR-DR-S-009 — Node clamps `setTimeout` delays
     * above `2^31 - 1`).
     */
    idleTimeoutMs: number;
    /**
     * REQUIRED. Total timeout (ms), measured from the call. Same validation
     * rules as `idleTimeoutMs`.
     */
    totalTimeoutMs: number;
    /**
     * Explicit boundary for raw `Readable` inputs. REQUIRED when `input` is a
     * Node `Readable` (no `Content-Type` to parse); IGNORED when `input` is a
     * `Response` (boundary is extracted from `Content-Type`).
     */
    boundary?: string | undefined;
    /**
     * Caller's `AbortSignal`. Already-aborted at call time → synchronous
     * `MultipartAbortError`. Aborted mid-stream → next yield rejects.
     */
    signal?: AbortSignal | undefined;
    /**
     * Progress callback (FR-013). Fires at least once per yielded part and
     * once at completion. Caller exceptions are caught and routed through
     * `logger`; the library guarantees parsing is not derailed by a faulty
     * sink. Per FR-DR-A-025, `onProgress` does NOT drive idle-timer reset.
     */
    onProgress?: ((snap: ProgressSnapshot) => void) | undefined;
    /**
     * Pluggable structured-logging shim (FR-018, JC-2). Event-style. When
     * omitted, internal warnings fall back to `console.warn(msg, meta)`.
     */
    logger?: Logger | undefined;
    /**
     * Per-part body-size cap (NFR-DR-S-001). Omit (default) for no cap. Must
     * be a positive finite integer when set.
     */
    maxPartBytes?: number | undefined;
    /**
     * Maximum part count (NFR-DR-S-012). Defaults to `10_000` when omitted.
     */
    maxParts?: number | undefined;
    /**
     * Maximum number of header lines per part, including repeated names (NFR-DR-S-004). Defaults to
     * `100` when omitted.
     */
    maxHeadersPerPart?: number | undefined;
    /**
     * Maximum total bytes across the header block of a single part
     * (NFR-DR-S-004). Defaults to `16_384` (16 KiB).
     */
    maxHeaderBytesPerPart?: number | undefined;
}
/**
 * Options accepted by `fetchAndHandleMultipart<T>`. Same shape as
 * {@link ParseMultipartOptions} (forwarded down per FR-DR-A-026) plus the
 * required `parser` callback and the optional `fetchInit` for the underlying
 * `fetch` call.
 */
interface MultipartHandlerOptions<T> {
    /** REQUIRED. Per-part decision function. See {@link PartParser}. */
    parser: PartParser<T>;
    /** REQUIRED. Idle timeout (ms). See {@link ParseMultipartOptions.idleTimeoutMs}. */
    idleTimeoutMs: number;
    /** REQUIRED. Total timeout (ms). See {@link ParseMultipartOptions.totalTimeoutMs}. */
    totalTimeoutMs: number;
    /** Caller's `AbortSignal`. Same semantics as in {@link ParseMultipartOptions}. */
    signal?: AbortSignal | undefined;
    /** Progress callback. Same semantics as in {@link ParseMultipartOptions}. */
    onProgress?: ((snap: ProgressSnapshot) => void) | undefined;
    /** Logger. Same semantics as in {@link ParseMultipartOptions}. */
    logger?: Logger | undefined;
    /** Per-part body-size cap. Forwarded. (NFR-DR-S-001) */
    maxPartBytes?: number | undefined;
    /** Maximum part count. Forwarded. (NFR-DR-S-012) */
    maxParts?: number | undefined;
    /** Maximum headers per part. Forwarded. (NFR-DR-S-004) */
    maxHeadersPerPart?: number | undefined;
    /** Maximum header-block bytes per part. Forwarded. (NFR-DR-S-004) */
    maxHeaderBytesPerPart?: number | undefined;
    /**
     * Optional `RequestInit` for the underlying `fetch` call. The library
     * unconditionally REJECTS `signal` here (FR-024) — pass it via
     * `options.signal` instead. The static `Omit<RequestInit, 'signal'>`
     * surfaces the rule at compile time; the runtime check fires for callers
     * who narrow with `as`.
     */
    fetchInit?: Omit<RequestInit, 'signal'> | undefined;
}

/**
 * `fetchAndHandleMultipart` — Layer B (fetch orchestration). FR-005.
 *
 * The wrapper:
 *   1. Validates the option bag synchronously: `parser` presence,
 *      `validatePositiveTimeout` on both timeouts, FR-024 `fetchInit.signal`
 *      ban, and FR-009 already-aborted short-circuit. ALL of these run
 *      BEFORE `fetch` is invoked — T-013 spies on `globalThis.fetch` and
 *      asserts it was never called when the caller's signal is pre-aborted.
 *   2. Calls `fetch(url, { ...fetchInit, signal: options.signal })` —
 *      forwards the caller's `AbortSignal` to fetch directly so a network-
 *      time abort cancels the request before any bytes flow.
 *   3. Validates the response Content-Type (FR-021) case-insensitively
 *      against `multipart/related` BEFORE constructing parser. The offending
 *      Content-Type is sanitized via `truncateForErrorEmbed` per
 *      NFR-DR-S-006. T-035 asserts the parser-activity harness sees zero
 *      Parser instances on this path.
 *   4. Captures `status` + `headers` BEFORE consuming the body
 *      (FR-DR-A-029 — the Response is gone after iteration).
 *   5. Forwards `idleTimeoutMs` / `totalTimeoutMs` / `signal` / `onProgress`
 *      / `logger` / cap fields DOWN to `parseMultipartRelated`. Per
 *      FR-DR-A-026 timer ownership lives in Layer A; Layer B does NOT
 *      construct a TimerState.
 *   6. Drives the for-await loop, awaits `options.parser(part)` per part,
 *      collects non-undefined returns into `parts`.
 *   7. Resolves with `{ parts, bytes, elapsedMs, status, headers }` per
 *      FR-DR-A-029. The previously-considered `response: Response` field
 *      is REMOVED at the type level.
 *
 * Bytes-tracking strategy: the wrapper supplies its own `onProgress`
 * callback to `parseMultipartRelated` regardless of whether the caller
 * supplied one. The internal callback captures `lastBytes` and (when the
 * caller supplied one) forwards the snapshot to the caller — wrapping the
 * caller's call in a try/catch that routes via the resolved logger
 * (FR-017 silent-catch replacement). After the loop ends, the wrapper
 * fires ONE final completion-tick `onProgress` call (T-014 full
 * assertion) with the final `bytes` / `elapsedMs` / `rateBps`.
 */

/**
 * Wrap `fetch` end-to-end: call, validate Content-Type, parse multipart,
 * route each part through the caller's `parser`, and resolve with
 * {@link MultipartFetchResult} (FR-DR-A-029 — `{ parts, bytes, elapsedMs,
 * status, headers }`; NO `response` field).
 *
 * @param url - Forwarded to `fetch`. `URL` is supported for parity with
 *   `fetch` itself.
 * @param options - {@link MultipartHandlerOptions}. `parser`,
 *   `idleTimeoutMs`, and `totalTimeoutMs` are REQUIRED (FR-005 / FR-006).
 *   The static `Omit<RequestInit, 'signal'>` on `options.fetchInit` enforces
 *   the FR-024 signal-ban at compile time; the runtime check below catches
 *   dynamic spreads / `as` consumers.
 * @returns A `Promise<MultipartFetchResult<T>>` that resolves once every
 *   part has been processed.
 *
 * @throws {TypeError} `multipart: options.parser is required` when
 *   `options.parser` is missing or not a function.
 * @throws {TypeError} from `validatePositiveTimeout` when either timeout
 *   is missing/invalid (FR-006 / NFR-DR-S-009 — message mentions Node's
 *   `setTimeout` clamping).
 * @throws {Error} `multipart: pass signal via options.signal — fetchInit.signal
 *   is reserved for internal use` when `options.fetchInit.signal` is set
 *   (FR-024).
 * @throws {MultipartAbortError} synchronously when `options.signal?.aborted`
 *   is `true` at call time (FR-009). `fetch` is NEVER invoked on this path
 *   — T-013 spies on `globalThis.fetch` to verify.
 * @throws {Error} `multipart: response Content-Type is not multipart/related;
 *   got <actual>` when the response Content-Type doesn't start with
 *   `multipart/related` (case-insensitive) (FR-021). Parser is NEVER
 *   constructed on this path — T-035 asserts via the parser-activity
 *   harness.
 * @throws Any error from `parseMultipartRelated` (idle/total timeout,
 *   abort mid-stream, truncation, source error, parser error, cap overflow).
 * @throws Any error from `options.parser`.
 *
 * @example
 *   const result = await fetchAndHandleMultipart(url, {
 *     idleTimeoutMs: 10_000,
 *     totalTimeoutMs: 60_000,
 *     parser: async (part) => streamToString(part.body),
 *   });
 *   console.log(result.parts.length, 'parts in', result.elapsedMs, 'ms');
 */
declare function fetchAndHandleMultipart<T>(url: string | URL, options: MultipartHandlerOptions<T>): Promise<MultipartFetchResult<T>>;

/**
 * `parseMultipartRelated` — streaming parser adapter. FR-001.
 *
 * Resource-cap enforcement (NFR-DR-S-001/004/012):
 *   - `maxPartBytes` (NFR-DR-S-001): each per-part body Readable gets a
 *     'data' listener that increments a per-part byte counter; on overflow
 *     the listener pushes `MultipartPartTooLargeError` into the queue and
 *     destroys the offending part body. No default — when undefined, no
 *     cap is enforced.
 *   - `maxParts` (NFR-DR-S-012): the parser 'part' counter is checked at
 *     each emit; on overflow, push `MultipartTooManyPartsError`. Default
 *     `10_000` when undefined.
 *   - `maxHeadersPerPart` + `maxHeaderBytesPerPart` (NFR-DR-S-004): on
 *     each per-part 'header' event, count headers and sum the byte length
 *     of `name + ': ' + value + '\r\n'` framing for every header line; on
 *     overflow, push `MultipartHeadersTooLargeError`. Defaults: count=100,
 *     bytes=16384 (16 KiB).
 *
 * Timer + abort machinery (FR-006/FR-007/FR-008/FR-009/FR-DR-A-025/
 * FR-DR-A-026):
 *   - `validatePositiveTimeout` calls at the top of the generator enforce
 *     the FR-006 / JC-3 contract (both timeouts REQUIRED, both validated
 *     against `[1, 2^31-1]`).
 *   - `setupTimers(...)` constructs the composite abort signal aggregating
 *     idle, total, and caller-supplied AbortSignal — one source of truth
 *     for all three. The signal listens for any of those firing and pushes
 *     the right error class into the queue.
 *   - The per-chunk source `'data'` listener resets the idle timer
 *     (FR-DR-A-025 — onProgress is NOT used for this).
 *   - The cleanup function calls `timers.cleanup()` — same idempotent
 *     `cleaned` flag.
 *   - Already-aborted callers short-circuit on first `.next()` per FR-009.
 *
 * Cleanup contract: the `finally` cleanup drains unyielded part bodies
 * (FR-010), removes 'data'/'error'/'end' listeners on source and 'part'/
 * 'finish' on parser, unpipes + destroys source, and KEEPS parser's 'error'
 * listener for late-emit observability (FR-011). Truncation detection
 * (FR-022) fires when source 'end' arrives without parser 'finish' having
 * fired.
 */

/**
 * Parse a `multipart/related` envelope as a typed async-iterator of
 * streaming parts (FR-001).
 *
 * @param input - A Web `Response` (boundary auto-extracted from
 *   `Content-Type`) or a Node `Readable` (caller supplies `boundary` via
 *   options).
 * @param opts - {@link ParseMultipartOptions}. `idleTimeoutMs` and
 *   `totalTimeoutMs` are REQUIRED on this entry point too (FR-006 / JC-3) and
 *   are validated synchronously via `validatePositiveTimeout` — both must be
 *   positive finite integers in `[1, 2_147_483_647]` (NFR-DR-S-009).
 * @returns An `AsyncGenerator<StreamingMultipartPart, void, void>` that
 *   yields parts in parser's emit order.
 *
 * @throws {TypeError} `multipart: idleTimeoutMs must be a positive finite
 *   integer in [1, 2_147_483_647]; …` when `idleTimeoutMs` is missing,
 *   non-numeric, non-finite, non-integer, `< 1`, or `> 2^31 - 1`. Same for
 *   `totalTimeoutMs`.
 * @throws {Error} `multipart: response body is null` when `input` is a
 *   `Response` whose `.body` is `null` (FR-004). The first `.next()` rejects.
 * @throws {Error} `multipart: Content-Type header is required to extract
 *   boundary` when the Response has no `Content-Type`.
 * @throws {Error} `multipart: boundary parameter missing from Content-Type`
 *   when `Content-Type` is present but lacks a `boundary=` parameter.
 * @throws {Error} `multipart: boundary option is required when input is a
 *   Readable` when the input is a Node `Readable` and `opts.boundary` is
 *   missing or empty.
 * @throws {MultipartIdleTimeoutError} when no source bytes arrive for
 *   `idleTimeoutMs` consecutive ms (FR-007). The idle timer resets on every
 *   chunk received from the source (FR-DR-A-025).
 * @throws {MultipartTotalTimeoutError} when the total operation wallclock
 *   exceeds `totalTimeoutMs` (FR-008).
 * @throws {MultipartAbortError} when `opts.signal` fires (or is already
 *   aborted at call time — first `.next()` rejects synchronously per FR-009).
 *   `error.reason` is the caller's `signal.reason` verbatim (F-S-006).
 * @throws {MultipartTruncatedError} when the source emits `'end'` before
 *   parser emits `'finish'` (FR-022).
 *
 * @example
 *   for await (const part of parseMultipartRelated(res, {
 *     idleTimeoutMs: 5000,
 *     totalTimeoutMs: 60_000,
 *   })) {
 *     console.log(part.contentType, part.contentId);
 *   }
 */
declare function parseMultipartRelated(input: Response, opts: ParseMultipartOptions): AsyncGenerator<StreamingMultipartPart, void, void>;
declare function parseMultipartRelated(input: Readable, opts: ParseMultipartOptions & {
    boundary: string;
}): AsyncGenerator<StreamingMultipartPart, void, void>;

/**
 * Stream-collection helpers (FR-015 + NFR-DR-S-002).
 *
 * Both helpers drain a Node `Readable` to a single value. They are
 * convenience for small parts (text / binary metadata, manifests) — for
 * larger payloads callers SHOULD pipe directly to a sink instead of
 * buffering.
 *
 * The optional `options.maxBytes` cap (NFR-DR-S-002): when set and the
 * accumulated bytes exceed the cap, the source `Readable` is destroyed and
 * the promise rejects with a clear `Error`. Existing callers that pass only
 * `(readable)` or `(readable, encoding)` see no behavior change.
 *
 * Per kiln/spec/api.md §3 + §4, `streamToBuffer`'s `options` parameter is the
 * second positional arg; `streamToString`'s `options` parameter is the
 * THIRD positional arg (after the legacy `encoding?`). The cap-overflow
 * error is a generic `Error` (NOT a custom class) because these are
 * utilities — the parsing-domain error classes are reserved for
 * `parseMultipartRelated`.
 */

/**
 * Options bag accepted by both {@link streamToString} and
 * {@link streamToBuffer}. Currently exposes only `maxBytes` (NFR-DR-S-002);
 * forward-compat-shaped as an interface so additional cap fields can land
 * without breaking callers.
 */
interface StreamCollectOptions {
    /**
     * Soft cap on accumulated input bytes. When set and the source produces
     * more than this many bytes total, the source `Readable` is destroyed
     * and the promise rejects with a clear `Error`. Omit (default) for no
     * cap. Must be a positive finite integer when set.
     */
    readonly maxBytes?: number | undefined;
}
/**
 * Drain a Node `Readable` to a single string.
 *
 * Calls `Buffer.from(chunk).toString(encoding)` for non-Buffer chunks,
 * defending against object-mode-ish streams that emit strings already.
 *
 * @param readable - Source stream. Must end (rejection on `'error'`).
 * @param encoding - Optional `BufferEncoding` (defaults to `'utf8'`).
 * @param options - Optional {@link StreamCollectOptions}. When
 *   `options.maxBytes` is set and accumulated bytes exceed the cap, the
 *   source is destroyed and the promise rejects (NFR-DR-S-002).
 * @returns A `Promise<string>` resolving to the full decoded contents.
 * @throws Any `'error'` event from `readable` rejects the promise with that
 *   error.
 * @throws {Error} `streamToString: input exceeded maxBytes (<n>)` when
 *   `options.maxBytes` is set and exceeded. The source `readable` is
 *   destroyed before the promise rejects.
 *
 * @example
 *   const text = await streamToString(part.body, 'utf8');
 *   console.log(JSON.parse(text));
 *
 * @example
 *   // With a 1 MiB cap to defend against attacker-controlled part bodies:
 *   const text = await streamToString(part.body, 'utf8', { maxBytes: 1_048_576 });
 */
declare function streamToString(readable: Readable, encoding?: BufferEncoding, options?: StreamCollectOptions): Promise<string>;
/**
 * Drain a Node `Readable` to a single `Buffer`.
 *
 * @param readable - Source stream.
 * @param options - Optional {@link StreamCollectOptions}. When
 *   `options.maxBytes` is set and accumulated bytes exceed the cap, the
 *   source is destroyed and the promise rejects (NFR-DR-S-002).
 * @returns A `Promise<Buffer>`. Zero-byte streams resolve to
 *   `Buffer.alloc(0)`.
 * @throws Any `'error'` event from `readable` rejects the promise.
 * @throws {Error} `streamToBuffer: input exceeded maxBytes (<n>)` when
 *   `options.maxBytes` is set and exceeded. The source `readable` is
 *   destroyed before the promise rejects.
 *
 * @example
 *   const buf = await streamToBuffer(part.body);
 *   await fs.writeFile(`/tmp/${part.contentId ?? 'part'}.bin`, buf);
 *
 * @example
 *   // With a 5 MiB cap to defend against attacker-controlled part bodies:
 *   const buf = await streamToBuffer(part.body, { maxBytes: 5_242_880 });
 */
declare function streamToBuffer(readable: Readable, options?: StreamCollectOptions): Promise<Buffer>;

export { type Logger, MultipartAbortError, type MultipartFetchResult, type MultipartHandlerOptions, MultipartHeadersTooLargeError, MultipartIdleTimeoutError, MultipartPartTooLargeError, MultipartTooManyPartsError, MultipartTotalTimeoutError, MultipartTruncatedError, type ParseMultipartOptions, type PartParser, type ProgressSnapshot, type StreamingMultipartPart, extractBoundary, fetchAndHandleMultipart, parseMultipartRelated, streamToBuffer, streamToString };
