# Report preparation coverage

Four Hours exports a **working draft**, not an authority submission file or a
certificate of regulatory completeness. The field list is versioned in
[report-details.ts](../src/core/report-details.ts) and assembled in
[reports.ts](../src/core/reports.ts). Editable fields retain their evidence URL,
source label, observation time and revision history. Missing fields remain visible.

| Preparation area            | Current support                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity and submitting party | Name, LEI format, exact financial entity type, submitting identity, authority contact; conditional aggregated entities and parent undertaking                                                               |
| Initial notification        | Detection, awareness and classification times; description, criteria, affected countries, discovery, origin and continuity activation                                                                       |
| Intermediate report         | Initial receipt reference, occurrence, recovery time, criteria, incident type, operational impact, client financial impact, communications, temporary actions; conditional threat techniques and indicators |
| Final report                | Apparent root cause, resolution and root-cause-addressed timestamps, remediation, cost/loss/recovery detail; collective incident member evidence and conditional resolution-authority information           |
| Reclassification            | Current signed non-major verdict, prior initial receipt and sourced explanation                                                                                                                             |
| GDPR Article 33             | Separate awareness, breach description, contact, categories and approximate numbers of subjects and records, consequences and measures                                                                      |

The general and stage information follows [2025/301 Articles 1–4](https://eur-lex.europa.eu/eli/reg_del/2025/301/oj/eng).
The applicable authority form and [2025/302 Annexes I–II](https://eur-lex.europa.eu/eli/reg_impl/2025/302/oj/eng)
control the actual submission's column definitions, choices, conditional fields,
validation and delivery. Fields marked "where applicable" require an officer's
applicability decision and explanation; a simple missing-field count cannot make
that decision. Financial impact inputs are EUR. The deadline-policy entity class
is distinct from the precise legal entity type recorded in the draft.

An LEI is checked for 20 uppercase alphanumeric characters. Registration status,
checksum, ownership and identifiers in conditional free-text fields require
external validation. Timestamp fields require an explicit timezone; a completed
resolution cannot be in the future. A source URL records provenance without
fetching or authenticating the underlying document.

Report preparation is independent of receipt recording. A receipt records a
submission performed through the authority's own channel. Late initial, first
intermediate, final or GDPR receipts require the operator to record the delay
explanation supplied to the authority. This does not itself notify the authority
under Article 5(3). Intermediate updates also arise on recovery and without undue
delay; the app does not infer recovery or send unattended notifications.

GDPR preparation does not copy the DORA affected-client count into the number of
data subjects. Its 72-hour deadline and receipt are independent of a DORA major
signature. The risk exception and controller's awareness require their own
evidence. Separate data-subject communication and other legal regimes need their
own assessment.
