import api, { route } from "@forge/api";
import { importObservations } from "../core/observations";
import type { RecordState } from "../core/ledger";
export async function refreshJiraObservations(
  state: RecordState,
  actor: string,
  now: string,
): Promise<RecordState> {
  const response = await api
    .asUser()
    .requestJira(
      route`/rest/api/3/issue/${state.incident.id}/properties/four-hours-observations`,
    );
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "No four-hours-observations property is attached to this Jira incident. See the integration guide."
        : `Jira observations are unavailable (HTTP ${response.status})`,
    );
  const body = (await response.json()) as { value: unknown };
  const site = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
  if (!site.ok) throw new Error("Jira source URL is unavailable");
  const server = (await site.json()) as { baseUrl: string };
  return importObservations(
    state,
    body.value,
    `${server.baseUrl}/browse/${state.incident.id}`,
    actor,
    now,
  );
}
