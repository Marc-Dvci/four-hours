# Classification evaluation

38/38 labelled cases correct.

Rows are labels; columns are predictions.

| Label | MAJOR | NOT_MAJOR | INCOMPLETE |
|---|---:|---:|---:|
| MAJOR | 17 | 0 | 0 |
| NOT_MAJOR | 0 | 17 | 0 |
| INCOMPLETE | 0 | 0 | 4 |

Reproduce: `npm run eval`.

Labelled legal-boundary cases, written before the rules.

## Independent logical conformance

Run `npm run eval:oracle` for 6,561 three-valued combinations checked against an independently implemented truth-completion oracle. See [logical-conformance.json](logical-conformance.json) for counts, scope, runtime and local classification latency.
