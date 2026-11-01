import { factsSchema, incidentSchema, type FactKey } from "./model";
import { append, assertOpen, type RecordState } from "./ledger";
import { z } from "zod";
export async function updateEvidence(
  state: RecordState,
  input: unknown,
  actor: string,
  now: string,
): Promise<RecordState> {
  assertOpen(state);
  const edit = z
    .object({
      field: factsSchema.keyof(),
      value: z.unknown(),
      source: z.string().trim().min(3).max(200),
      url: z.string().url(),
    })
    .parse(input);
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
