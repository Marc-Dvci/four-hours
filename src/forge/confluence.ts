import api, { route } from "@forge/api";
import { z } from "zod";
import { workpaper } from "../core/reports";
import type { RecordState } from "../core/ledger";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function publishWorkpaper(
  state: RecordState,
  spaceId: string,
): Promise<{ id: string; url: string }> {
  z.string().regex(/^\d+$/).parse(spaceId);
  const text = await workpaper(state);
  const response = await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId,
        status: "current",
        title: `Four Hours · ${state.incident.id} · revision ${state.revisions.length} · ${new Date().toISOString()}`,
        body: {
          representation: "storage",
          value: `<h1>Incident workpaper</h1><pre>${escape(text)}</pre>`,
        },
      }),
    });
  if (!response.ok)
    throw new Error(
      `Confluence could not publish the workpaper (HTTP ${response.status})`,
    );
  const body = (await response.json()) as {
    id: string;
    _links?: { webui?: string; base?: string };
  };
  return {
    id: body.id,
    url: `${body._links?.base ?? ""}${body._links?.webui ?? `/wiki/pages/${body.id}`}`,
  };
}
