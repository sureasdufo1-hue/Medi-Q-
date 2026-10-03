# Pinned multipart-stream EOF correction

This private, ESM-only package is derived from the installed MIT-licensed
`@ubercode/multipart-stream@1.1.0` distribution, not an upstream release.
The API workspace uses `1.1.0-mediq.1` via a repository-local file dependency.
`streamsearch` remains pinned to `1.1.0`; no new registry dependency is added.

Upstream: https://github.com/MichaelLeeHobbs/multipart-stream

Original installed file SHA-256 (before newline normalization):

| File | SHA-256 |
|---|---|
| `dist/index.js` | `b5fbdc0cf6a1ae6a813bd57edbea9e59d9df2828ec96922e56596f2bbe6b66da` |
| `dist/index.d.ts` | `24ef355ba9019c5af1ac0ccf8aa6b8337aec97b62550f7968fc3730e547e6fe5` |

`index.js` and `index.d.ts` are copied to the package root; the upstream MIT
license is retained in LICENSE. Newlines are normalized to LF. Upstream source
maps and the unused CommonJS build are not included. The only executable source
change is the `onSourceEnd` callback documented by `PACS-001-DEC-015`.
The dangling upstream source-map directive is removed; it is not executable.
The normalized patched ESM SHA-256 is
`3574331e86ab1cde0a4def60895b212e5edb7b345f7cab03990ebe8b560b5c5d`.
The provenance test pins this source, unchanged declarations/license, API/lockfile
resolution and both Docker-stage vendor inputs; it is not a whole-library audit.

The original callback declared a truncated response whenever the parser had not
finished one event-loop turn after HTTP EOF. Slow, backpressured consumers make
that assumption false. The local callback does not issue that premature verdict.
Parser `_final` still rejects a missing closing boundary and waits for all parts
to drain; parser/source errors, idle/total timeouts, cancellation, header limits,
part counts and final cleanup are unchanged. This is not a generic suppression
of truncated-body errors. The adapter enforces its own unchanged 64 MiB cap and
does not use the upstream optional counter that ignores write backpressure.

Validation: `tests/api/orthanc-dicomweb-concurrency.test.mjs` includes the
pre-patch failing slow-valid-body case and a slow-truncated-body rejection case;
the existing adapter suite checks malformed MIME, media types, limits and errors.
`tests/performance/temporary-imaging-maximum-study.test.mjs` exercises the actual
multipart adapter through encryption and authenticated consumption at 2 GiB.
See `docs/implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md` §26 for actual results.

Maintenance: do not edit installed node_modules. Review any upstream replacement
against this patch and all regressions, update provenance/lockfile and validate
both build and runtime image resolution before removing this local package.
