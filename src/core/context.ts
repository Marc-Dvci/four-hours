import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { instant, incidentSchema } from "./model";
import {
  append,
  assertOpen,
  canonical,
  doraClosed,
  privacyIncident,
  recordPrivacy,
  type RecordState,
} from "./ledger";

export const contextSchema = z.object({
  entityId: z.string().trim().min(1).max(100),
  service: z.string().trim().min(1).max(150),
  serviceId: z.string().trim().min(1).max(100),
  rootCause: z.string().trim().max(300),
  occurredAt: instant,
  awarenessAt: instant,
  privacyAwarenessAt: instant.nullable(),
  entity: z.enum([
    "credit-institution",
    "central-counterparty",
    "trading-venue",
    "nis2-essential-important",
    "other",
  ]),
  timezone: z.string().refine((s) => {
    try {
      Temporal.Now.zonedDateTimeISO(s);
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA timezone"),
  recurrenceExempt: z.boolean(),
});
export async function updateContext(
  state: RecordState,
  input: unknown,
  actor: string,
  now: string,
): Promise<RecordState> {
  const context = contextSchema.parse(input);
  if (doraClosed(state)) {
    const { privacyAwarenessAt, ...dora } = context;
    const { privacyAwarenessAt: _prior, ...original } = contextSchema.parse(
      state.incident,
    );
    const normalized = (value: typeof dora) => ({
      ...value,
      occurredAt: new Date(value.occurredAt).toISOString(),
      awarenessAt: new Date(value.awarenessAt).toISOString(),
    });
    if (canonical(normalized(dora)) !== canonical(normalized(original)))
      throw new Error(
        "The DORA incident is closed. Only its separate privacy awareness may be updated.",
      );
    const current = privacyIncident(state);
    return recordPrivacy(
      state,
      {
        awarenessAt: privacyAwarenessAt,
        personalDataBreach: current.facts.personalDataBreach,
        gdprRiskUnlikely: current.facts.gdprRiskUnlikely,
      },
      actor,
      now,
    );
  }
  assertOpen(state);
  if (
    Date.parse(context.awarenessAt) > Date.parse(now) ||
    (context.privacyAwarenessAt &&
      Date.parse(context.privacyAwarenessAt) > Date.parse(now))
  )
    throw new Error("Awareness times cannot be in the future");
  const incident = incidentSchema.parse({
    ...state.incident,
    ...context,
    assessedAt: now,
  });
  return {
    ...state,
    incident,
    revisions: await append(
      state.revisions,
      actor,
      "incident.context.updated",
      context,
      now,
    ),
  };
}
