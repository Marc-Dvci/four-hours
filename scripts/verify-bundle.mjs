import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const stable = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
          .join(",")}}`;
const digest = (v) => createHash("sha256").update(stable(v)).digest("hex");
export function verifyBundle(bundle, expectedHash) {
  const { bundleHash, ...body } = bundle;
  if (body.format !== "four-hours.evidence.v1" || digest(body) !== bundleHash)
    return { valid: false, reason: "Bundle digest mismatch" };
  if (expectedHash && expectedHash !== bundleHash)
    return { valid: false, reason: "External retained digest mismatch" };
  const state = body.state;
  let prior = "0".repeat(64);
  let previousTime = -Infinity;
  let projection = null;
  const details = {};
  let recurrence = null;
  if (!state || !Array.isArray(state.revisions))
    return { valid: false, reason: "Missing revision history" };
  for (const [n, entry] of state.revisions.entries()) {
    const { hash, ...event } = entry;
    if (
      event.sequence !== n + 1 ||
      event.previousHash !== prior ||
      !Number.isFinite(Date.parse(event.at)) ||
      Date.parse(event.at) < previousTime ||
      digest(event) !== hash
    )
      return { valid: false, reason: `Revision ${n + 1} mismatch` };
    prior = hash;
    previousTime = Date.parse(event.at);
    const p = event.payload;
    if (event.action === "incident.created") {
      projection = structuredClone(p.incident ?? p);
      recurrence = p.recurrence ?? null;
    } else if (event.action === "classification.signed") {
      if (projection && stable(projection) !== stable(p.incident))
        return {
          valid: false,
          reason: "Signed incident does not match preceding evidence",
        };
      projection = structuredClone(p.incident);
      if (
        p.signature.actor !== event.actor ||
        p.signature.signedAt !== event.at
      )
        return { valid: false, reason: "Attestation attribution mismatch" };
    } else if (event.action === "incident.context.updated") {
      if (!projection)
        return { valid: false, reason: "Missing incident baseline" };
      projection = { ...projection, ...p, assessedAt: event.at };
    } else if (
      event.action === "evidence.updated" ||
      event.action === "graph.evidence.refreshed"
    ) {
      if (!projection || !Object.hasOwn(projection.facts, p.field))
        return { valid: false, reason: "Unknown evidence field" };
      projection.facts[p.field] = p.fact;
      projection.assessedAt = event.at;
    } else if (event.action === "evidence.imported")
      projection = structuredClone(p.incident);
    else if (event.action === "report.field.updated") details[p.code] = p.fact;
    else if (
      !/^report\.(initial|intermediate|final|reclassification|gdpr)\.recorded$/.test(
        event.action,
      )
    )
      return { valid: false, reason: "Unknown revision action" };
  }
  if (projection && stable(projection) !== stable(state.incident))
    return {
      valid: false,
      reason: "Current incident does not match the recorded events",
    };
  if (
    stable(details) !== stable(state.reportDetails ?? {}) ||
    stable(recurrence) !== stable(state.recurrence ?? null)
  )
    return {
      valid: false,
      reason: "Report or collective evidence projection mismatch",
    };
  const signed = state.revisions
    .filter((r) => r.action === "classification.signed")
    .at(-1);
  if (stable(signed?.payload.signature ?? null) !== stable(state.signature))
    return { valid: false, reason: "Signature projection mismatch" };
  if (
    state.signature &&
    digest(signed.payload.incident) !== state.signature.evidenceHash
  )
    return { valid: false, reason: "Signed evidence digest mismatch" };
  const receipts = state.revisions
    .filter((r) =>
      /^report\.(initial|intermediate|final|reclassification|gdpr)\.recorded$/.test(
        r.action,
      ),
    )
    .map((r) => r.payload);
  if (stable(receipts) !== stable(state.receipts))
    return { valid: false, reason: "Receipt projection mismatch" };
  return {
    valid: true,
    bundleHash,
    revisionCount: state.revisions.length,
    externalAnchorChecked: !!expectedHash,
    note: expectedHash
      ? "Compared with independently retained digest."
      : "Retain this digest outside the bundle. Hashes establish consistency, not signer identity or source truth.",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = verifyBundle(
      JSON.parse(await readFile(process.argv[2], "utf8")),
      process.argv[3],
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
