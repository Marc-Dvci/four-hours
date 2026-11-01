# Jira observation import

Four Hours can read structured incident observations from the Jira issue property
`four-hours-observations`. An existing monitoring or Jira Automation integration can
write the property; Four Hours reads it when the officer chooses **Import Jira
observations**. The adapter is implemented, with domain contract tests. Its live
Jira execution remains part of the Forge release checklist.

Example property value, for a synthetic test issue:

```json
{
  "observedAt": "2026-11-01T10:00:00Z",
  "sourceReference": "Synthetic monitoring assessment 42",
  "values": {
    "criticalFunction": true,
    "affectedClients": 120,
    "totalClients": 1000,
    "downtimeMinutes": 145,
    "economicImpact": 140000,
    "memberStates": ["FR", "DE"]
  }
}
```

Use the current Jira REST API's issue-property endpoint under the integration's
own authorised identity. Do not place credentials in the value. A property can be
visible to people with access to the issue; use aggregate observations and source
references, without customer records or personal identifiers.

The schema in [model.ts](../src/core/model.ts) is the field contract. A batch
contains 1–24 recognised fields. Counts are nonnegative integers; durations and
monetary amounts are nonnegative finite numbers; money is EUR; percentages are
computed from counts and their reference populations. A boolean is `true`,
`false`, or `null`. `null` means unknown. Country codes are uppercase two-letter
codes; classification counts only EU Member States. The observation timestamp
requires a timezone and cannot be in the future.

The importer validates the whole batch before changing the incident. It adds one
revision, the importing actor and a link to the Jira issue. The source reference
is a label, not a verified monitoring-system identity. Non-synthetic imports are
marked attested; integration provenance still needs institutional verification.
An invalid field or value rejects the batch. Missing fields retain their previous
values. A closed DORA incident rejects imports. A fresh classification attestation
is required when signed evidence changes.

The source is structured data. Issue descriptions and property strings do not
instruct the rule engine, select a verdict or choose the authenticated actor.

The standalone replay shows a synthetic-data explanation for this action; it
makes no Jira call. See [setup](setup.md) for officer configuration and permissions.
