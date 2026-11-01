import { classify } from "./classify";
import { hash, verify, type RecordState } from "./ledger";
import type { ReportKind } from "./clocks";

export type ReportField = {
  code: string;
  label: string;
  value: string;
  citations: string[];
};
export function reportFields(
  state: RecordState,
  kind: ReportKind,
): ReportField[] {
  const i = state.incident;
  const a = classify(i);
  const f = i.facts;
  const field = (
    code: string,
    label: string,
    value: unknown,
    citations: string[],
  ): ReportField => ({
    code,
    label,
    value: value === null ? "Evidence required" : String(value),
    citations,
  });
  const result = [
    field("incident-reference", "Incident reference", i.id, ["Jira work item"]),
    field("notification-type", "Notification type", kind, ["2025/302 Annex I"]),
    field("detection-time", "Incident awareness", i.awarenessAt, [
      "Incident record",
    ]),
    field(
      "classification-time",
      "Major classification time",
      state.signature?.majorClassifiedAt ?? state.signature?.signedAt ?? null,
      ["Signed classification"],
    ),
    field("description", "Incident description", i.title, ["Jira summary"]),
    field("services", "Affected service", i.service, [
      f.criticalFunction.source,
    ]),
    field(
      "classification",
      "Classification",
      state.signature?.verdict ?? a.verdict,
      [
        "2024/1772 Art. 8",
        ...a.criteria.filter((c) => c.met).map((c) => c.reference),
      ],
    ),
    field("clients", "Clients affected", f.affectedClients.value, [
      f.affectedClients.source,
    ]),
    field(
      "countries",
      "Member States affected",
      f.memberStates.value?.join(", ") ?? null,
      [f.memberStates.source],
    ),
    field(
      "impact-cost",
      "Estimated economic impact (EUR)",
      f.economicImpact.value,
      [f.economicImpact.source],
    ),
    field("duration", "Duration (minutes)", f.durationMinutes.value, [
      f.durationMinutes.source,
    ]),
  ];
  if (kind === "intermediate" || kind === "final")
    result.push(
      field("root-cause", "Apparent root cause", i.rootCause, [
        "Incident investigation",
      ]),
    );
  if (kind === "final")
    result.push(
      field("remediation", "Remediation and preventive action", null, [
        "Officer review required",
      ]),
    );
  return result;
}
export function validateNarrative(
  text: string,
  state: RecordState,
): { valid: boolean; unsupported: string[] } {
  const unsupported: string[] = [];
  const facts = state.incident.facts;
  const keys = new Set(Object.keys(facts));
  const numericTokens = (s: string) =>
    s.match(/[+-]?\d{1,3}(?:[,\u202f ]\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?/g) ??
    [];
  const normalise = (s: string) => String(Number(s.replace(/[,\u202f ]/g, "")));
  // A number must occur in the cited fact in the same sentence. Source labels and
  // incident descriptions are never a source of permitted numeric assertions.
  for (const sentence of text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)) {
    const cited = [...sentence.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!);
    if (!cited.length) unsupported.push("missing evidence citation");
    for (const c of cited) if (!keys.has(c)) unsupported.push(c);
    const allowed = new Set(
      cited
        .filter((c) => keys.has(c))
        .flatMap((c) => {
          const v = facts[c as keyof typeof facts].value;
          return typeof v === "number" ? [String(v)] : [];
        }),
    );
    const prose = sentence.replace(/\[[^\]]+\]/g, "");
    for (const n of numericTokens(prose))
      if (!allowed.has(normalise(n))) unsupported.push(n);
  }
  if (!text.trim()) unsupported.push("empty narrative");
  return {
    valid: unsupported.length === 0,
    unsupported: [...new Set(unsupported)],
  };
}
export async function workpaper(state: RecordState): Promise<string> {
  const a = classify(state.incident);
  const intact = await verify(state.revisions);
  const evidenceHash = await hash(state.incident);
  const rows = a.criteria
    .map(
      (c) =>
        `| ${c.label} | ${c.met === null ? "INCOMPLETE" : c.met ? "MET" : "BELOW"} | ${c.reference} |`,
    )
    .join("\n");
  const evidence = Object.entries(state.incident.facts)
    .map(
      ([k, f]) =>
        `| ${k} | ${JSON.stringify(f.value)} | ${f.quality} | ${f.source.replace(/\|/g, "/")} | ${f.observedAt} |`,
    )
    .join("\n");
  return `# Four Hours · ${state.incident.id}\n\n${state.incident.title}\n\n${state.incident.synthetic ? "Synthetic replay evidence." : "Live incident evidence."}\n\n## Classification\n\n${a.verdict}. ${a.explanation}\n\nRule version: ${a.ruleVersion}\n\n| Criterion | Result | Reference |\n|---|---|---|\n${rows}\n\n## Signature\n\n${state.signature ? `${state.signature.actor} · ${state.signature.signedAt}\n\n${state.signature.rationale}` : "Awaiting officer signature."}\n\nEvidence SHA-256: ${evidenceHash}\n\nSignature current: ${state.signature?.evidenceHash === evidenceHash}\n\n## Evidence register\n\n| Field | Value | Quality | Source | Observed at |\n|---|---|---|---|---|\n${evidence}\n\n## Submission receipts\n\n${state.receipts.map((r) => `- ${r.kind}: ${r.submittedAt} · ${r.reference} · ${r.actor}`).join("\n") || "No receipt recorded."}\n\n## Revision chain\n\nVerification: ${intact ? "VALID" : "INVALID"}. ${state.revisions.length} revisions.\n\n${state.revisions.map((r) => `${r.sequence}. ${r.at} · ${r.action} · ${r.actor}\n   SHA-256: ${r.hash}\n   Previous: ${r.previousHash}`).join("\n")}\n\n## Review\n\nAn officer reviews the report against the competent authority's current submission form. Report preparation and submission receipts are recorded separately.\n`;
}
