import api, { route } from "@forge/api";
import { z } from "zod";
export const issueKey = z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/);
export type RequestContext = {
  accountId?: string;
  extension?: { issue?: { key?: string } };
  [key: string]: unknown;
};
export function actor(context: RequestContext): string {
  if (!context.accountId) throw new Error("Sign in to Atlassian to continue");
  return context.accountId;
}
export async function readable(
  key: string,
  context: RequestContext,
): Promise<void> {
  actor(context);
  issueKey.parse(key);
  const bound = context.extension?.issue?.key;
  if (bound && bound !== key)
    throw new Error("Open the requested incident in its own Jira panel");
  const r = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${key}?fields=summary`);
  if (!r.ok)
    throw new Error(
      "This incident is unavailable or you do not have permission to read it",
    );
}
export async function permission(name: string, key?: string): Promise<boolean> {
  const r = key
    ? await api
        .asUser()
        .requestJira(
          route`/rest/api/3/mypermissions?issueKey=${key}&permissions=${name}`,
        )
    : await api
        .asUser()
        .requestJira(route`/rest/api/3/mypermissions?permissions=${name}`);
  if (!r.ok) return false;
  const body = (await r.json()) as {
    permissions?: Record<string, { havePermission: boolean }>;
  };
  return body.permissions?.[name]?.havePermission === true;
}
export async function editable(
  key: string,
  context: RequestContext,
): Promise<void> {
  await readable(key, context);
  if (!(await permission("EDIT_ISSUES", key)))
    throw new Error("Jira Edit Issues permission is required");
}
export async function admin(context: RequestContext): Promise<void> {
  actor(context);
  if (!(await permission("ADMINISTER")))
    throw new Error("Jira administrator permission is required");
}
