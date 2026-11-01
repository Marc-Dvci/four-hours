import Resolver from "@forge/resolver";
import { updateContext } from "./core/context";
import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";
import { z } from "zod";
import { incidentSchema, type FactKey } from "./core/model";
import { classify } from "./core/classify";
import { clocks } from "./core/clocks";
import {
  append,
  hash,
  sign,
  recordSubmission,
  verify,
  type RecordState,
} from "./core/ledger";
import { recurring } from "./core/recurrence";
import { reportFields, validateNarrative, workpaper } from "./core/reports";
import { demoIncidents } from "./demo/bank";
import {
  actor,
  readable,
  editable,
  admin,
  permission,
  issueKey,
  type RequestContext,
} from "./forge/access";
import * as store from "./forge/store";
import { syncServices, serviceEvidence } from "./forge/graph";
import { publishWorkpaper } from "./forge/confluence";
export { onConnectionChange } from "./forge/graph";

const resolver = new Resolver();
type Req = { payload: Record<string, unknown>; context: RequestContext };
async function load(key: string, context: RequestContext) {
  await readable(key, context);
  const stored = await store.read(key);
  if (!stored) throw new Error("Set up this incident in Four Hours first");
  return stored;
}
async function view(key: string, context: RequestContext) {
  const stored = await load(key, context);
  return {
    ...stored,
    assessment: classify(stored.data.incident),
    clocks: clocks(
      stored.data.incident,
      stored.data.signature,
      stored.data.receipts,
      new Date().toISOString(),
    ),
    evidenceHash: await hash(stored.data.incident),
    chainValid: await verify(stored.data.revisions),
  };
}
resolver.define("bootstrap", async (req: Req) => {
  const who = actor(req.context);
  const bound = req.context.extension?.issue?.key;
  const records = [];
  for (const key of bound ? [bound] : await store.keys()) {
    try {
      records.push(await view(key, req.context));
    } catch {
      /* A population never reveals an inaccessible record. */
    }
  }
  const me = await api.asUser().requestJira(route`/rest/api/3/myself`);
  const profile = me.ok
    ? ((await me.json()) as { displayName: string })
    : { displayName: who };
  return {
    records,
    actor: who,
    displayName: profile.displayName,
    mode: "forge",
    now: new Date().toISOString(),
    boundKey: bound,
    graphStatus: await kvs.get("fh:graph-status"),
  };
});
resolver.define("projects", async (req: Req) => {
  await admin(req.context);
  const r = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/search?maxResults=100`);
  if (!r.ok) throw new Error("Project list unavailable");
  const b = (await r.json()) as {
    values: { key: string; name: string; projectTypeKey: string }[];
  };
  return b.values;
});
resolver.define("loadDemo", async (req: Req) => {
  await admin(req.context);
  const project = z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+$/)
    .parse(req.payload.project);
  const prior = await kvs.get<string[]>(`fh:demo:${project}`);
  if (prior?.length) return { keys: prior };
  const p = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/${project}`);
  if (!p.ok) throw new Error("Project unavailable");
  const info = (await p.json()) as {
    issueTypes: { id: string; subtask: boolean }[];
  };
  const type = info.issueTypes.find((t) => !t.subtask);
  if (!type) throw new Error("Project needs an incident or task issue type");
  const created: string[] = [];
  for (const demo of demoIncidents) {
    const marker = `fh:demo-item:${project}:${demo.id}`;
    let key = await kvs.get<string>(marker);
    if (!key) {
      const response = await api
        .asUser()
        .requestJira(route`/rest/api/3/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              project: { key: project },
              issuetype: { id: type.id },
              summary: `[Four Hours demo] ${demo.title}`,
              labels: ["four-hours-demo"],
              description: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Synthetic Four Hours incident. Open Apps > Four Hours to review the classification evidence and reporting clocks.",
                      },
                    ],
                  },
                ],
              },
            },
          }),
        });
      if (!response.ok)
        throw new Error(
          `Demo creation stopped after ${created.length} incidents (HTTP ${response.status}). Retry safely.`,
        );
      key = ((await response.json()) as { key: string }).key;
      await kvs.set(marker, key);
    }
    if (!(await store.read(key))) {
      const incident = structuredClone(demo);
      incident.id = key;
      const shift = Date.now() - Date.parse("2026-10-29T10:08:00Z");
      for (const k of ["occurredAt", "awarenessAt", "assessedAt"] as const)
        incident[k] = new Date(Date.parse(incident[k]) + shift).toISOString();
      for (const f of Object.values(incident.facts))
        f.observedAt = new Date(Date.parse(f.observedAt) + shift).toISOString();
      const data: RecordState = {
        incident: incidentSchema.parse(incident),
        signature: null,
        receipts: [],
        revisions: [],
      };
      await store.save(key, data, 0);
    }
    created.push(key);
  }
  await kvs.set(`fh:demo:${project}`, created);
  return { keys: created };
});
resolver.define("createIncident", async (req: Req) => {
  const incident = incidentSchema.parse(req.payload.incident);
  await editable(incident.id, req.context);
  const r = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${incident.id}?fields=summary`);
  const issue = (await r.json()) as { fields: { summary: string } };
  incident.title = issue.fields.summary;
  if (await store.read(incident.id))
    throw new Error("This incident is already set up");
  const now = new Date().toISOString();
  if (Date.parse(incident.assessedAt) > Date.now())
    throw new Error("Assessment time cannot be in the future");
  const state: RecordState = {
    incident,
    signature: null,
    receipts: [],
    revisions: await append(
      [],
      actor(req.context),
      "incident.created",
      incident,
      now,
    ),
  };
  await store.save(incident.id, state, 0);
  return view(incident.id, req.context);
});
resolver.define("mutate", async (req: Req) => {
  const key = issueKey.parse(req.payload.key);
  const stored = await load(key, req.context);
  await editable(key, req.context);
  if (
    z.number().int().nonnegative().parse(req.payload.version) !== stored.version
  )
    throw new Error("Refresh this incident before saving");
  if (!(await verify(stored.data.revisions)))
    throw new Error("The evidence chain is invalid");
  const action = z
    .enum(["sign", "submit", "evidence", "context"])
    .parse(req.payload.action);
  const now = new Date().toISOString();
  const who = actor(req.context);
  let next: RecordState;
  if (action === "sign") {
    const officers = (await kvs.get<string[]>("fh:officers")) ?? [];
    if (
      !officers.includes(who) &&
      !(await permission("ADMINISTER_PROJECTS", key))
    )
      throw new Error(
        "A configured risk officer or Jira project administrator must sign",
      );
    next = await sign(
      stored.data,
      who,
      z.string().max(2000).parse(req.payload.rationale),
      now,
    );
  } else if (action === "submit") {
    next = await recordSubmission(
      stored.data,
      req.payload.receipt as Parameters<typeof recordSubmission>[1],
      who,
      now,
    );
  } else if (action === "context") {
    next = await updateContext(stored.data, req.payload.context, who, now);
  } else {
    const field = z.string().parse(req.payload.field) as FactKey;
    if (!(field in stored.data.incident.facts))
      throw new Error("Unknown evidence field");
    const incident = structuredClone(stored.data.incident);
    incident.assessedAt = now;
    (incident.facts[field] as { value: unknown }).value = req.payload.value;
    incident.facts[field].source = z
      .string()
      .trim()
      .min(3)
      .max(200)
      .parse(req.payload.source);
    incident.facts[field].url = z.string().url().parse(req.payload.url);
    incident.facts[field].observedAt = now;
    incident.facts[field].quality = incident.synthetic
      ? "synthetic"
      : "attested";
    incidentSchema.parse(incident);
    next = {
      ...stored.data,
      incident,
      revisions: await append(
        stored.data.revisions,
        who,
        "evidence.updated",
        { field, fact: incident.facts[field] },
        now,
      ),
    };
  }
  await store.save(key, next, stored.version);
  return view(key, req.context);
});
resolver.define("recurrence", async (req: Req) => {
  const key = issueKey.parse(req.payload.key);
  const stored = await load(key, req.context);
  const candidates = [];
  for (const k of await store.keys()) {
    try {
      candidates.push((await load(k, req.context)).data.incident);
    } catch {}
  }
  return recurring(stored.data.incident, candidates);
});
resolver.define("report", async (req: Req) =>
  reportFields(
    (await load(issueKey.parse(req.payload.key), req.context)).data,
    z
      .enum(["initial", "intermediate", "final", "reclassification"])
      .parse(req.payload.kind),
  ),
);
resolver.define("validateNarrative", async (req: Req) =>
  validateNarrative(
    z.string().max(10000).parse(req.payload.text),
    (await load(issueKey.parse(req.payload.key), req.context)).data,
  ),
);
resolver.define("workpaper", async (req: Req) =>
  workpaper((await load(issueKey.parse(req.payload.key), req.context)).data),
);
resolver.define("publishWorkpaper", async (req: Req) =>
  publishWorkpaper(
    (await load(issueKey.parse(req.payload.key), req.context)).data,
    z.string().parse(req.payload.spaceId),
  ),
);
resolver.define("syncGraph", async (req: Req) => {
  await admin(req.context);
  const base = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
  if (!base.ok) throw new Error("Site details unavailable");
  return syncServices(((await base.json()) as { baseUrl: string }).baseUrl);
});
resolver.define("refreshGraphEvidence", async (req: Req) => {
  const key = issueKey.parse(req.payload.key);
  await editable(key, req.context);
  const stored = await load(key, req.context);
  if (!stored.data.incident.synthetic)
    throw new Error(
      "Graph enrichment is scoped to synthetic demonstration incidents",
    );
  const fact = await serviceEvidence(stored.data.incident.serviceId);
  const incident = structuredClone(stored.data.incident);
  incident.facts.criticalFunction = fact;
  incident.assessedAt = fact.observedAt;
  const next = {
    ...stored.data,
    incident,
    revisions: await append(
      stored.data.revisions,
      actor(req.context),
      "graph.evidence.refreshed",
      { field: "criticalFunction", fact },
      fact.observedAt,
    ),
  };
  await store.save(key, next, stored.version);
  return view(key, req.context);
});
export const handler = resolver.getDefinitions();

export async function incidentEvidence(
  payload: { issueKey: string },
  context: RequestContext,
) {
  const result = await view(issueKey.parse(payload.issueKey), context);
  return { ...result, fields: reportFields(result.data, "initial") };
}
export async function incidentRecurrence(
  payload: { issueKey: string },
  context: RequestContext,
) {
  const current = await load(issueKey.parse(payload.issueKey), context);
  const candidates = [];
  for (const key of await store.keys()) {
    try {
      candidates.push((await load(key, context)).data.incident);
    } catch {}
  }
  return recurring(current.data.incident, candidates);
}
