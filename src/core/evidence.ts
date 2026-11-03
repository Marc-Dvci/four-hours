import { factsSchema, incidentSchema, type FactKey } from "./model";
import {
  append,
  assertOpen,
  doraClosed,
  privacyIncident,
  recordPrivacy,
  type RecordState,
} from "./ledger";
import { z } from "zod";
export async function updateEvidence(
  state: RecordState,
  input: unknown,
  actor: string,
  now: string,
): Promise<RecordState> {
  const edit = z
    .object({
      field: factsSchema.keyof(),
      value: z.unknown(),
      source: z.string().trim().min(3).max(200),
      url: z.string().url(),
    })
    .parse(input);
  if (
    doraClosed(state) &&
    (edit.field === "personalDataBreach" || edit.field === "gdprRiskUnlikely")
  ) {
    const current = privacyIncident(state);
    const fact = factsSchema.shape[edit.field].parse({
      value: edit.value,
      source: edit.source,
      url: edit.url,
      observedAt: now,
      quality: state.incident.synthetic ? "synthetic" : "attested",
    });
    return recordPrivacy(
      state,
      {
        awarenessAt: current.privacyAwarenessAt,
        personalDataBreach: current.facts.personalDataBreach,
        gdprRiskUnlikely: current.facts.gdprRiskUnlikely,
        [edit.field]: fact,
      },
      actor,
      now,
    );
  }
  assertOpen(state);
  const incident = structuredClone(state.incident);
  const fact = {
    value: edit.value,
    source: edit.source,
    url: edit.url,
    observedAt: now,
    quality: incident.synthetic ? "synthetic" : "attested",
  };
  const parsed = factsSchema.shape[edit.field].parse(fact);
  (incident.facts as Record<FactKey, unknown>)[edit.field] = parsed;
  incident.assessedAt = now;
  incidentSchema.parse(incident);
  return {
    ...state,
    incident,
    revisions: await append(
      state.revisions,
      actor,
      "evidence.updated",
      { field: edit.field, fact: parsed },
      now,
    ),
  };
}
