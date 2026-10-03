import { Readable, Writable, PassThrough } from 'stream';
import StreamSearch from 'streamsearch';

// src/errors.ts
var MultipartIdleTimeoutError = class extends Error {
  /** Stable cross-format discriminator (NFR-DR-D-007). */
  name = "MultipartIdleTimeoutError";
  /** The configured idle window (ms) that elapsed without source activity. */
  idleTimeoutMs;
  /**
   * @param idleTimeoutMs - The configured idle window in ms.
   * @param options - Optional `{ cause }` for wrapping a lower-level error.
   */
  constructor(idleTimeoutMs, options) {
    super(`multipart: idle timeout (${String(idleTimeoutMs)}ms)`, options);
    this.idleTimeoutMs = idleTimeoutMs;
  }
};
var MultipartTotalTimeoutError = class extends Error {
  name = "MultipartTotalTimeoutError";
  /** The configured total window (ms) that elapsed. */
  totalTimeoutMs;
  /**
   * @param totalTimeoutMs - The configured total budget in ms.
   * @param options - Optional `{ cause }`.
   */
  constructor(totalTimeoutMs, options) {
    super(`multipart: total timeout (${String(totalTimeoutMs)}ms)`, options);
    this.totalTimeoutMs = totalTimeoutMs;
  }
};
var MultipartAbortError = class extends Error {
  name = "MultipartAbortError";
  /**
   * The signal's `reason` if the caller supplied one, else `undefined`. Per
   * F-S-006 the library never synthesizes a reason that embeds server bytes.
   */
  reason;
  /**
   * @param reason - Optional caller-supplied abort reason.
   * @param options - Optional `{ cause }`.
   */
  constructor(reason, options) {
    super("multipart: operation aborted", options);
    if (reason !== void 0) this.reason = reason;
  }
};
var MultipartTruncatedError = class extends Error {
  name = "MultipartTruncatedError";
  /** Total bytes pulled from the source before it ended prematurely. */
  bytesReceived;
  /**
   * @param bytesReceived - Cumulative bytes received before the source ended.
   * @param options - Optional `{ cause }`.
   */
  constructor(bytesReceived, options) {
    super(
      `multipart: stream ended before closing boundary (${String(
        bytesReceived
      )}B received)`,
      options
    );
    this.bytesReceived = bytesReceived;
  }
};
var MultipartPartTooLargeError = class extends Error {
  name = "MultipartPartTooLargeError";
  maxPartBytes;
  partIndex;
  bytesReceived;
  /**
   * @param info - Structured trip info: `{ maxPartBytes, partIndex, bytesReceived }`.
   * @param options - Optional `{ cause }`.
   */
  constructor(info, options) {
    super(
      `multipart: part ${String(info.partIndex)} exceeded maxPartBytes (${String(
        info.maxPartBytes
      )}) at ${String(info.bytesReceived)}B`,
      options
    );
    this.maxPartBytes = info.maxPartBytes;
    this.partIndex = info.partIndex;
    this.bytesReceived = info.bytesReceived;
  }
};
var MultipartHeadersTooLargeError = class extends Error {
  name = "MultipartHeadersTooLargeError";
  limit;
  partIndex;
  cap;
  observed;
  /**
   * @param info - Structured trip info: `{ limit, partIndex, cap, observed }`.
   * @param options - Optional `{ cause }`.
   */
  constructor(info, options) {
    super(
      `multipart: part ${String(info.partIndex)} headers exceeded ${info.limit} cap (${String(
        info.cap
      )}) at ${String(info.observed)}`,
      options
    );
    this.limit = info.limit;
    this.partIndex = info.partIndex;
    this.cap = info.cap;
    this.observed = info.observed;
  }
};
var MultipartTooManyPartsError = class extends Error {
  name = "MultipartTooManyPartsError";
  maxParts;
  observed;
  /**
   * @param info - Structured trip info: `{ maxParts, observed }`.
   * @param options - Optional `{ cause }`.
   */
  constructor(info, options) {
    super(
      `multipart: envelope exceeded maxParts (${String(info.maxParts)}) at part ${String(
        info.observed
      )}`,
      options
    );
    this.maxParts = info.maxParts;
    this.observed = info.observed;
  }
};

