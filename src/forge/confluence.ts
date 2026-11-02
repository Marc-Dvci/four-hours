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
const inline = (s: string) =>
  escape(s).replace(
    /(https:\/\/[^\s|<]+)/g,
    (url) => `<a href="${url}">${url}</a>`,
  );

/** Converts the workpaper's Markdown (headings, tables, lists, paragraphs) to Confluence storage format. */
export function toStorage(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        const cells = lines[i]!.slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const [head, ...body] = rows;
      out.push(
        `<table><tbody><tr>${(head ?? []).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>${body
          .map(
            (r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`,
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) {
        items.push(`<li>${inline(lines[i]!.slice(2))}</li>`);
        i++;
      }
      i--;
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (/^\d+\. /.test(line)) {
      const block = [line];
      while (i + 1 < lines.length && /^ {3}\S/.test(lines[i + 1]!))
        block.push(lines[++i]!.trim());
      out.push(`<p>${block.map(inline).join("<br/>")}</p>`);
    } else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  return out.join("");
}

export async function spaces(): Promise<{ id: string; name: string }[]> {
  const response = await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/spaces?limit=50`);
  if (!response.ok) {
    console.error(`Confluence spaces unavailable (HTTP ${response.status})`);
    return [];
  }
  const body = (await response.json()) as {
    results: { id: string; name: string; type: string }[];
  };
  return body.results
    .filter((s) => s.type !== "personal")
    .map((s) => ({ id: s.id, name: s.name }));
}

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
        title: `${state.incident.id} · ${state.incident.title} · workpaper revision ${state.revisions.length}`,
        body: { representation: "storage", value: toStorage(text) },
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
  // Full width reads better for the evidence tables. A failure here leaves the default width.
  await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/pages/${body.id}/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "content-appearance-published",
        value: "full-width",
      }),
    })
    .catch(() => undefined);
  return {
    id: body.id,
    url: `${body._links?.base ?? ""}${body._links?.webui ?? `/wiki/pages/${body.id}`}`,
  };
}
