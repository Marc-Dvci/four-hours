import { graph, type types } from "@forge/teamwork-graph";
import { kvs } from "@forge/kvs";
import { z } from "zod";

export const TECHNICAL_SERVICES = [
  {
    id: "four-hours-urgent-payments",
    displayName: "Urgent payments · synthetic service",
    description:
      "Synthetic demonstration service. Depends on the settlement adapter.",
    tags: ["four-hours", "synthetic", "tier-1", "synthetic-critical-function"],
  },
  {
    id: "four-hours-settlement-adapter",
    displayName: "Settlement adapter · synthetic service",
    description: "Synthetic demonstration service for settlement connectivity.",
    tags: ["four-hours", "synthetic", "tier-1"],
  },
];
export function serviceObjects(
  baseUrl: string,
  now: string,
): types.SoftwareServiceObject[] {
  return TECHNICAL_SERVICES.map((s) => ({
    schemaVersion: "1.0",
    id: s.id,
    displayName: s.displayName,
    description: s.description,
    updateSequenceNumber: Date.parse(now),
    url: `${baseUrl}/jira/your-work`,
    createdAt: now,
    lastUpdatedAt: now,
    permissions: [
      {
        accessControls: [
          { principals: [{ type: "ATLASSIAN_WORKSPACE" as const }] },
        ],
      },
    ],
    "atlassian:software-service": {
      namespace: "four-hours-demo",
      environment: "synthetic",
      tier: "1",
      tags: s.tags,
    },
  }));
}
export async function syncServices(
  baseUrl: string,
): Promise<{ accepted: number; connectionId: string }> {
  const connectionId = await kvs.get<string>("fh:graph-connection");
  if (!connectionId)
    throw new Error(
      "Connect Four Hours in Atlassian Administration > Connected apps > Connections",
    );
  const response = await graph.setObjects({
    connectionId,
    objects: serviceObjects(baseUrl, new Date().toISOString()),
  });
  if (!response.success || (response.results?.rejected?.length ?? 0) > 0)
    throw new Error(
      "Teamwork Graph rejected one or more service objects; check the app logs",
    );
  const result = {
    accepted: response.results?.accepted?.length ?? 0,
    connectionId,
  };
  await kvs.set("fh:graph-status", { ...result, at: new Date().toISOString() });
  return result;
}
export async function onConnectionChange(event: unknown): Promise<void> {
  const schema = z.object({
    action: z.enum(["CREATED", "UPDATED", "DELETED"]),
    connectionId: z.string().min(1),
  });
  const parsed = schema.parse((event as { body?: unknown }).body ?? event);
  if (parsed.action === "DELETED") {
    if ((await kvs.get("fh:graph-connection")) === parsed.connectionId) {
      await kvs.delete("fh:graph-connection");
      await kvs.delete("fh:graph-status");
    }
  } else await kvs.set("fh:graph-connection", parsed.connectionId);
}

export async function serviceEvidence(serviceId: string) {
  if (serviceId !== "urgent-payments" && serviceId !== "settlement-adapter")
    throw new Error("No synthetic graph mapping exists for this service");
  const connectionId = await kvs.get<string>("fh:graph-connection");
  if (!connectionId)
    throw new Error("Connect and sync the technical service register first");
  const response = await graph.getObjectByExternalId({
    connectionId,
    objectType: "atlassian:software-service",
    externalId: `four-hours-${serviceId}`,
  });
  if (
    !response.success ||
    !response.object ||
    !("atlassian:software-service" in response.object)
  )
    throw new Error("The service is not yet available in Teamwork Graph");
  const object = response.object;
  const attributes = object["atlassian:software-service"];
  if (attributes.environment !== "synthetic")
    throw new Error(
      "This demonstration only reads the synthetic technical register",
    );
  const critical = attributes.tags?.includes("synthetic-critical-function");
  if (critical === undefined)
    throw new Error("Service metadata has no classification mapping");
  return {
    value: critical,
    source: `Teamwork Graph · ${object.displayName}`,
    url: object.url,
    observedAt: new Date().toISOString(),
    quality: "synthetic" as const,
  };
}
