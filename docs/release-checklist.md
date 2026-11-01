# Target-platform release evidence

The [Codegeist rules](https://codegeist2026.devpost.com/rules) require an
installable Forge app and an installation link that works in the judge's test
environment. A standalone replay does not satisfy that requirement. The deadline
is 22 December 2026 at 12:00 PST (21:00 Paris). Judges need not watch past three
minutes of the public YouTube demonstration.

The following evidence is still required. The local zero-spend deployment gate
remains unverified; do not run metered deployment until actual provider billing
protection is established. See [cost controls](COSTS.md).

| Gate                     | Evidence to record                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Billing-safe destination | Provider confirmation of an eligible exempt sandbox or enforced hard zero cap, its scope and expiry; ordinary free allowance is insufficient                           |
| Registration and install | Real app UUID, manifest validation, successful Jira install and production distribution link                                                                           |
| Judge onboarding         | Fresh test site installation; choose a project; create the five synthetic issues; configure officers; follow the end-to-end instructions                               |
| Permissions              | Reader sees only readable issues and cannot edit; editor cannot impersonate an officer; configured officer/project admin can sign; bound panel rejects other incidents |
| Concurrent edits         | Two user sessions edit the same version; exactly one conditional save succeeds                                                                                         |
| Jira observations        | Seed the documented issue property, import once, confirm sourced facts and invalid-batch refusal                                                                       |
| Reporting and closure    | Backdated attestation, initial receipt, intermediate update, final and reclassification paths; separate GDPR receipt; compare deadlines and exports                    |
| Graph bonus              | Connection, two accepted synthetic technical objects, read-back fact, explicit missing-mapping refusal, disconnect cleanup; capture counts and timings                 |
| Confluence               | Current-user publication to an allowed space; refusal in a forbidden space; inspect readable escaping and source links                                                 |
| Agents/MCP bonus         | Actual Rovo entitlement, tool exposure, authenticated evidence and recurrence calls; no signing or receipt-writing tool                                                |
| Runtime quality          | Cold/warm timings, Jira 403/404/429/503 behaviour, storage failure, narrow iframe and supported browsers; no fabricated production throughput                          |
| Film and assets          | Public YouTube URL under five minutes, complete core story within three minutes, actual Forge footage, captions, final cover and sponsor-surface image                 |

Record each run's date, environment, account role, input, expected result, observed
result, duration and screenshot or log reference. Scrub tokens, customer data and
personal information before publishing evidence. The existing synthetic browser
and domain results remain separate from these platform measurements.

Production readiness additionally requires officer-led legal/form validation,
data retention and backup policy, full conditional form mapping, notification
delivery, real-user evaluation and larger-population/load tests. The prototype
scans only accessible Four Hours records, with bounded API concurrency and a
population size guard. It cannot establish an institution-wide absence of
recurring incidents. Demo/collective Jira creation uses retry markers but is not
an atomic transaction spanning Jira and Forge storage; test crash recovery and
simultaneous creation before operational rollout.