// src/internal/format-error-embed.ts
var FORMAT_ERROR_EMBED_LIMIT = 120;
var ELLIPSIS = "\u2026";
var REDACTION_TOKEN = "[redacted-control]";
var ANSI_ESCAPE_RE = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
var CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;
function redactControlAndAnsi(s) {
  return s.replace(ANSI_ESCAPE_RE, REDACTION_TOKEN).replace(CONTROL_CHARS_RE, REDACTION_TOKEN);
}
function truncateForErrorEmbed(value) {
  const s = typeof value === "string" ? value : String(value);
  const redacted = redactControlAndAnsi(s);
  const stringified = JSON.stringify(redacted);
  if (stringified.length > FORMAT_ERROR_EMBED_LIMIT) {
    return stringified.slice(0, FORMAT_ERROR_EMBED_LIMIT) + ELLIPSIS;
  }
  return stringified;
}
function summarizeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: truncateForErrorEmbed(err.message)
    };
  }
  return {
    name: "Error",
    message: truncateForErrorEmbed(err)
  };
}

// src/extract-boundary.ts
function extractBoundary(contentTypeHeader) {
  if (contentTypeHeader == null || contentTypeHeader === "") {
    throw new Error(
      "multipart: Content-Type header is required to extract boundary"
    );
  }
  const header = contentTypeHeader;
  const len = header.length;
  let i = 0;
  while (i < len && header.charCodeAt(i) !== 59) i++;
  while (i < len) {
    while (i < len) {
      const c = header.charCodeAt(i);
      if (c === 59 || c === 32 || c === 9) {
        i++;
        continue;
      }
      break;
    }
    if (i >= len) break;
    const nameStart = i;
    while (i < len) {
      const c = header.charCodeAt(i);
      if (c === 61 || c === 59) break;
      if (c === 32 || c === 9) break;
      i++;
    }
    const name = header.slice(nameStart, i).toLowerCase();
    while (i < len) {
      const c = header.charCodeAt(i);
      if (c === 32 || c === 9) {
        i++;
        continue;
      }
      break;
    }
    if (i >= len || header.charCodeAt(i) !== 61) {
      while (i < len && header.charCodeAt(i) !== 59) i++;
      continue;
    }
    i++;
    while (i < len) {
      const c = header.charCodeAt(i);
      if (c === 32 || c === 9) {
        i++;
        continue;
      }
      break;
    }
    let value = "";
    if (i < len && header.charCodeAt(i) === 34) {
      i++;
      const buf = [];
      while (i < len) {
        const c = header.charCodeAt(i);
        if (c === 92 && i + 1 < len) {
          buf.push(header.charAt(i + 1));
          i += 2;
          continue;
        }
        if (c === 34) {
          i++;
          break;
        }
        buf.push(header.charAt(i));
        i++;
      }
      value = buf.join("");
    } else {
      const valStart = i;
      while (i < len) {
        const c = header.charCodeAt(i);
        if (c === 59 || c === 32 || c === 9) break;
        i++;
      }
      value = header.slice(valStart, i);
    }
    if (name === "boundary") {
      if (value === "") {
        throw new Error(
          `multipart: boundary parameter is empty in Content-Type: ${truncateForErrorEmbed(
            header
          )}`
        );
      }
      return value;
    }
    while (i < len && header.charCodeAt(i) !== 59) i++;
  }
  throw new Error(
    `multipart: boundary parameter missing from Content-Type: ${truncateForErrorEmbed(
      header
    )}`
  );
}

// src/internal/default-logger.ts
var defaultLogger = (event) => {
  if (event.meta === void 0) {
    console.warn(event.msg);
    return;
  }
  console.warn(event.msg, event.meta);
};

// src/internal/validate-timeout.ts
var MAX_SAFE_TIMEOUT_MS = 2147483647;
function validatePositiveTimeout(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > MAX_SAFE_TIMEOUT_MS) {
    const observed = typeof value === "number" ? String(value) : typeof value;
    throw new TypeError(
      `multipart: ${name} must be a positive finite integer in [1, 2_147_483_647]; got ${observed}. Note: Node's setTimeout clamps values above 2^31-1 to 1ms, so larger timeouts are silently broken.`
    );
  }
}

