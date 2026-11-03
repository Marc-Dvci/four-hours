import { canonical, verify, hash, type RecordState } from "./ledger";
import { privacySchema, type Incident, type FactKey } from "./model";
/** Checks both the revision links and the current projection of the recorded events. */
export async function verifyRecord(state: RecordState): Promise<boolean> {
  try {
    if (!(await verify(state.revisions))) return false;
    let incident: Incident | null = null;
    let signature: RecordState["signature"] = null;
    const receipts: RecordState["receipts"] = [];
    const details: NonNullable<RecordState["reportDetails"]> = {};
    let recurrence: RecordState["recurrence"];
    let privacy: RecordState["privacy"];
    for (const revision of state.revisions) {
      const p = revision.payload as Record<string, any>;
      if (!p || typeof p !== "object") return false;
      if (revision.action === "incident.created") {
        incident = structuredClone(p.incident ?? p) as Incident;
        recurrence = p.recurrence;
      } else if (revision.action === "classification.signed") {
        if (incident && canonical(incident) !== canonical(p.incident))
          return false;
        incident = structuredClone(p.incident);
        signature = p.signature;
        if (
          signature?.actor !== revision.actor ||
          signature?.signedAt !== revision.at
        )
          return false;
        if ((await hash(p.incident)) !== signature.evidenceHash) return false;
      } else if (revision.action === "incident.context.updated") {
        if (!incident) return false;
        incident = { ...(incident as Incident), ...p, assessedAt: revision.at };
      } else if (
        revision.action === "evidence.updated" ||
        revision.action === "graph.evidence.refreshed"
      ) {
        if (!incident || !Object.hasOwn(incident.facts, p.field)) return false;
        (incident.facts as Record<FactKey, unknown>)[p.field as FactKey] =
          p.fact;
        incident.assessedAt = revision.at;
      } else if (revision.action === "evidence.imported")
        incident = structuredClone(p.incident);
      else if (
        /^report\.(initial|intermediate|final|reclassification|gdpr)\.recorded$/.test(
          revision.action,
        )
      ) {
        if (p.actor !== revision.actor) return false;
        receipts.push(p as RecordState["receipts"][number]);
      } else if (revision.action === "privacy.assessed")
        privacy = privacySchema.parse(p);
      else if (revision.action === "report.field.updated")
        details[p.code] = p.fact;
      else return false;
    }
    if (incident && canonical(incident) !== canonical(state.incident))
      return false;
    if (
      canonical(signature) !== canonical(state.signature) ||
      canonical(receipts) !== canonical(state.receipts)
    )
      return false;
    if (canonical(details) !== canonical(state.reportDetails ?? {}))
      return false;
    if (canonical(recurrence ?? null) !== canonical(state.recurrence ?? null))
      return false;
    if (canonical(privacy ?? null) !== canonical(state.privacy ?? null))
      return false;
    return true;
  } catch {
    return false;
  }
}
