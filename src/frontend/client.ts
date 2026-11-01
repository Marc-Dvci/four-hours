import { incidentSchema, type Incident } from "../core/model";
import { updateContext } from "../core/context";
import { updateEvidence } from "../core/evidence";
import { verifyRecord } from "../core/integrity";
import { evidenceBundle } from "../core/bundle";
import { updateReportDetail } from "../core/report-details";
import {
  append,
  hash,
  sign,
  recordSubmission,
  type RecordState,
} from "../core/ledger";
import { classify } from "../core/classify";
import { clocks } from "../core/clocks";
import { recurring, collectiveCase } from "../core/recurrence";
import { reportFields, validateNarrative, workpaper } from "../core/reports";
import { seedStates, REPLAY_NOW } from "../demo/bank";

export const isForge =
  /\.atlassian-dev\.net$/.test(location.hostname) &&
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
const storageKey = "four-hours.replay.v3";
let replayNow = REPLAY_NOW;
let records: { version: number; data: RecordState }[] = [];
const demoActor = "replay:risk-officer";
async function rows(): Promise<Row[]> {
  return Promise.all(
    records.map(async (r) => ({
      ...r,
      evidenceHash: await hash(r.data.incident),
      chainValid: await verifyRecord(r.data),
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
      records = await Promise.all(
        seedStates().map(async (data) => ({
          version: Date.now(),
          data: {
            ...data,
            revisions: await append(
              [],
              demoActor,
              "incident.created",
              data.incident,
              data.incident.assessedAt,
            ),
          },
        })),
      );
      persist();
    }
  } catch {
    throw new Error(
      "The saved replay cannot be read. Open Settings to reset it; the saved data has been preserved.",
    );
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
  return navigator.locks.request(storageKey, async () => {
    localStorage.removeItem(storageKey);
    records = [];
    replayNow = REPLAY_NOW;
    return bootstrap();
  });
}
export async function advance(hours: number): Promise<Bootstrap> {
  return navigator.locks.request(storageKey, async () => {
    await bootstrap();
    replayNow = new Date(Date.parse(replayNow) + hours * 3600000).toISOString();
    persist();
    return bootstrap();
  });
}
export async function mutation(
  key: string,
  version: number,
  action: "sign" | "evidence" | "submit" | "context" | "report-field",
  payload: Record<string, unknown>,
): Promise<Row> {
  if (isForge)
    return invoke<Row>("mutate", { key, version, action, ...payload });
  if (!navigator.locks)
    throw new Error(
      "This browser cannot safely coordinate edits. Open the replay in a current Chrome, Edge, Firefox or Safari browser.",
    );
  return navigator.locks.request(storageKey, () =>
    mutateReplay(key, version, action, payload),
  );
}
async function mutateReplay(
  key: string,
  version: number,
  action: "sign" | "evidence" | "submit" | "context" | "report-field",
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
  if (!(await verifyRecord(current.data)))
    throw new Error("The evidence chain is invalid");
  let data: RecordState;
  if (action === "sign")
    data = await sign(
      current.data,
      demoActor,
      String(payload.rationale ?? ""),
      replayNow,
      payload.classifiedAt ? String(payload.classifiedAt) : replayNow,
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
  else if (action === "report-field")
    data = await updateReportDetail(
      current.data,
      payload,
      demoActor,
      replayNow,
    );
  else data = await updateEvidence(current.data, payload, demoActor, replayNow);
  const next = { version: version + 1, data };
  records[index] = next;
  persist();
  return {
    ...next,
    evidenceHash: await hash(data.incident),
    chainValid: await verifyRecord(data),
  };
}
export async function getRecurrence(key: string) {
  if (isForge)
    return invoke<ReturnType<typeof recurring>>("recurrence", { key });
  const current = records.find((r) => r.data.incident.id === key)!;
  return recurring(
    current.data.incident,
    records.filter((r) => !r.data.recurrence).map((r) => r.data.incident),
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
export async function createIncident(incident: Incident): Promise<Row> {
  if (isForge) return invoke<Row>("createIncident", { incident });
  return navigator.locks.request(storageKey, () =>
    createReplayIncident(incident),
  );
}
async function createReplayIncident(incident: Incident): Promise<Row> {
  await bootstrap();
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
  const r = { version: Date.now(), data };
  records.push(r);
  persist();
  return { ...r, evidenceHash: await hash(incident), chainValid: true };
}
export const forgeCall = <T>(
  method: string,
  payload?: Record<string, unknown>,
) => invoke<T>(method, payload);
export { classify, clocks };
export async function exportEvidenceBundle(key: string) {
  if (isForge)
    return invoke<Awaited<ReturnType<typeof evidenceBundle>>>(
      "evidenceBundle",
      { key },
    );
  return evidenceBundle(
    records.find((r) => r.data.incident.id === key)!.data,
    replayNow,
  );
}

export async function createCollective(key: string): Promise<Row> {
  if (isForge) return invoke<Row>("createCollective", { key });
  return navigator.locks.request(storageKey, async () => {
    await bootstrap();
    const current = records.find((r) => r.data.incident.id === key)?.data
      .incident;
    if (!current) throw new Error("Incident unavailable");
    const result = recurring(
      current,
      records.filter((r) => !r.data.recurrence).map((r) => r.data.incident),
    );
    const existing = records.find(
      (r) =>
        r.data.recurrence &&
        [...r.data.recurrence.memberIds].sort().join("|") ===
          [...result.incidentIds].sort().join("|"),
    );
    if (existing)
      return {
        ...existing,
        evidenceHash: await hash(existing.data.incident),
        chainValid: await verifyRecord(existing.data),
      };
    const prefix = key.split("-")[0]!;
    const id = `${prefix}-${Math.max(0, ...records.filter((r) => r.data.incident.id.startsWith(prefix + "-")).map((r) => Number(r.data.incident.id.split("-")[1]))) + 1}`;
    const data = await collectiveCase(
      current,
      records.filter((r) => !r.data.recurrence).map((r) => r.data.incident),
      id,
      demoActor,
      replayNow,
    );
    const row = { version: 1, data };
    records.push(row);
    persist();
    return {
      ...row,
      evidenceHash: await hash(data.incident),
      chainValid: true,
    };
  });
}
