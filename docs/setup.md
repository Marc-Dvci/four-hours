# Setup

## Credential-free replay

Use Node 24.22.1 or newer in a supported Forge release line.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Five synthetic incidents load automatically. The replay uses a fixed Paris clock and browser-local storage. Settings advances the clock or resets the replay. The deterministic engine is the same engine used by Forge.

```sh
npm run audit
npm run test:browser
```

CI downloads Playwright Chromium. Locally, the browser tests use installed Chrome. Set `CI=true` to use Playwright Chromium locally as well.

Docker serves the same static replay:

```sh
docker build -t four-hours .
docker run --rm -p 4173:80 four-hours
```

## Forge installation

Deployment is locked by the zero-spend policy. Read [Cost controls](COSTS.md) before registering or installing. A verified provider billing protection is required. Install the Forge CLI separately with `npm install --global @forge/cli@15.0.0`.

`manifest.yml` is the infrastructure definition. Its initial UUID is a registration placeholder. Replace it using your own Forge registration before deployment.

```sh
npm run build
forge login
forge register "Four Hours"
forge lint
npm run deploy:forge -- development
forge install --environment development --product jira --site your-site.atlassian.net
```

Forge registration may require accepting usage-based billing terms for a Developer Space. Review those terms and the space's current billing settings. The app uses Forge functions, storage and connector APIs; Rovo features use the installation's Rovo entitlement.

Optionally install into Confluence on the same site:

```sh
forge install --environment development --product confluence --site your-site.atlassian.net
```

## First run

1. In Jira, open Apps > Four Hours. Open Settings, select a project you administer and click Load demo bank. This creates five labelled synthetic work items. Retrying resumes from the per-incident seed markers.
2. Open a demo work item and use Apps > Four Hours for its panel, or continue in the global incident desk.
3. Inspect the critical-services gateway and six materiality groups. Expand a row to inspect each fact and its provenance.
4. Sign as a Jira project administrator. Every write requires Jira Edit Issues permission. The actor comes from the authenticated Forge context.
5. On Reports, prepare the appropriate stage. Record a genuine submission with its actual timestamp and authority reference. In the synthetic demo, use a clearly labelled demo reference.
6. On Evidence trail, export the workpaper. To publish it to Confluence, enter the target space's numeric ID in Settings. The current user's Confluence permissions apply.

## Real incidents

Click Add incident and enter an existing Jira key, the affected service and awareness time. Jira supplies the title. Every classification fact starts as unknown. Edit each fact with a source URL and assessment; then set occurrence time, apparent root cause, service ID, reporting timezone and privacy awareness through Edit incident context.

Jira issue access controls apply to reads and writes. A bound issue panel only permits access to its own incident. Global population and recurrence checks omit records the current user cannot read. Concurrent writes use a version condition inside a Forge storage transaction.

## Teamwork Graph

In Atlassian Administration > Connected apps > Four Hours > Connections, connect Four Hours. On the Service context tab, choose Sync technical services. The connector indexes two synthetic technical software-service objects and inspects item-level ingestion results. The admin can disconnect the connector to remove all data ingested by that connection. Sync uses upserts; source deletion is handled by disconnecting the synthetic connection.

Use Refresh graph evidence to read the synthetic service back from Teamwork Graph and attach its mapped critical-function evidence to the assessment. This creates a hashed revision and requires a new signature.

The dependency drawing is the labelled synthetic replay model. Ingestion acceptance and search indexing are separate platform states. The product reports the accepted count, without claiming search indexing has completed.

## Rovo and MCP

The Rovo agent has two read-only actions: incident evidence and recurrence. It explains deterministic results and proposes narratives citing fact IDs. Paste drafts into the Reports validator for numeric and citation checks, then review their wording against the evidence.

For an MCP client, an administrator enables tool exposure on the installed app. Connect the client to `https://mcp.atlassian.com/forge/<registered-app-id>`. The two tools use the authenticated caller's Jira access. Classification signatures and submission receipts remain human actions in the interface.

## Distribution

After production deployment, enable sharing in the Forge developer console and copy its installation link into the submission document. Privacy and terms documents are in `docs/`. A verified installation link and a target-platform demonstration are release requirements.
