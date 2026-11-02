# Setup

## Install

1. Open the installation link in the [README](../README.md), choose your site and approve the scopes for Jira and
   Confluence. Confluence is optional and used only for the workpaper.
2. Create a Jira Service Management space from the IT service management template. It provides the Incident work
   type and the "Report a system problem" request type that the demo uses. Any other Jira project also works; the
   demo incidents are then created as ordinary work items.

## First run

1. In Jira, open **Apps > Four Hours** and click **Set up the incident desk** (later, the gear at the top right of
   the desk opens the same **Incident desk settings**). The desk is also under **Jira settings > Apps > Four
   Hours**.
2. Under **Load the demo bank**, choose the project and click **Load demo bank**. Five incidents for a fictional
   bank are raised as JSM requests. Retrying resumes from the per-incident seed markers.
3. Open a demo work item and choose **Four Hours** from its apps button for the panel, or continue in the desk.
4. Inspect the critical-services gateway and six materiality groups. Expand a row to see each fact and its
   provenance.
5. Under **Risk officers**, a Jira administrator can save the Atlassian account IDs of risk officers. Configured
   officers and Jira project administrators can sign. Every write requires Jira Edit Issues permission, and the
   actor comes from the authenticated Forge context.
6. **Sign classification**, then **Confirm classification**, with the actual classification time and a rationale.
7. On **Reports**, prepare the stage and **Record submission** with its timestamp and authority reference. The
   next deadline starts from it.
8. Under **Confluence workpaper**, choose a space and **Publish current workpaper**. The current user's Confluence
   permissions apply.
9. **Reset the demo** deletes the demo incidents and their records, so the demo bank can be loaded again.

## Teamwork Graph

1. In admin.atlassian.com, open **Connected apps**, then **Four Hours > View app details > Connections**, and click
   **Connect** under "Teamwork Graph connectors".
2. On an incident's **Service context** tab, choose **Sync technical services**. The connector writes the technical
   service register as `atlassian:software-service` objects and checks item-level ingestion results. Disconnecting
   the connector removes the data ingested by that connection.
3. **Refresh graph evidence** reads the affected service back from Teamwork Graph and attaches its critical-function
   tag to the assessment as a cited fact. This creates a hashed revision and requires a new signature. A service
   without a critical-function mapping is refused rather than read as false.

## Real incidents

Click **Add incident** and enter an existing Jira key, the affected service and awareness time. Jira supplies the
title. Every classification fact starts as unknown. Edit each fact with a source URL and assessment; then set the
stable financial entity identifier (shared only within the same legal entity), occurrence time, apparent root
cause, service ID, reporting timezone and privacy awareness through **Edit incident context**.

Jira issue access controls apply to reads and writes. A bound issue panel only permits access to its own incident.
Population and recurrence checks omit records the current user cannot read. Concurrent writes use a version
condition inside a Forge storage transaction.

See [Jira observations](observations.md) for structured evidence import, [report coverage](report-fields.md) for
report fields and [evidence retention](evidence.md) for independent bundle verification.

## Build and deploy your own copy

Use Node 24.22.1 or newer and the Forge CLI (`npm install --global @forge/cli`).

```sh
npm ci
npm run audit
forge login
forge register "Four Hours"
npm run deploy
forge install -e production --product jira --site your-site.atlassian.net
forge install -e production --product confluence --site your-site.atlassian.net
```

## Offline preview

`npm ci && npm run dev` opens the same engine in the browser at http://127.0.0.1:4173 with five fictional incidents,
a fixed Paris clock and browser-local storage. `npm run test:browser` runs the 13 browser workflows against it.
