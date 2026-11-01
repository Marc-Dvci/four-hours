# Evidence retention and independent verification

**Evidence bundle** downloads an incident's full revision payloads, current state,
officer attestations, source references, report fields and authority receipts as
`four-hours.evidence.v1` JSON. The export includes a SHA-256 digest of the bundle.
The browser displays that digest after download.

Retain the digest separately in an organisation-controlled record. An example is
an access-controlled evidence register with its own audit history. Retaining the
bundle and its digest in the same editable folder does not establish an external
anchor.

Verify the file with Node, without installing project dependencies:

```sh
node scripts/verify-bundle.mjs four-hours-fh-482-evidence.json RETAINED_SHA256
# Equivalent after npm ci:
npm run verify:bundle -- four-hours-fh-482-evidence.json RETAINED_SHA256
```

Exit code zero means the retained bundle digest, revision links and projected
current record agree. A mismatch returns a nonzero code. Omit the final argument
to check internal consistency only. The verifier uses Node's built-in crypto API
and its own canonicalisation implementation; it does not import the app's ledger.

The verifier checks that the current evidence follows the recorded events, the
latest signature matches its recorded snapshot, and receipts, report details and
collective member records agree with their history. Tests exercise both the
separate verifier and a deliberately wrong retained digest.

## What the hashes establish

Hashes establish consistency with the retained evidence. They are not qualified
electronic signatures, a trusted timestamp service or proof that a source figure
is true. A person able to replace the entire history and its only retained digest
can produce a new consistent history. The public replay's actor is explicitly a
demo identity. Forge supplies the authenticated account ID, but its live
permission and attribution checks still require target-platform verification.

The UI consequently says **CHAIN CONSISTENT**. The separate Markdown workpaper
is a readable review document; use the JSON bundle for independent verification.

## Retention boundary

Final or reclassification receipts close DORA evidence changes. GDPR report
preparation fields and its separate receipt remain available. Newly discovered
classification evidence after closure needs a linked follow-up incident and the
institution's correction procedure. Four Hours does not delete or archive stored
revisions automatically. A record approaching the conservative Forge storage
size guard requires a retained bundle and linked follow-up record. Exporting alone
does not free storage.

The installing organisation must establish retention, access, external anchoring,
backup, correction and deletion procedures before production use. The browser
replay is a demonstration store; clearing browser data removes its records.
