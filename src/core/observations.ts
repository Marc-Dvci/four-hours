import { z } from "zod";
import { factsSchema, incidentSchema, instant, type FactKey } from "./model";
import { append, assertOpen, type RecordState } from "./ledger";
const observed = z.object({
  observedAt: instant,
  sourceReference: z.string().trim().min(3).max(120),
  values: z.record(z.string(), z.unknown()),
});
/** A Jira property is structured evidence, never a prompt or an instruction. */
export async function importObservations(
  state: RecordState,
  input: unknown,
  sourceUrl: string,
  actor: string,
  now: string,
): Promise<RecordState> {
  assertOpen(state);
  const batch = observed.parse(input);
  if (Date.parse(batch.observedAt) > Date.parse(now))
    throw new Error("Observation time cannot be in the future");
  const entries = Object.entries(batch.values);
  if (!entries.length || entries.length > 24)
    throw new Error("Provide between 1 and 24 recognised observation fields");
  const incident = structuredClone(state.incident);
  for (const [name, value] of entries) {
    const key = factsSchema.keyof().parse(name);
    const fact = {
      value,
      source: `Jira observations: ${batch.sourceReference}`,
      url: sourceUrl,
      observedAt: batch.observedAt,
      quality: incident.synthetic ? "synthetic" : "attested",
    };
    (incident.facts as Record<FactKey, unknown>)[key] =
      factsSchema.shape[key].parse(fact);
  }
  incident.assessedAt = now;
  incidentSchema.parse(incident);
  return {
    ...state,
    incident,
    revisions: await append(
      state.revisions,
      actor,
      "evidence.imported",
      { incident, sourceReference: batch.sourceReference },
      now,
    ),
  };
}
