import Resolver from "@forge/resolver";
import { updateContext } from "./core/context";
import { updateEvidence } from "./core/evidence";
import { verifyRecord } from "./core/integrity";
import { evidenceBundle } from "./core/bundle";
import { updateReportDetail } from "./core/report-details";
import { refreshJiraObservations } from "./forge/observations";
import api, { route } from "@forge/api";
import { kvs, WhereConditions } from "@forge/kvs";
import { z } from "zod";
import { incidentSchema } from "./core/model";
import { classify } from "./core/classify";
import { clocks } from "./core/clocks";
import {
  append,
  hash,
  sign,
  recordSubmission,
  assertOpen,
  type RecordState,
} from "./core/ledger";
import { recurring, collectiveCase } from "./core/recurrence";
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
import { accessiblePopulation } from "./forge/population";
import { UnavailableIncident } from "./forge/access";
import { syncServices, serviceEvidence } from "./forge/graph";
import { publishWorkpaper, spaces } from "./forge/confluence";
export { onConnectionChange } from "./forge/graph";

const resolver = new Resolver();
type Req = { payload: Record<string, unknown>; context: RequestContext };
resolver.define("settings", async (req: Req) => {
  await admin(req.context);
  return { officers: (await kvs.get<string[]>("fh:officers")) ?? [] };
});
resolver.define("saveOfficers", async (req: Req) => {
  await admin(req.context);
  const officers = [
    ...new Set(
      z
        .array(z.string().trim().min(3).max(150))
        .max(20)
        .parse(req.payload.officers),
    ),
  ];
  for (const id of officers) {
    const user = await api
      .asUser()
      .requestJira(route`/rest/api/3/user?accountId=${id}`);
    if (!user.ok)
      throw new Error(
        "One of the account IDs is not a readable Atlassian user",
      );
  }
  await kvs.set("fh:officers", officers);
  return { saved: officers.length };
});
async function load(key: string, context: RequestContext) {
  await readable(key, context);
  const stored = await store.read(key);
  if (!stored)
    throw new UnavailableIncident("Set up this incident in Four Hours first");
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
    chainValid: await verifyRecord(stored.data),
  };
}
resolver.define("bootstrap", async (req: Req) => {
  const who = actor(req.context);
  const bound = req.context.extension?.issue?.key;
  const records = await accessiblePopulation(
    bound ? [bound] : await store.keys(),
    (key) => view(key, req.context),
  );
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
resolver.define("spaces", async (req: Req) => {
  actor(req.context);
  return spaces();
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
    issueTypes: { id: string; name: string; subtask: boolean }[];
  };
  const type =
    info.issueTypes.find((t) => !t.subtask && /^incident$/i.test(t.name)) ??
    info.issueTypes.find((t) => !t.subtask);
  if (!type) throw new Error("Project needs an incident or task issue type");
  const serverInfo = await api
    .asUser()
    .requestJira(route`/rest/api/3/serverInfo`);
  const base = serverInfo.ok
    ? ((await serverInfo.json()) as { baseUrl: string }).baseUrl
    : "";
  let desk: { id: string; requestTypeId: string } | null = null;
  const desks = await api
    .asUser()
    .requestJira(route`/rest/servicedeskapi/servicedesk?limit=100`);
  if (desks.ok) {
    const found = (
      (await desks.json()) as { values: { id: string; projectKey: string }[] }
    ).values.find((d) => d.projectKey === project);
    if (found) {
      const types = await api
        .asUser()
        .requestJira(
          route`/rest/servicedeskapi/servicedesk/${found.id}/requesttype?limit=100`,
        );
      const values = types.ok
        ? (
            (await types.json()) as {
              values: { id: string; issueTypeId: string }[];
            }
          ).values
        : [];
      const incidentType = values.find((t) => t.issueTypeId === type.id);
      if (incidentType) desk = { id: found.id, requestTypeId: incidentType.id };
    }
  }
  const created: string[] = [];
  for (const demo of demoIncidents) {
    const marker = `fh:demo-item:${project}:${demo.id}`;
    let key = await kvs.get<string>(marker);
    if (!key) {
      const description = `Service: ${demo.service}. Apparent root cause: ${demo.rootCause}. Synthetic demonstration incident: open Four Hours from this work item to review the classification evidence and reporting clocks.`;
      // In a service project the incident is raised as a JSM request, so it carries its request type.
      const response = desk
        ? await api.asUser().requestJira(route`/rest/servicedeskapi/request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceDeskId: desk.id,
              requestTypeId: desk.requestTypeId,
              requestFieldValues: { summary: demo.title, description },
            }),
          })
        : await api.asUser().requestJira(route`/rest/api/3/issue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: {
                project: { key: project },
                issuetype: { id: type.id },
                summary: demo.title,
                labels: ["four-hours-demo"],
                description: {
                  type: "doc",
                  version: 1,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: description }],
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
      const body = (await response.json()) as {
        key?: string;
        issueKey?: string;
      };
      key = (body.issueKey ?? body.key)!;
      await kvs.set(marker, key);
    }
    if (!(await store.read(key))) {
      const incident = structuredClone(demo);
      incident.id = key;
      const shift = Date.now() - Date.parse("2026-10-29T10:08:00Z");
      for (const k of ["occurredAt", "awarenessAt", "assessedAt"] as const)
        incident[k] = new Date(Date.parse(incident[k]) + shift).toISOString();
      for (const f of Object.values(incident.facts)) {
        f.observedAt = new Date(Date.parse(f.observedAt) + shift).toISOString();
        // Demo evidence points at the incident itself rather than an external system.
        f.url = `${base}/browse/${key}`;
      }
      const data: RecordState = {
        incident: incidentSchema.parse(incident),
        signature: null,
        receipts: [],
        revisions: await append(
          [],
          actor(req.context),
          "incident.created",
          incident,
          incident.assessedAt,
        ),
      };
      await store.save(key, data, 0);
    }
    created.push(key);
  }
  await kvs.set(`fh:demo:${project}`, created);
  return { keys: created };
});
// Deletes the demo incidents (Jira work items and Forge records) so the demo can be loaded again.
resolver.define("resetDemo", async (req: Req) => {
  await admin(req.context);
  let removed = 0;
  for (const key of await store.keys()) {
    const stored = await store.read(key);
    if (stored && !stored.data.incident.synthetic) continue;
    await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${key}?deleteSubtasks=true`, {
        method: "DELETE",
      });
    await kvs.entity("incident").delete(key);
    await kvs.delete(`fh:index:${key}`);
    removed++;
  }
  for (const prefix of ["fh:demo:", "fh:demo-item:", "fh:collective:"]) {
    let cursor: string | undefined;
    do {
      const q = kvs
        .query()
        .where("key", WhereConditions.beginsWith(prefix))
        .limit(100);
      const page = await (cursor ? q.cursor(cursor) : q).getMany();
      for (const r of page.results) await kvs.delete(r.key);
      cursor = page.nextCursor;
    } while (cursor);
  }
  return { removed };
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
  if (!(await verifyRecord(stored.data)))
    throw new Error("The evidence chain is invalid");
  const action = z
    .enum(["sign", "submit", "evidence", "context", "report-field"])
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
      req.payload.classifiedAt
        ? z.string().parse(req.payload.classifiedAt)
        : now,
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
  } else if (action === "report-field")
    next = await updateReportDetail(stored.data, req.payload, who, now);
  else next = await updateEvidence(stored.data, req.payload, who, now);
  await store.save(key, next, stored.version);
  return view(key, req.context);
});
async function recurrenceCandidates(context: RequestContext) {
  const records = await accessiblePopulation(await store.keys(), (key) =>
    load(key, { ...context, extension: undefined }),
  );
  return records.filter((r) => !r.data.recurrence).map((r) => r.data.incident);
}
resolver.define("recurrence", async (req: Req) => {
  const key = issueKey.parse(req.payload.key);
  const stored = await load(key, req.context);
  const candidates = await recurrenceCandidates(req.context);
  return recurring(stored.data.incident, candidates);
});
resolver.define("createCollective", async (req: Req) => {
  if (req.context.extension?.issue)
    throw new Error(
      "Open the global incident desk to create a collective incident",
    );
  const key = issueKey.parse(req.payload.key);
  const current = await load(key, req.context);
  await editable(key, req.context);
  const candidates = await recurrenceCandidates(req.context);
  const group = recurring(current.data.incident, candidates);
  if (!group.aggregated)
    throw new Error("No qualifying recurring group is available");
  const marker = `fh:collective:${await hash([...group.incidentIds].sort())}`;
  const prior = await kvs.get<string>(marker);
  if (prior) return view(prior, req.context);
  const issueResponse = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${key}?fields=project,issuetype`);
  if (!issueResponse.ok)
    throw new Error("Source incident metadata is unavailable");
  const issue = (await issueResponse.json()) as {
    fields: { project: { id: string }; issuetype: { id: string } };
  };
  const response = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        project: { id: issue.fields.project.id },
        issuetype: { id: issue.fields.issuetype.id },
        summary: `[Four Hours collective] ${group.incidentIds.join(" + ")}`,
        labels: ["four-hours-collective"],
      },
    }),
  });
  if (!response.ok)
    throw new Error(
      `Collective incident creation failed (HTTP ${response.status})`,
    );
  const created = (await response.json()) as { key: string };
  const data = await collectiveCase(
    current.data.incident,
    candidates,
    created.key,
    actor(req.context),
    new Date().toISOString(),
  );
  await store.save(created.key, data, 0);
  await kvs.set(marker, created.key);
  return view(created.key, req.context);
});
resolver.define("report", async (req: Req) =>
  reportFields(
    (await load(issueKey.parse(req.payload.key), req.context)).data,
    z
      .enum(["initial", "intermediate", "final", "reclassification", "gdpr"])
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
resolver.define("evidenceBundle", async (req: Req) =>
  evidenceBundle(
    (await load(issueKey.parse(req.payload.key), req.context)).data,
    new Date().toISOString(),
  ),
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
  assertOpen(stored.data);
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
resolver.define("refreshJiraObservations", async (req: Req) => {
  const key = issueKey.parse(req.payload.key);
  await editable(key, req.context);
  const stored = await load(key, req.context);
  const next = await refreshJiraObservations(
    stored.data,
    actor(req.context),
    new Date().toISOString(),
  );
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
  const candidates = await recurrenceCandidates(context);
  return recurring(current.data.incident, candidates);
}
