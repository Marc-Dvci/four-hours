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
