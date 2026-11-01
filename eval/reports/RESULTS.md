# Classification evaluation

38/38 labelled synthetic cases correct.

Rows are labels; columns are predictions.

| Label | MAJOR | NOT_MAJOR | INCOMPLETE |
|---|---:|---:|---:|
| MAJOR | 17 | 0 | 0 |
| NOT_MAJOR | 0 | 17 | 0 |
| INCOMPLETE | 0 | 0 | 4 |

Reproduce: `npm run eval`.

Labelled synthetic legal-boundary cases; no production accuracy claim.

## Independent logical conformance

Run `npm run eval:oracle` for 6,561 three-valued combinations checked against an independently implemented truth-completion oracle. See [logical-conformance.json](logical-conformance.json) for counts, scope, runtime and local classification latency. This is logical conformance conditional on the encoded legal interpretation, not a blind study or independent legal certification.