// src/internal/flatten-headers.ts
function flattenHeaderValue(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  if (Array.isArray(v)) {
    const parts = [];
    for (const inner of v) {
      const flat = flattenHeaderValue(inner);
      if (flat !== "") parts.push(flat);
    }
    return parts.join(", ");
  }
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  return "";
}
function flattenPartHeaders(raw) {
  if (raw == null) return {};
  const out = {};
  for (const key of Object.keys(raw)) {
    const lower = key.toLowerCase();
    const value = flattenHeaderValue(raw[key]);
    out[lower] = value;
  }
  return out;
}
var HEADER_END = Buffer.from("\r\n\r\n");
var INITIAL_CRLF = Buffer.from("\r\n");
var CLOSING_DASHES = Buffer.from("--");
var CLOSING_CR = Buffer.from("--\r");
var MAX_HEADER_BYTES = 80 * 1024;
var MAX_HEADER_PAIRS = 2e3;
var MultipartPartStream = class extends Readable {
  constructor(onRead) {
    super();
    this.onRead = onRead;
  }
  onRead;
  _read() {
    this.onRead();
  }
};
function parseHeaders(block) {
  const headers = /* @__PURE__ */ Object.create(null);
  if (block.length === 0) return headers;
  const lines = block.toString("latin1").split("\r\n");
  let previousName;
  let count = 0;
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("	")) {
      if (previousName === void 0) {
        throw new Error("Unexpected folded header value");
      }
      const values = headers[previousName];
      if (values === void 0) throw new Error("Malformed part header");
      values[values.length - 1] += line;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) throw new Error("Malformed part header");
    const name = line.slice(0, colon);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      throw new Error("Malformed part header");
    }
    const value = line.slice(colon + 1).replace(/^[ \t]/, "");
    if (/[\x00-\x08\x0a-\x1f\x7f]/.test(value)) {
      throw new Error("Malformed part header");
    }
    const key = name.toLowerCase();
    (headers[key] ??= []).push(value);
    previousName = key;
    if (++count > MAX_HEADER_PAIRS) throw new Error("Too many part headers");
  }
  return headers;
}
var MultipartParser = class extends Writable {
  needle;
  search;
  state = "preamble";
  part;
  headerBytes = Buffer.alloc(0);
  suffix = Buffer.alloc(0);
  candidate = false;
  pausedPart;
  pendingWrite;
  openParts = 0;
  finalCallback;
  constructor(boundary) {
    super();
    if (boundary.length === 0) throw new TypeError("Boundary required");
    this.needle = Buffer.from(`\r
--${boundary}`);
    this.search = new StreamSearch(this.needle, (matched, data, start, end, safe) => {
      if (this.state !== "done" && data && start < end) {
        const chunk = data.subarray(start, end);
        this.consume(safe ? chunk : Buffer.from(chunk));
      }
      if (this.state === "done") return;
      if (matched) {
        if (this.state === "headers") throw new Error("Malformed part header");
        this.candidate = true;
      }
    });
    this.search.push(INITIAL_CRLF);
  }
  _write(chunk, _encoding, callback) {
    try {
      this.search.push(chunk);
      if (this.pausedPart) this.pendingWrite = callback;
      else callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
  _final(callback) {
    try {
      this.search.destroy();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (this.candidate && this.suffix.equals(CLOSING_DASHES)) {
      this.candidate = false;
      this.endPart();
      this.state = "done";
    }
    if (this.state !== "done") {
      const error = new Error("Unexpected end of multipart data");
      this.endPart();
      callback(error);
      return;
    }
    if (this.openParts === 0) callback();
    else this.finalCallback = callback;
  }
  resumeWrite(part) {
    if (this.pausedPart !== part) return;
    this.pausedPart = void 0;
    const callback = this.pendingWrite;
    this.pendingWrite = void 0;
    callback?.();
  }
  endPart() {
    const part = this.part;
    if (part === void 0) return;
    this.part = void 0;
    part.push(null);
  }
  beginPart() {
    this.headerBytes = Buffer.alloc(0);
    this.state = "headers";
    const part = new MultipartPartStream(() => this.resumeWrite(part));
    this.part = part;
    this.openParts++;
    let settled = false;
    const onPartDone = () => {
      if (settled) return;
      settled = true;
      this.openParts--;
      this.resumeWrite(part);
      if (this.openParts === 0 && this.finalCallback) {
        const callback = this.finalCallback;
        this.finalCallback = void 0;
        callback();
      }
    };
    part.once("end", onPartDone);
    part.once("close", onPartDone);
    this.emit("part", part);
  }
  consume(data) {
    if (this.candidate) {
      if (this.suffix.length < 2) {
        const taken = Math.min(2 - this.suffix.length, data.length);
        this.suffix = Buffer.concat([this.suffix, data.subarray(0, taken)]);
        data = data.subarray(taken);
      }
      if (this.suffix.length < 2) return;
      if (this.suffix.equals(CLOSING_DASHES)) {
        if (data.length === 0) return;
        if (data[0] === 13) {
          this.suffix = CLOSING_CR;
          data = data.subarray(1);
          if (data.length === 0) return;
        }
      }
      if (this.suffix.equals(CLOSING_CR) && data.length === 0) return;
      const suffix = this.suffix;
      this.suffix = Buffer.alloc(0);
      this.candidate = false;
      if (suffix.equals(INITIAL_CRLF)) {
        this.endPart();
        this.beginPart();
      } else if (suffix.equals(CLOSING_CR) && data[0] === 10) {
        data = data.subarray(1);
        this.endPart();
        this.state = "done";
        return;
      } else if (this.state === "headers") {
        data = Buffer.concat([this.needle, suffix, data]);
      } else if (this.state === "body") {
        this.consumeBody(this.needle);
        this.consumeBody(suffix);
      }
    }
    if (this.state === "headers") {
      const pending = this.headerBytes.length;
      const scan = data.subarray(0, MAX_HEADER_BYTES + HEADER_END.length - pending);
      const combined = Buffer.concat([this.headerBytes, scan]);
      const empty = combined.length >= 2 && combined.subarray(0, 2).equals(INITIAL_CRLF);
      const end = empty ? 0 : combined.indexOf(HEADER_END);
      if (end < 0) {
        if (combined.length > MAX_HEADER_BYTES) throw new Error("Part headers too large");
        this.headerBytes = combined;
        return;
      }
      if (end > MAX_HEADER_BYTES) throw new Error("Part headers too large");
      const headers = parseHeaders(combined.subarray(0, end));
      const rawHeaders = Buffer.from(combined.subarray(0, end + (empty ? 2 : HEADER_END.length)));
      this.headerBytes = Buffer.alloc(0);
      this.state = "body";
      this.part?.emit("header", headers, rawHeaders);
      this.consumeBody(data.subarray(end + (empty ? 2 : HEADER_END.length) - pending));
    } else if (this.state === "body") {
      this.consumeBody(data);
    }
  }
  consumeBody(data) {
    if (data.length > 0 && this.part && !this.part.destroyed && !this.part.push(data)) {
      this.pausedPart = this.part;
    }
  }
};
function looksLikeResponse(input) {
  if (typeof Response !== "undefined" && input instanceof Response) {
    return true;
  }
  if (input == null || typeof input !== "object") return false;
  const candidate = input;
  return typeof candidate.headers === "object" && candidate.headers !== null && typeof candidate.headers.get === "function" && "body" in candidate;
}
function looksLikeReadable(input) {
  if (input == null || typeof input !== "object") return false;
  const candidate = input;
  return typeof candidate.pipe === "function" && typeof candidate.on === "function";
}
function normalizeInput(input, opts) {
  if (looksLikeResponse(input)) {
    if (input.body == null) {
      throw new Error("multipart: response body is null");
    }
    const contentType = input.headers.get("content-type");
    const boundary = extractBoundary(contentType);
    const webBody = input.body;
    const readable = Readable.fromWeb(webBody);
    return { kind: "response", readable, boundary };
  }
  if (looksLikeReadable(input)) {
    if (typeof opts.boundary !== "string" || opts.boundary === "") {
      throw new Error(
        "multipart: boundary option is required when input is a Readable"
      );
    }
    return { kind: "readable", readable: input, boundary: opts.boundary };
  }
  throw new Error(
    "multipart: input must be a Response or a Node Readable"
  );
}

// src/internal/queue-notifier.ts
function createQueueNotifier() {
  const items = [];
  let waiter = null;
  let ended = false;
  const push = (item) => {
    if (ended && item.type !== "end" && item.type !== "error") {
      return;
    }
    if (item.type === "end") {
      if (ended) return;
      ended = true;
    }
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(item);
      return;
    }
    items.push(item);
  };
  const signalEnd = () => {
    push({ type: "end" });
  };
  const signalError = (err) => {
    push({ type: "error", err });
  };
  const next = () => {
    const buffered = items.shift();
    if (buffered !== void 0) {
      return Promise.resolve(buffered);
    }
    return new Promise((resolve) => {
      waiter = resolve;
    });
  };
  const drainPendingParts = () => {
    const parts = [];
    const remaining = [];
    for (const item of items) {
      if (item.type === "part") {
        parts.push(item.part);
      } else {
        remaining.push(item);
      }
    }
    items.length = 0;
    items.push(...remaining);
    return parts;
  };
  return {
    push,
    signalEnd,
    signalError,
    next,
    get pending() {
      return items;
    },
    drainPendingParts
  };
}

// src/internal/timers.ts
function setupTimers(opts, startMs) {
  const controller = new AbortController();
  const callerSignal = opts.signal;
  let storedError;
  let cleaned = false;
  let idleTimer;
  let totalTimer;
  const abortInternally = (err) => {
    if (controller.signal.aborted) return;
    storedError = err;
    controller.abort(err);
    runCleanup();
  };
  const onCallerAbort = () => {
    abortInternally(new MultipartAbortError(callerSignal?.reason));
  };
  const onIdle = () => {
    abortInternally(new MultipartIdleTimeoutError(opts.idleTimeoutMs));
  };
  const onTotal = () => {
    abortInternally(new MultipartTotalTimeoutError(opts.totalTimeoutMs));
  };
  function runCleanup() {
    if (cleaned) return;
    cleaned = true;
    if (idleTimer !== void 0) {
      clearTimeout(idleTimer);
      idleTimer = void 0;
    }
    if (totalTimer !== void 0) {
      clearTimeout(totalTimer);
      totalTimer = void 0;
    }
    if (callerSignal !== void 0) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
  const resetIdle = () => {
    if (cleaned || controller.signal.aborted) return;
    if (idleTimer !== void 0) clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, opts.idleTimeoutMs);
  };
  if (callerSignal?.aborted) {
    storedError = new MultipartAbortError(callerSignal.reason);
    controller.abort(storedError);
  } else {
    if (callerSignal !== void 0) {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
    idleTimer = setTimeout(onIdle, opts.idleTimeoutMs);
    totalTimer = setTimeout(onTotal, opts.totalTimeoutMs);
  }
  return {
    signal: controller.signal,
    resetIdle,
    cleanup: runCleanup,
    abortError: () => storedError
  };
}

// src/parse-multipart-related.ts
function parseMultipartRelated(input, opts) {
  return parseMultipartRelatedImpl(input, opts);
}
async function* parseMultipartRelatedImpl(input, opts) {
  validatePositiveTimeout("idleTimeoutMs", opts.idleTimeoutMs);
  validatePositiveTimeout("totalTimeoutMs", opts.totalTimeoutMs);
  const maxPartBytes = opts.maxPartBytes;
  const maxParts = opts.maxParts ?? 1e4;
  const maxHeadersPerPart = opts.maxHeadersPerPart ?? 100;
  const maxHeaderBytesPerPart = opts.maxHeaderBytesPerPart ?? 16384;
  const { readable: source, boundary } = normalizeInput(input, {
    boundary: opts.boundary
  });
  const logger = opts.logger ?? defaultLogger;
  const parser = new MultipartParser(boundary);
  const queue = createQueueNotifier();
  let bytesReceived = 0;
  let nextPartIndex = 0;
  let parserFinished = false;
  let cleaned = false;
  let abortPushed = false;
  const allPartStreams = /* @__PURE__ */ new Set();
  const startMs = Date.now();
  const timers = setupTimers(
    {
      idleTimeoutMs: opts.idleTimeoutMs,
      totalTimeoutMs: opts.totalTimeoutMs,
      ...opts.signal !== void 0 ? { signal: opts.signal } : {}
    });
  if (timers.signal.aborted) {
    const abortErr = timers.abortError() ?? new MultipartAbortError(opts.signal?.reason);
    queue.signalError(abortErr);
    abortPushed = true;
  }
  const onCombinedAbort = () => {
    if (cleaned || abortPushed) return;
    abortPushed = true;
    const abortErr = timers.abortError() ?? new MultipartAbortError(opts.signal?.reason);
    queue.signalError(abortErr);
  };
  if (!timers.signal.aborted) {
    timers.signal.addEventListener("abort", onCombinedAbort, { once: true });
  }
  const fireProgress = () => {
    const callback = opts.onProgress;
    if (callback === void 0) return;
    const elapsedMs = Date.now() - startMs;
    const rateBps = elapsedMs <= 0 ? 0 : Math.round(bytesReceived * 1e3 / elapsedMs);
    try {
      callback({ bytes: bytesReceived, elapsedMs, rateBps });
    } catch (err) {
      logger({
        level: "warn",
        msg: "multipart: onProgress threw",
        meta: { errSummary: summarizeError(err) }
      });
    }
  };
  let partsObserved = 0;
  const onPart = (partStream) => {
    allPartStreams.add(partStream);
    const partIndex = nextPartIndex++;
    partsObserved += 1;
    if (partsObserved > maxParts) {
      if (!partStream.destroyed) partStream.destroy();
      queue.signalError(
        new MultipartTooManyPartsError({
          maxParts,
          observed: partsObserved
        })
      );
      return;
    }
    const headersAccumulator = {
      value: {}
    };
    const onHeader = (raw, rawHeaderBlock) => {
      const bag = raw;
      let headerCount = 0;
      if (bag !== void 0) {
        for (const values of Object.values(bag)) headerCount += values.length;
      }
      const headerBytes = rawHeaderBlock.length;
      if (headerCount > maxHeadersPerPart) {
        if (!partStream.destroyed) partStream.destroy();
        queue.signalError(
          new MultipartHeadersTooLargeError({
            limit: "count",
            partIndex,
            cap: maxHeadersPerPart,
            observed: headerCount
          })
        );
        return;
      }
      if (headerBytes > maxHeaderBytesPerPart) {
        if (!partStream.destroyed) partStream.destroy();
        queue.signalError(
          new MultipartHeadersTooLargeError({
            limit: "bytes",
            partIndex,
            cap: maxHeaderBytesPerPart,
            observed: headerBytes
          })
        );
        return;
      }
      headersAccumulator.value = flattenPartHeaders(
        raw
      );
      const headers = headersAccumulator.value;
      const contentType = headers["content-type"] ?? "";
      const contentId = headers["content-id"];
      const contentLengthRaw = headers["content-length"];
      const parsedLen = contentLengthRaw !== void 0 ? Number.parseInt(contentLengthRaw, 10) : Number.NaN;
      const contentLength = Number.isFinite(parsedLen) ? parsedLen : void 0;
      let publicBody = partStream;
      if (maxPartBytes !== void 0) {
        const cap = maxPartBytes;
        let partBytesAccumulated = 0;
        let tripped = false;
        const counter = new PassThrough();
        allPartStreams.add(counter);
        const onUpstreamData = (chunk) => {
          if (tripped) return;
          partBytesAccumulated += chunk.length;
          if (partBytesAccumulated > cap) {
            tripped = true;
            if (!partStream.destroyed) partStream.destroy();
            queue.signalError(
              new MultipartPartTooLargeError({
                maxPartBytes: cap,
                partIndex,
                bytesReceived: partBytesAccumulated
              })
            );
            if (!counter.writableEnded) counter.end();
            return;
          }
          if (counter.writable && !counter.writableEnded) {
            counter.write(chunk);
          }
        };
        const onUpstreamEnd = () => {
          if (tripped) return;
          if (!counter.writableEnded) counter.end();
        };
        const onUpstreamError = (err) => {
          if (!counter.destroyed) counter.destroy(err);
        };
        partStream.on("data", onUpstreamData);
        partStream.on("end", onUpstreamEnd);
        partStream.on("error", onUpstreamError);
        publicBody = counter;
      }
      const part = {
        index: partIndex,
        boundary,
        headers,
        rawHeaders: rawHeaderBlock,
        contentType,
        ...contentId !== void 0 ? { contentId } : {},
        ...contentLength !== void 0 ? { contentLength } : {},
        // When maxPartBytes is configured, body is the PassThrough that
        // wraps parser's per-part Readable; otherwise body is parser's
        // per-part Readable directly. Both expose Node `Readable`.
        body: publicBody
      };
      queue.push({ type: "part", part });
      fireProgress();
    };
    partStream.once("header", onHeader);
    partStream.on("error", (err) => {
      if (cleaned) {
        logger({
          level: "warn",
          msg: "multipart: late part-stream error after generator close",
          meta: { errSummary: summarizeError(err) }
        });
        return;
      }
      queue.signalError(err);
    });
  };
  const onFinish = () => {
    parserFinished = true;
    queue.signalEnd();
  };
  const onParserError = (err) => {
    if (cleaned) {
      logger({
        level: "warn",
        msg: "multipart: late parser error after generator close",
        meta: { errSummary: summarizeError(err) }
      });
      return;
    }
    queue.signalError(err);
  };
  const onSourceData = (chunk) => {
    bytesReceived += chunk.length;
    timers.resetIdle();
  };
  const onSourceError = (err) => {
    queue.signalError(err);
  };
  const onSourceEnd = () => {
    // MediQ PACS-001-DEC-015: a backpressured parser may finish after source EOF.
    // Its _final validates the closing boundary and waits for part consumption;
    // onParserError/onSourceError and idle/total deadlines still fail closed.
    // Do not guess truncation from a one-event-loop-turn finish deadline.
  };
  parser.on("part", onPart);
  parser.on("finish", onFinish);
  parser.on("error", onParserError);
  source.on("data", onSourceData);
  source.on("error", onSourceError);
  source.on("end", onSourceEnd);
  source.pipe(parser);
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    source.off("data", onSourceData);
    source.off("error", onSourceError);
    source.off("end", onSourceEnd);
    try {
      source.unpipe(parser);
    } catch (err) {
      logger({
        level: "warn",
        msg: "multipart: unpipe failed during cleanup",
        meta: { errSummary: summarizeError(err) }
      });
    }
    if (!source.destroyed) {
      source.destroy();
    }
    for (const part of queue.drainPendingParts()) {
      part.body.destroy();
    }
    for (const partStream of allPartStreams) {
      if (!partStream.destroyed) partStream.destroy();
    }
    allPartStreams.clear();
    parser.off("part", onPart);
    parser.off("finish", onFinish);
    timers.signal.removeEventListener("abort", onCombinedAbort);
    timers.cleanup();
  };
  try {
    while (true) {
      const item = await queue.next();
      if (item.type === "end") return;
      if (item.type === "error") throw item.err;
      yield item.part;
    }
  } finally {
    cleanup();
  }
}

// src/fetch-and-handle-multipart.ts
async function fetchAndHandleMultipart(url, options) {
  if (typeof options.parser !== "function") {
    throw new TypeError("multipart: options.parser is required");
  }
  validatePositiveTimeout("idleTimeoutMs", options.idleTimeoutMs);
  validatePositiveTimeout("totalTimeoutMs", options.totalTimeoutMs);
  if (options.fetchInit !== void 0 && "signal" in options.fetchInit && options.fetchInit.signal !== void 0) {
    throw new Error(
      "multipart: pass signal via options.signal \u2014 fetchInit.signal is reserved for internal use"
    );
  }
  if (options.signal?.aborted === true) {
    throw new MultipartAbortError(options.signal.reason);
  }
  const logger = options.logger ?? defaultLogger;
  const startMs = Date.now();
  let lastBytes = 0;
  const onProgressForLayerA = (snap) => {
    lastBytes = snap.bytes;
    if (options.onProgress !== void 0) {
      options.onProgress(snap);
    }
  };
  let res;
  try {
    const init = {
      ...options.fetchInit ?? {},
      ...options.signal !== void 0 ? { signal: options.signal } : {}
    };
    res = await fetch(url, init);
  } catch (err) {
    const sig = options.signal;
    if (sig?.aborted) {
      throw new MultipartAbortError(sig.reason);
    }
    throw err;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/related")) {
    throw new Error(
      `multipart: response Content-Type is not multipart/related; got ${truncateForErrorEmbed(contentType)}`
    );
  }
  const status = res.status;
  const headers = res.headers;
  const parseOpts = {
    idleTimeoutMs: options.idleTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
    onProgress: onProgressForLayerA,
    ...options.signal !== void 0 ? { signal: options.signal } : {},
    ...options.logger !== void 0 ? { logger: options.logger } : {},
    ...options.maxPartBytes !== void 0 ? { maxPartBytes: options.maxPartBytes } : {},
    ...options.maxParts !== void 0 ? { maxParts: options.maxParts } : {},
    ...options.maxHeadersPerPart !== void 0 ? { maxHeadersPerPart: options.maxHeadersPerPart } : {},
    ...options.maxHeaderBytesPerPart !== void 0 ? { maxHeaderBytesPerPart: options.maxHeaderBytesPerPart } : {}
  };
  const parts = [];
  for await (const part of parseMultipartRelated(res, parseOpts)) {
    const value = await invokeParser(options.parser, part);
    if (value !== void 0) {
      parts.push(value);
    }
    if (!part.body.destroyed && part.body.readable) {
      for await (const _chunk of part.body) {
      }
    }
  }
  const elapsedMs = Date.now() - startMs;
  if (options.onProgress !== void 0) {
    const rateBps = elapsedMs <= 0 ? 0 : Math.round(lastBytes * 1e3 / elapsedMs);
    try {
      options.onProgress({ bytes: lastBytes, elapsedMs, rateBps });
    } catch (err) {
      logger({
        level: "warn",
        msg: "multipart: onProgress threw on completion tick",
        meta: { errSummary: summarizeError(err) }
      });
    }
  }
  return { parts, bytes: lastBytes, elapsedMs, status, headers };
}
async function invokeParser(parser, part) {
  return parser(part);
}

// src/stream-helpers.ts
function streamToString(readable, encoding = "utf8", options = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const cap = options.maxBytes;
    const onData = (chunk) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk;
      total += buf.length;
      if (cap !== void 0 && total > cap) {
        cleanup();
        readable.destroy();
        reject(
          new Error(`streamToString: input exceeded maxBytes (${String(cap)})`)
        );
        return;
      }
      chunks.push(buf);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString(encoding));
    };
    const cleanup = () => {
      readable.off("data", onData);
      readable.off("error", onError);
      readable.off("end", onEnd);
    };
    readable.on("data", onData);
    readable.once("error", onError);
    readable.once("end", onEnd);
  });
}
function streamToBuffer(readable, options = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const cap = options.maxBytes;
    const onData = (chunk) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (cap !== void 0 && total > cap) {
        cleanup();
        readable.destroy();
        reject(
          new Error(`streamToBuffer: input exceeded maxBytes (${String(cap)})`)
        );
        return;
      }
      chunks.push(buf);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      resolve(chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks));
    };
    const cleanup = () => {
      readable.off("data", onData);
      readable.off("error", onError);
      readable.off("end", onEnd);
    };
    readable.on("data", onData);
    readable.once("error", onError);
    readable.once("end", onEnd);
  });
}

export { MultipartAbortError, MultipartHeadersTooLargeError, MultipartIdleTimeoutError, MultipartPartTooLargeError, MultipartTooManyPartsError, MultipartTotalTimeoutError, MultipartTruncatedError, extractBoundary, fetchAndHandleMultipart, parseMultipartRelated, streamToBuffer, streamToString };
