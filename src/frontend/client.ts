import { incidentSchema, type FactKey, type Incident } from "../core/model";
import { updateContext } from "../core/context";
import {
  append,
  hash,
  sign,
  recordSubmission,
  verify,
  type RecordState,
} from "../core/ledger";
import { classify } from "../core/classify";
import { clocks } from "../core/clocks";
import { recurring } from "../core/recurrence";
import { reportFields, validateNarrative, workpaper } from "../core/reports";
import { seedStates, REPLAY_NOW } from "../demo/bank";

export const isForge =
  window.parent !== window &&
  !new URLSearchParams(location.search).has("replay");
// No metadata is requested, so Forge returns the resolver body directly.
const invoke = async <T>(
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> => {
  const { invoke: bridgeInvoke } = await import("@forge/bridge");
  return (await bridgeInvoke<T>(method, payload)) as T;
};
export type Row = {
  version: number;
  data: RecordState;
  evidenceHash: string;
  chainValid: boolean;
};
export type Bootstrap = {
  records: Row[];
  actor: string;
  displayName: string;
  mode: "forge" | "replay";
  now: string;
  boundKey?: string;
  graphStatus?: { accepted: number; at: string };
};
const storageKey = "four-hours.replay.v1";
let replayNow = REPLAY_NOW;
let records: { version: number; data: RecordState }[] = [];
const demoActor = "replay:risk-officer";
async function rows(): Promise<Row[]> {
  return Promise.all(
    records.map(async (r) => ({
      ...r,
      evidenceHash: await hash(r.data.incident),
      chainValid: await verify(r.data.revisions),
    })),
  );
}
function persist() {
  localStorage.setItem(storageKey, JSON.stringify({ now: replayNow, records }));
}
export async function bootstrap(): Promise<Bootstrap> {
  if (isForge) return invoke<Bootstrap>("bootstrap");
  try {
    const cached = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
      now: string;
      records: typeof records;
    } | null;
    if (
      cached &&
      Array.isArray(cached.records) &&
      Number.isFinite(Date.parse(cached.now))
    ) {
      for (const r of cached.records) incidentSchema.parse(r.data.incident);
      records = cached.records;
      replayNow = cached.now;
    } else {
      records = seedStates().map((data) => ({ version: 1, data }));
      persist();
    }
  } catch {
    records = seedStates().map((data) => ({ version: 1, data }));
    replayNow = REPLAY_NOW;
    persist();
  }
  return {
    records: await rows(),
    actor: demoActor,
    displayName: "Demo risk officer",
    mode: "replay",
    now: replayNow,
  };
}
export async function reset(): Promise<Bootstrap> {
  localStorage.removeItem(storageKey);
  records = [];
  replayNow = REPLAY_NOW;
  return bootstrap();
}
export async function advance(hours: number): Promise<Bootstrap> {
  replayNow = new Date(Date.parse(replayNow) + hours * 3600000).toISOString();
  persist();
  return bootstrap();
}
export async function mutation(
  key: string,
  version: number,
  action: "sign" | "evidence" | "submit" | "context",
  payload: Record<string, unknown>,
): Promise<Row> {
  if (isForge)
    return invoke<Row>("mutate", { key, version, action, ...payload });
  // Refresh storage before every write so a stale browser tab cannot replace a newer revision.
  const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as {
    records?: typeof records;
  };
  if (stored.records) records = stored.records;
  const index = records.findIndex((r) => r.data.incident.id === key);
  const current = records[index];
  if (!current || current.version !== version)
    throw new Error(
      "The incident changed in another session. Refresh before saving.",
    );
  if (!(await verify(current.data.revisions)))
    throw new Error("The evidence chain is invalid");
  let data: RecordState;
  if (action === "sign")
    data = await sign(
      current.data,
      demoActor,
      String(payload.rationale ?? ""),
      replayNow,
    );
  else if (action === "submit")
    data = await recordSubmission(
      current.data,
      payload.receipt as Parameters<typeof recordSubmission>[1],
      demoActor,
      replayNow,
    );
  else if (action === "context")
    data = await updateContext(
      current.data,
      payload.context,
      demoActor,
      replayNow,
    );
  else {
    const incident = structuredClone(current.data.incident);
    const field = payload.field as FactKey;
    if (!(field in incident.facts)) throw new Error("Unknown evidence field");
    (incident.facts[field] as { value: unknown }).value = payload.value;
    incident.facts[field].source = String(payload.source);
    incident.facts[field].url = String(payload.url);
    incident.facts[field].observedAt = replayNow;
    incident.facts[field].quality = "synthetic";
    incident.assessedAt = replayNow;
    incidentSchema.parse(incident);
    data = {
      ...current.data,
      incident,
      revisions: await append(
        current.data.revisions,
        demoActor,
        "evidence.updated",
        { field, fact: incident.facts[field] },
        replayNow,
      ),
    };
  }
  const next = { version: version + 1, data };
  records[index] = next;
  persist();
  return {
    ...next,
    evidenceHash: await hash(data.incident),
    chainValid: await verify(data.revisions),
  };
}
export async function getRecurrence(key: string) {
  if (isForge)
    return invoke<ReturnType<typeof recurring>>("recurrence", { key });
  const current = records.find((r) => r.data.incident.id === key)!;
  return recurring(
    current.data.incident,
    records.map((r) => r.data.incident),
  );
}
export async function getReport(
  key: string,
  kind: Parameters<typeof reportFields>[1],
) {
  if (isForge)
    return invoke<ReturnType<typeof reportFields>>("report", { key, kind });
  return reportFields(
    records.find((r) => r.data.incident.id === key)!.data,
    kind,
  );
}
export async function exportWorkpaper(key: string) {
  if (isForge) return invoke<string>("workpaper", { key });
  return workpaper(records.find((r) => r.data.incident.id === key)!.data);
}
export async function checkNarrative(key: string, text: string) {
  if (isForge)
    return invoke<ReturnType<typeof validateNarrative>>("validateNarrative", {
      key,
      text,
    });
  return validateNarrative(
    text,
    records.find((r) => r.data.incident.id === key)!.data,
  );
}
export async function createIncident(incident: Incident) {
  if (isForge) return invoke<Row>("createIncident", { incident });
  if (records.some((r) => r.data.incident.id === incident.id))
    throw new Error("This incident already exists");
  incidentSchema.parse(incident);
  const data: RecordState = {
    incident,
    signature: null,
    receipts: [],
    revisions: await append(
      [],
      demoActor,
      "incident.created",
      incident,
      replayNow,
    ),
  };
  const r = { version: 1, data };
  records.push(r);
  persist();
  return { ...r, evidenceHash: await hash(incident), chainValid: true };
}
export const forgeCall = <T>(
  method: string,
  payload?: Record<string, unknown>,
) => invoke<T>(method, payload);
export { classify, clocks };
