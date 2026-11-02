import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as client from "./client";
import { type FactKey, type Verdict } from "../core/model";
import { initialDeadline, nextDeadline, type ReportKind } from "../core/clocks";
import { REPORT_DETAILS, type DetailCode } from "../core/report-details";
import { makeIncident, serviceGraph } from "../demo/bank";
import type { ReportField } from "../core/reports";
import type { RecurrenceResult } from "../core/recurrence";
import "./style.css";

type Tab = "classification" | "dependencies" | "reports" | "history";
const LABELS: Record<Tab, string> = {
  classification: "Classification",
  dependencies: "Service context",
  reports: "Reports",
  history: "Evidence trail",
};
const human = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const num = new Intl.NumberFormat("en-GB");
const BOOLEAN_FIELDS = new Set([
  "criticalFunction",
  "authorisedService",
  "maliciousCriticalAccess",
  "relevantClientsAffected",
  "mediaCoverage",
  "repeatedComplaints",
  "regulatoryFailure",
  "materialClientLoss",
  "dataAdverseImpact",
  "maliciousAccessPotentialLoss",
  "personalDataBreach",
  "gdprRiskUnlikely",
]);
const time = (s: string, full = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    ...(full ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(s));
const isoLocal = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function valueText(value: unknown) {
  return value === null
    ? "Not recorded"
    : Array.isArray(value)
      ? value.join(" · ")
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : typeof value === "number"
          ? num.format(value)
          : String(value);
}
function verdictLabel(v: Verdict) {
  return v === "MAJOR"
    ? "Major incident"
    : v === "NOT_MAJOR"
      ? "Below major thresholds"
      : "Evidence incomplete";
}
function Status({ value }: { value: Verdict }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      <span aria-hidden="true">
        {value === "MAJOR" ? "●" : value === "INCOMPLETE" ? "◐" : "○"}
      </span>
      {value === "MAJOR"
        ? "MAJOR"
        : value === "NOT_MAJOR"
          ? "NOT MAJOR"
          : "INCOMPLETE"}
    </span>
  );
}
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function Modal({
  title,
  onClose,
  children,
  error,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const prior = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => {
      el?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}

function App() {
  const [app, setApp] = useState<client.Bootstrap | null>(null);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<Tab>("classification");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
    | "sign"
    | "edit"
    | "submit"
    | "settings"
    | "create"
    | "context"
    | "report-field"
    | null
  >(null);
  const [field, setField] = useState<FactKey>("affectedClients");
  const [draftValue, setDraftValue] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rationale, setRationale] = useState(
    "Critical payment execution is affected. Client impact, service downtime and cross-border impact exceed the recorded thresholds.",
  );
  const [classifiedAt, setClassifiedAt] = useState("");
  const [detailCode, setDetailCode] = useState<DetailCode>("entity-name");
  const [detailValue, setDetailValue] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [reportKind, setReportKind] = useState<ReportKind>("initial");
  const [report, setReport] = useState<ReportField[]>([]);
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceResult | null>(null);
  const [node, setNode] = useState("urgent-payments");
  const [narrative, setNarrative] = useState("");
  const [narrativeResult, setNarrativeResult] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
  const [officers, setOfficers] = useState("");
  const [space, setSpace] = useState("");
  const [spaceList, setSpaceList] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [newKey, setNewKey] = useState("");
  const [newService, setNewService] = useState("");
  const [newAwareness, setNewAwareness] = useState("");
  const [query, setQuery] = useState("");
  const [contextDraft, setContextDraft] = useState({
    entityId: "installation-entity",
    service: "",
    serviceId: "",
    rootCause: "",
    occurredAt: "",
    awarenessAt: "",
    privacyAwarenessAt: "",
    entity: "credit-institution",
    timezone: "Europe/Paris",
    recurrenceExempt: false,
  });
  const row = app?.records.find((r) => r.data.incident.id === selected);
  const state = row?.data;
  const incident = state?.incident;
  const assessment = incident ? client.classify(incident) : null;
  const stale = Boolean(
    row &&
    state?.signature &&
    state.signature.evidenceHash !== row.evidenceHash,
  );
  const currentClocks =
    state && app
      ? client.clocks(state.incident, state.signature, state.receipts, app.now)
      : [];
  const active = nextDeadline(currentClocks);
  const reportingClosed =
    !!state?.receipts.some(
      (r) => r.kind === "final" || r.kind === "reclassification",
    ) && !active;
  const signedNonMajor =
    state?.signature?.verdict === "NOT_MAJOR" &&
    !state.signature.majorClassifiedAt;
  const clockDue =
    active?.dueAt ??
    (!state?.signature && incident && app
      ? initialDeadline(incident.awarenessAt, app.now).dueAt
      : null);
  const remaining =
    app && clockDue ? Math.abs(Date.parse(clockDue) - Date.parse(app.now)) : 0;
  const hh = Math.floor(remaining / 3600000)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor(remaining / 60000) % 60;
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      const issues = (e as { issues?: { path: unknown[]; message: string }[] })
        .issues;
      setError(
        issues?.length
          ? issues.map((i) => `${i.path.join(" ")}: ${i.message}`).join(". ")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const data = await client.bootstrap();
    setApp(data);
    setSelected((s) =>
      data.records.some((r) => r.data.incident.id === s)
        ? s
        : (data.boundKey ?? data.records[0]?.data.incident.id ?? ""),
    );
  }
  useEffect(() => {
    void task(refresh);
  }, []);
  useEffect(() => {
    if (!app || app.mode === "replay") return;
    const id = window.setInterval(
      () => setApp((a) => (a ? { ...a, now: new Date().toISOString() } : a)),
      10000,
    );
    return () => clearInterval(id);
  }, [app?.mode]);
  useEffect(() => {
    setRecurrence(null);
    setExpanded(null);
    setNarrativeResult("");
  }, [selected]);
  useEffect(() => {
    setRecurrence(null);
    setNarrativeResult("");
  }, [row?.version]);
  useEffect(() => {
    let current = true;
    setReport([]);
    if (selected && tab === "reports")
      void client.getReport(selected, reportKind).then(
        (fields) => {
          if (current) setReport(fields);
        },
        (failure) => {
          if (current)
            setError(
              failure instanceof Error ? failure.message : String(failure),
            );
        },
      );
    return () => {
      current = false;
    };
  }, [selected, tab, reportKind, row?.version]);
  async function mutate(
    action: "sign" | "evidence" | "submit" | "context" | "report-field",
    payload: Record<string, unknown>,
  ) {
    if (!row) return;
    const next = await client.mutation(selected, row.version, action, payload);
    setApp((a) =>
      a
        ? {
            ...a,
            records: a.records.map((r) =>
              r.data.incident.id === selected ? next : r,
            ),
          }
        : a,
    );
    setModal(null);
    setNotice(
      action === "sign"
        ? "Classification signed. Reporting deadlines are now recorded."
        : action === "submit"
          ? "Authority submission receipt recorded."
          : "Evidence updated. Review the assessment before signing.",
    );
  }
  function select(key: string) {
    setSelected(key);
    setNotice("");
    setError("");
  }
  function edit(k: FactKey) {
    if (!incident) return;
    setField(k);
    setDraftValue(
      incident.facts[k].value === null
        ? ""
        : Array.isArray(incident.facts[k].value)
          ? (incident.facts[k].value as string[]).join(", ")
          : String(incident.facts[k].value),
    );
    setSource(incident.facts[k].source);
    setSourceUrl(incident.facts[k].url);
    setModal("edit");
  }
  function editDetail(code: DetailCode) {
    setDetailCode(code);
    setDetailValue(state?.reportDetails?.[code]?.value ?? "");
    setSource(
      state?.reportDetails?.[code]?.source ?? "Officer incident workpaper",
    );
    setSourceUrl(
      state?.reportDetails?.[code]?.url ??
        incident?.facts.criticalFunction.url ??
        "https://demo.example/evidence",
    );
    setModal("report-field");
  }
  async function download() {
    const text = await client.exportWorkpaper(selected);
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `four-hours-${selected.toLowerCase()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Workpaper exported with the evidence register and revision hashes.",
    );
  }
  function downloadText(text: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadBundle() {
    const bundle = await client.exportEvidenceBundle(selected);
    downloadText(
      JSON.stringify(bundle, null, 2),
      `four-hours-${selected.toLowerCase()}-evidence.json`,
      "application/json",
    );
    setNotice(
      `Evidence bundle exported. Retain its digest separately: ${bundle.bundleHash}`,
    );
  }
  async function downloadReport() {
    const fields = await client.getReport(selected, reportKind);
    downloadText(
      JSON.stringify(
        {
          format: "four-hours.report-draft.v1",
          incident: selected,
          kind: reportKind,
          preparedAt: app!.now,
          classificationCurrent: Boolean(state?.signature && !stale),
          missing: fields
            .filter((f) => f.value === "Evidence required")
            .map((f) => f.label),
          fields,
        },
        null,
        2,
      ),
      `four-hours-${selected.toLowerCase()}-${reportKind}-draft.json`,
      "application/json",
    );
    setNotice(
      "Working draft exported. Review the listed gaps and the competent authority’s current form.",
    );
  }
  const filtered =
    app?.records.filter((r) =>
      `${r.data.incident.id} ${r.data.incident.title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <div className={`app-shell${app?.boundKey ? " bound" : ""}`}>
      <a className="skip-link" href="#incident-main">
        Skip to incident
      </a>
      {!app?.boundKey && (
        <>
          <header className="topbar">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setTab("classification");
              }}
              aria-label="Four Hours incident desk"
            >
              <span className="brand-clock" aria-hidden="true">
                ◷
              </span>
              <strong>
                four hours<span className="brand-dot">.</span>
              </strong>
            </a>
            <span className="top-divider" />
            <span className="top-caption">THE INCIDENT DESK</span>
            <div className="top-right">
              <span className={`mode ${app?.mode === "forge" ? "live" : ""}`}>
                <i />
                {app?.mode === "forge"
                  ? "FORGE · LIVE SITE"
                  : "SYNTHETIC REPLAY"}
              </span>
              <span className="top-time">
                {app ? time(app.now, true) : "Loading"} <small>PARIS</small>
              </span>
              <button
                className="icon-button"
                aria-label="Open settings"
                onClick={() => {
                  setModal("settings");
                  if (client.isForge)
                    void task(async () => {
                      setProjects(await client.forgeCall("projects"));
                      setSpaceList(await client.forgeCall("spaces"));
                      const settings = await client.forgeCall<{
                        officers: string[];
                      }>("settings");
                      setOfficers(settings.officers.join("\n"));
                    });
                }}
              >
                ⚙
              </button>
            </div>
          </header>
          <aside className="sidebar" aria-label="Incident list">
            <div className="sidebar-heading">
              <span>INCIDENT REGISTER</span>
              <span>{app?.records.length ?? "00"}</span>
            </div>
            <div className="sidebar-title">
              Stay ahead
              <br />
              of the clock.
            </div>
            <p className="sidebar-subtitle">
              One incident. Every criterion.
              <br />A traceable decision.
            </p>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Find an incident"
                placeholder="Find an incident"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <nav aria-label="Incidents">
              {filtered.map((r) => {
                const i = r.data.incident;
                const a = client.classify(i);
                return (
                  <button
                    key={i.id}
                    className={`incident-item ${selected === i.id ? "selected" : ""}`}
                    aria-current={selected === i.id ? "page" : undefined}
                    onClick={() => select(i.id)}
                  >
                    <span className="incident-item-top">
                      <strong>{i.id}</strong>
                      <span
                        className={`incident-dot ${a.verdict.toLowerCase()}`}
                        aria-label={a.verdict}
                      />
                    </span>
                    <span className="incident-item-title">{i.title}</span>
                    <span className="incident-item-service">{i.service}</span>
                  </button>
                );
              })}
            </nav>
            {!filtered.length && (
              <p className="empty-small">
                {query
                  ? "No matching incident."
                  : "Load the demo or add an incident to begin."}
              </p>
            )}
            <button
              className="add-incident"
              onClick={() => {
                setNewAwareness(isoLocal(app?.now ?? new Date().toISOString()));
                setModal("create");
              }}
            >
              + Add incident
            </button>
            <div className="sidebar-bottom">
              <span className="sidebar-rule" />
              <span className="eyebrow">DORA · 2024/1772</span>
              <p>
                The evidence makes the case.
                <br />
                The officer makes the decision.
              </p>
              <button
                className="text-button"
                onClick={() => void task(refresh)}
              >
                Refresh register ↻
              </button>
            </div>
          </aside>
        </>
      )}
      <main id="incident-main" className="main" tabIndex={-1}>
        <div aria-live="polite" className="messages">
          {error && (
            <div className="message error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="message success">
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )}
        </div>
        {busy && !app ? (
          <div className="loading">Opening the incident desk…</div>
        ) : !incident || !assessment ? (
          <section className="welcome">
            <span className="eyebrow">FOUR HOURS / GET STARTED</span>
            <h1>
              Your first decision
              <br />
              starts with evidence.
            </h1>
            <p>
              Load five synthetic incidents into a Jira project, or add a real
              incident with its evidence.
            </p>
            <button
              className="primary"
              onClick={() => {
                setModal("settings");
                if (client.isForge)
                  void task(async () => {
                    setProjects(await client.forgeCall("projects"));
                    setSpaceList(await client.forgeCall("spaces"));
                    const settings = await client.forgeCall<{
                      officers: string[];
                    }>("settings");
                    setOfficers(settings.officers.join("\n"));
                  });
              }}
            >
              Set up the incident desk <Arrow />
            </button>
          </section>
        ) : (
          <>
            <div className="breadcrumb">
              <span>OPERATIONS</span>
              <span>/</span>
              <span>ICT INCIDENTS</span>
              <span>/</span>
              <strong>{incident.id}</strong>
              <span className="breadcrumb-end">
                {incident.synthetic
                  ? "Fictional bank · demonstration evidence"
                  : "Jira Service Management · incident evidence"}
              </span>
            </div>
            <section className="incident-heading">
              <div>
                <div className="title-meta">
                  <span className="incident-key">{incident.id}</span>
                  <Status value={assessment.verdict} />
                </div>
                <h1>{incident.title}</h1>
                <p>
                  <span className="service-pill">▱ {incident.service}</span>
                  <span>Aware at {time(incident.awarenessAt)} Paris</span>
                  <span>
                    Officer review {state?.signature ? "signed" : "pending"}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setContextDraft({
                        entityId: incident.entityId,
                        service: incident.service,
                        serviceId: incident.serviceId,
                        rootCause: incident.rootCause,
                        occurredAt: isoLocal(incident.occurredAt),
                        awarenessAt: isoLocal(incident.awarenessAt),
                        privacyAwarenessAt: incident.privacyAwarenessAt
                          ? isoLocal(incident.privacyAwarenessAt)
                          : "",
                        entity: incident.entity,
                        timezone: incident.timezone,
                        recurrenceExempt: incident.recurrenceExempt,
                      });
                      setModal("context");
                    }}
                  >
                    Edit incident context
                  </button>
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void task(downloadBundle)}
                >
                  Evidence bundle <Arrow />
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void task(download)}
                >
                  Export workpaper <Arrow />
                </button>
              </div>
            </section>
            <section
              className={`clock-band ${active?.status === "overdue" ? "overdue" : ""}`}
              aria-label="Reporting deadlines"
            >
              <div className="clock-main">
                <span className="eyebrow">
                  {active
                    ? active.label.toUpperCase() +
                      (active.status === "overdue" ? " OVERDUE" : " DUE")
                    : reportingClosed
                      ? "REPORTING CLOSED"
                      : signedNonMajor
                        ? "SIGNED / NOT MAJOR"
                        : "ON MAJOR CLASSIFICATION"}
                </span>
                <div className="clock-digits">
                  {reportingClosed || (signedNonMajor && !active) ? (
                    <span className="clock-recorded">
                      {reportingClosed ? "DONE" : "N/A"}
                    </span>
                  ) : (
                    <>
                      {Number(hh) >= 100 ? (
                        <span className="clock-days">
                          {Math.floor(Number(hh) / 24)}d {Number(hh) % 24}h
                        </span>
                      ) : (
                        <>
                          {hh}
                          <span>:</span>
                          {mm.toString().padStart(2, "0")}
                        </>
                      )}
                      <small>
                        {active?.status === "overdue"
                          ? "OVERDUE BY"
                          : state?.signature
                            ? "REMAINING"
                            : "WINDOW"}
                      </small>
                    </>
                  )}
                </div>
                <span className="clock-caption">
                  {active
                    ? `Due ${time(active.dueAt!, true)} Paris`
                    : reportingClosed
                      ? "DORA reporting closed; the privacy workflow is tracked separately"
                      : signedNonMajor
                        ? "Monitoring and recurrence review remain open"
                        : "Record the actual classification time when signing"}
                </span>
              </div>
              <div className="clock-rule">
                <span className="eyebrow">THE FOUR-HOUR RULE</span>
                <p>
                  Classify with evidence.
                  <br />
                  Notify with confidence.
                </p>
                <span>
                  Within 4h of classification, subject to the awareness limit.
                </span>
                <a
                  href="https://eur-lex.europa.eu/eli/reg_del/2025/301/oj/eng"
                  target="_blank"
                  rel="noreferrer"
                >
                  2025/301 · Article 5 <Arrow />
                </a>
              </div>
              <div className="next-clocks">
                {currentClocks
                  .filter((c) =>
                    active ? c.id !== active.id : c.id !== "initial",
                  )
                  .map((c) => (
                    <div key={c.id}>
                      <span>{c.label}</span>
                      <strong>
                        {c.dueAt
                          ? time(c.dueAt, true)
                          : c.id === "intermediate"
                            ? "+72 hours"
                            : c.id === "final"
                              ? "+1 month"
                              : "Assess breach"}
                      </strong>
                      <small>
                        {c.status === "waiting"
                          ? "After " +
                            (c.id === "final"
                              ? "latest intermediate report"
                              : c.id === "intermediate"
                                ? "initial submission"
                                : "privacy assessment")
                          : c.late
                            ? "SUBMITTED LATE"
                            : c.status.toUpperCase()}
                      </small>
                    </div>
                  ))}
              </div>
            </section>
            <div className="journey" aria-label="Incident progress">
              {[
                {
                  label: "Incident awareness",
                  detail: time(incident.awarenessAt),
                  done: true,
                },
                {
                  label: "Evidence assessed",
                  detail: `${assessment.criteria.length} criteria`,
                  done: true,
                },
                {
                  label: "Officer classification",
                  detail: state?.signature
                    ? time(state.signature.signedAt)
                    : "Awaiting signature",
                  done: !!state?.signature,
                },
                {
                  label: "Authority notification",
                  detail: state?.receipts.length
                    ? "Receipt recorded"
                    : "Awaiting submission",
                  done: !!state?.receipts.length,
                },
              ].map((s, n) => (
                <div
                  className={`journey-step ${s.done ? "done" : ""}`}
                  key={s.label}
                >
                  <span className="step-number">
                    {s.done ? "✓" : String(n + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{s.label}</strong>
                    <small>{s.detail}</small>
                  </span>
                </div>
              ))}
            </div>
            <nav className="tabs" aria-label="Incident sections">
              {(Object.keys(LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  aria-current={tab === t ? "page" : undefined}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {LABELS[t]}
                  {t === "history" && <span>{state?.revisions.length}</span>}
                </button>
              ))}
              <span className="tabs-version">
                RULESET {assessment.ruleVersion}
              </span>
            </nav>
            {stale && (
              <div className="message warning">
                Evidence changed after signature. Review and sign the updated
                assessment. The original major-classification clock is
                preserved.
              </div>
            )}
            {Date.parse(app!.now) - Date.parse(incident.assessedAt) >
              3600000 && (
              <div className="message warning">
                This assessment is more than one hour old. Check duration,
                downtime and changing impact before relying on the recorded
                decision.
              </div>
            )}
            {tab === "classification" && (
              <div className="classification-layout">
                <section className="criteria">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">01 / THE ASSESSMENT</span>
                      <h2>Seven criteria. One decision.</h2>
                    </div>
                    <span className="criteria-counter">
                      <strong>{assessment.metGroups}</strong> of 6 groups met
                    </span>
                  </div>
                  <div className="observation-actions">
                    <span>
                      Evidence assessed {time(incident.assessedAt, true)} Paris
                    </span>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          if (!client.isForge) {
                            setNotice(
                              "The replay contains synthetic observations. In Forge, this action imports the incident structured four-hours-observations property.",
                            );
                            return;
                          }
                          await client.forgeCall("refreshJiraObservations", {
                            key: selected,
                          });
                          await refresh();
                          setNotice(
                            "Jira observations imported as a single evidence revision. Review the assessment.",
                          );
                        })
                      }
                    >
                      Import Jira observations <Arrow />
                    </button>
                  </div>
                  <div className="criterion-columns">
                    <span>CRITERION / THRESHOLD</span>
                    <span>ASSESSMENT</span>
                  </div>
                  {assessment.criteria.map((c, n) => (
                    <div
                      className={`criterion ${expanded === c.id ? "open" : ""}`}
                      key={c.id}
                    >
                      <button
                        className="criterion-toggle"
                        onClick={() =>
                          setExpanded(expanded === c.id ? null : c.id)
                        }
                        aria-expanded={expanded === c.id}
                      >
                        <span className="criterion-number">
                          {String(n + 1).padStart(2, "0")}
                        </span>
                        <span className="criterion-copy">
                          <strong>{c.label}</strong>
                          <small>
                            {c.reference}{" "}
                            {c.id === "critical" ? "· GATEWAY" : ""}
                          </small>
                        </span>
                        <span
                          className={`criterion-result ${c.met === true ? "met" : c.met === null ? "unknown" : "below"}`}
                        >
                          {c.met === null
                            ? "EVIDENCE NEEDED"
                            : c.met
                              ? "THRESHOLD MET"
                              : "BELOW THRESHOLD"}
                        </span>
                        <span aria-hidden="true" className="expand-icon">
                          {expanded === c.id ? "−" : "+"}
                        </span>
                      </button>
                      {expanded === c.id && (
                        <div className="criterion-detail">
                          <p className="threshold">{c.threshold}</p>
                          <dl>
                            {c.keys.map((k) => (
                              <div className="fact" key={k}>
                                <dt>
                                  {human(k)}
                                  <small>
                                    {incident.facts[k].source} ·{" "}
                                    {time(incident.facts[k].observedAt)} ·{" "}
                                    {incident.facts[k].quality}
                                  </small>
                                </dt>
                                <dd>
                                  <strong>
                                    {valueText(incident.facts[k].value)}
                                  </strong>
                                  <button
                                    className="edit-fact"
                                    aria-label={`Edit ${human(k)}`}
                                    onClick={() => edit(k)}
                                  >
                                    Edit
                                  </button>
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <a
                            href="https://eur-lex.europa.eu/eli/reg_del/2024/1772/oj/eng"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Read the classification standard <Arrow />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="criterion-footnote">
                    Critical services is the gateway. Major classification needs
                    the special access route or two materiality groups.
                  </p>
                </section>
                <aside className="decision">
                  <span className="eyebrow">02 / OFFICER DECISION</span>
                  <div
                    className={`decision-symbol ${assessment.verdict.toLowerCase()}`}
                    aria-hidden="true"
                  >
                    {assessment.verdict === "MAJOR"
                      ? "↗"
                      : assessment.verdict === "INCOMPLETE"
                        ? "?"
                        : "✓"}
                  </div>
                  <h2>{verdictLabel(assessment.verdict)}</h2>
                  <p>{assessment.explanation}</p>
                  <div className="decision-facts">
                    <div>
                      <span>Critical services</span>
                      <strong>
                        {assessment.criteria[0]?.met === true
                          ? "Affected"
                          : assessment.criteria[0]?.met === false
                            ? "Not affected"
                            : "Unknown"}
                      </strong>
                    </div>
                    <div>
                      <span>Materiality groups</span>
                      <strong>
                        {assessment.metGroups} met
                        {assessment.unknownGroups
                          ? ` · ${assessment.unknownGroups} unknown`
                          : ""}
                      </strong>
                    </div>
                    <div>
                      <span>Decision owner</span>
                      <strong>
                        {state?.signature?.actor &&
                        state.signature.actor !== app?.actor
                          ? state.signature.actor
                          : app?.displayName}
                      </strong>
                    </div>
                  </div>
                  {state?.signature && !stale ? (
                    <div className="signed">
                      <strong>✓ Classification signed</strong>
                      <span>{time(state.signature.signedAt, true)} Paris</span>
                      <small>Evidence bound to SHA-256</small>
                    </div>
                  ) : (
                    <button
                      className="primary sign-button"
                      disabled={
                        busy ||
                        assessment.verdict === "INCOMPLETE" ||
                        !row?.chainValid
                      }
                      onClick={() => {
                        setRationale(assessment.explanation);
                        setClassifiedAt(isoLocal(app!.now));
                        setModal("sign");
                      }}
                    >
                      Sign classification <Arrow />
                    </button>
                  )}
                  {assessment.verdict === "INCOMPLETE" && (
                    <p className="small-note">
                      Complete the missing evidence to sign.
                    </p>
                  )}
                  <p className="small-note">
                    Your signature records the classification.
                    <br />
                    It also starts the applicable reporting clock.
                  </p>
                  <div className="recurrence-callout">
                    <span className="eyebrow">THE SIX-MONTH CHECK</span>
                    <h3>Seen this before?</h3>
                    <p>Small incidents can become major together.</p>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          setRecurrence(await client.getRecurrence(selected));
                        })
                      }
                    >
                      Check recurring incidents <Arrow />
                    </button>
                    {recurrence && (
                      <div className="recurrence-result" role="status">
                        {recurrence.assessment && (
                          <Status value={recurrence.assessment.verdict} />
                        )}
                        <p>{recurrence.reason}</p>
                        {recurrence.incidentIds.length > 0 && (
                          <p>{recurrence.incidentIds.join(" + ")}</p>
                        )}
                        {recurrence.aggregated &&
                          recurrence.assessment?.verdict === "MAJOR" && (
                            <button
                              className="secondary"
                              disabled={busy || !!app?.boundKey}
                              onClick={() =>
                                void task(async () => {
                                  const group =
                                    await client.createCollective(selected);
                                  await refresh();
                                  setSelected(group.data.incident.id);
                                  setNotice(
                                    "Collective incident created. The individual source records remain unchanged.",
                                  );
                                })
                              }
                            >
                              Create collective incident
                            </button>
                          )}
                        {app?.boundKey && (
                          <p>
                            Open the global incident desk to create a collective
                            record.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            )}
            {tab === "dependencies" && (
              <section className="dependencies">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">CONTEXT / CONNECTIONS</span>
                    <h2>Follow the affected service.</h2>
                  </div>
                  <span className="source-tag">
                    {incident.synthetic
                      ? "SYNTHETIC DEPENDENCY MODEL"
                      : "SERVICE CONTEXT"}
                  </span>
                </div>
                {incident.synthetic &&
                incident.serviceId === "urgent-payments" ? (
                  <>
                    <div className="service-map">
                      <div className="map-lane">
                        <span>INCIDENT</span>
                        <button
                          onClick={() => setNode("FH-482")}
                          className={node === "FH-482" ? "chosen" : ""}
                        >
                          {incident.id}
                          <small>Payments interruption</small>
                        </button>
                      </div>
                      <span className="map-arrow">→</span>
                      <div className="map-lane">
                        <span>AFFECTED SERVICE</span>
                        <button
                          onClick={() => setNode("urgent-payments")}
                          className={node === "urgent-payments" ? "chosen" : ""}
                        >
                          Urgent payments<small>Tier 1 · Operations</small>
                        </button>
                        <button
                          onClick={() => setNode("cif-004")}
                          className={node === "cif-004" ? "chosen" : ""}
                        >
                          Payment execution
                          <small>Critical or important function</small>
                        </button>
                      </div>
                      <span className="map-arrow">→</span>
                      <div className="map-lane">
                        <span>DEPENDENCIES & IMPACT</span>
                        {serviceGraph.nodes
                          .filter((n) =>
                            [
                              "settlement-adapter",
                              "release-29",
                              "FR",
                              "DE",
                              "NL",
                            ].includes(n.id),
                          )
                          .map((n) => (
                            <button
                              key={n.id}
                              onClick={() => setNode(n.id)}
                              className={node === n.id ? "chosen" : ""}
                            >
                              {n.label}
                              <small>
                                {n.kind === "deployment"
                                  ? "Recent deployment"
                                  : n.kind === "country"
                                    ? "Affected clients"
                                    : "Technical dependency"}
                              </small>
                            </button>
                          ))}
                      </div>
                    </div>
                    <div className="node-detail">
                      <span className="eyebrow">SELECTED CONNECTION</span>
                      <h3>
                        {serviceGraph.nodes.find((n) => n.id === node)?.label}
                      </h3>
                      <p>
                        {serviceGraph.nodes.find((n) => n.id === node)?.detail}
                      </p>
                      <small>
                        Dependency links provide context. An investigation
                        establishes the cause.
                      </small>
                    </div>
                  </>
                ) : (
                  <p>
                    Add service evidence to the classification rows. Connector
                    ingestion is scoped to approved technical metadata.
                  </p>
                )}
                <div className="integration-strip">
                  <div>
                    <strong>Teamwork Graph connector</strong>
                    <p>
                      {app?.graphStatus
                        ? `${app.graphStatus.accepted} technical services accepted · ${time(app.graphStatus.at, true)}`
                        : "Index the synthetic technical service register in Atlassian Teamwork Graph."}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        if (!client.isForge) {
                          setNotice(
                            "The connector runs in the Forge installation. This replay shows the synthetic dependency model.",
                          );
                          return;
                        }
                        const result = await client.forgeCall<{
                          accepted: number;
                        }>("syncGraph");
                        await refresh();
                        setNotice(
                          `${result.accepted} technical service objects accepted by Teamwork Graph.`,
                        );
                      })
                    }
                  >
                    Sync technical services <Arrow />
                  </button>
                </div>
                <div className="integration-strip">
                  <div>
                    <strong>Refresh classification evidence</strong>
                    <p>
                      Read this synthetic service from Teamwork Graph and attach
                      its mapped critical-function evidence to the assessment.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        if (!client.isForge) {
                          setNotice(
                            "Graph enrichment runs in Forge after the synthetic service register is connected and synced.",
                          );
                          return;
                        }
                        await client.forgeCall("refreshGraphEvidence", {
                          key: selected,
                        });
                        await refresh();
                        setNotice(
                          "Teamwork Graph evidence attached. Review the classification before signing.",
                        );
                      })
                    }
                  >
                    Refresh graph evidence <Arrow />
                  </button>
                </div>
              </section>
            )}
            {tab === "reports" && (
              <section className="reports">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">PREPARATION / SUBMISSION</span>
                    <h2>A report built from the record.</h2>
                  </div>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      (reportKind === "gdpr"
                        ? incident.facts.personalDataBreach.value !== true ||
                          incident.facts.gdprRiskUnlikely.value !== false ||
                          !incident.privacyAwarenessAt
                        : !state?.signature || stale)
                    }
                    onClick={() => {
                      setSubmitted(isoLocal(app!.now));
                      setReference("");
                      setReceiptNote("");
                      setModal("submit");
                    }}
                  >
                    Record submission <Arrow />
                  </button>
                </div>
                <div className="report-selector">
                  <label htmlFor="report-stage">Report stage</label>
                  <select
                    id="report-stage"
                    value={reportKind}
                    onChange={(e) =>
                      setReportKind(e.target.value as ReportKind)
                    }
                  >
                    <option value="initial">Initial notification</option>
                    <option value="intermediate">Intermediate report</option>
                    <option value="final">Final report</option>
                    <option value="gdpr">GDPR notification</option>
                    <option value="reclassification">
                      Reclassification notice
                    </option>
                  </select>
                  <p>
                    Working fields follow the DORA reporting stages. Review them
                    against your authority’s current form.
                  </p>
                </div>
                <div className="privacy-assessment">
                  <h3>Personal-data-breach assessment</h3>
                  <p>
                    GDPR uses a separate awareness time and risk test. Record
                    the privacy evidence independently of the DORA
                    classification.
                  </p>
                  <div>
                    <span>
                      Personal-data breach:{" "}
                      <strong>
                        {valueText(incident.facts.personalDataBreach.value)}
                      </strong>
                    </span>
                    <button
                      className="text-button"
                      onClick={() => edit("personalDataBreach")}
                    >
                      Edit personal-data breach
                    </button>
                  </div>
                  <div>
                    <span>
                      Risk unlikely:{" "}
                      <strong>
                        {valueText(incident.facts.gdprRiskUnlikely.value)}
                      </strong>
                    </span>
                    <button
                      className="text-button"
                      onClick={() => edit("gdprRiskUnlikely")}
                    >
                      Edit privacy risk assessment
                    </button>
                  </div>
                  <small>
                    Privacy awareness:{" "}
                    {incident.privacyAwarenessAt
                      ? time(incident.privacyAwarenessAt, true) + " Paris"
                      : "Not recorded; set it in incident context"}
                  </small>
                </div>
                <div className="report-readiness">
                  <strong>
                    {
                      report.filter((f) => f.value === "Evidence required")
                        .length
                    }{" "}
                    fields need evidence
                  </strong>
                  <span>
                    Working draft checklist. Conditional ITS fields and the
                    authority’s form require officer review.
                  </span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void task(downloadReport)}
                  >
                    Export report draft <Arrow />
                  </button>
                </div>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">REPORT FIELD</th>
                      <th scope="col">RECORDED VALUE</th>
                      <th scope="col">SOURCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((f) => (
                      <tr key={f.code}>
                        <th scope="row">{f.label}</th>
                        <td
                          className={
                            f.value === "Evidence required" ? "missing" : ""
                          }
                        >
                          {f.value}
                        </td>
                        <td>
                          {f.citations.join(" · ")}
                          {f.sourceUrls?.map((url) => (
                            <a
                              className="source-link"
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open source ↗
                            </a>
                          ))}
                          {REPORT_DETAILS.some((d) => d.code === f.code) && (
                            <button
                              className="edit-fact"
                              aria-label={`Edit report field ${f.label}`}
                              onClick={() => editDetail(f.code as DetailCode)}
                            >
                              Edit field
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="narrative">
                  <label htmlFor="narrative">Review a proposed narrative</label>
                  <p>
                    Paste an officer or Rovo draft. Cite evidence fields in
                    brackets, for example [affectedClients].
                  </p>
                  <textarea
                    id="narrative"
                    rows={3}
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    placeholder="18,400 clients are affected [affectedClients]."
                  />
                  <button
                    className="secondary"
                    disabled={busy || !narrative.trim()}
                    onClick={() =>
                      void task(async () => {
                        const r = await client.checkNarrative(
                          selected,
                          narrative,
                        );
                        setNarrativeResult(
                          r.valid
                            ? "Numeric and citation checks passed. Review all narrative claims against the source evidence."
                            : `Review required. Unsupported values or citations: ${r.unsupported.join(", ") || "add an evidence citation"}.`,
                        );
                      })
                    }
                  >
                    Check against evidence
                  </button>
                  <p role="status">{narrativeResult}</p>
                </div>
                <div className="submission-list">
                  <h3>Authority submission receipts</h3>
                  {state?.receipts.length ? (
                    state.receipts.map((r, n) => (
                      <div key={n}>
                        <strong>{human(r.kind)}</strong>
                        <span>{time(r.submittedAt, true)} Paris</span>
                        <code>{r.reference}</code>
                      </div>
                    ))
                  ) : (
                    <p>
                      When a report is submitted through your authority’s
                      portal, record the timestamp and receipt here.
                    </p>
                  )}
                </div>
              </section>
            )}
            {tab === "history" && (
              <section className="history">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">EVIDENCE / PROVENANCE</span>
                    <h2>Every decision leaves a trace.</h2>
                  </div>
                  <span
                    className={`chain-status ${row?.chainValid ? "" : "invalid"}`}
                  >
                    {row?.chainValid ? "✓ CHAIN CONSISTENT" : "CHAIN INVALID"}
                  </span>
                </div>
                <p className="small-note">
                  This checks recorded state and revision consistency. Retain
                  the exported bundle digest separately for independent
                  comparison; a hash alone does not establish signer identity.
                </p>
                <div className="hash-row">
                  <span>Current evidence · SHA-256</span>
                  <code>{row?.evidenceHash}</code>
                </div>
                {state?.revisions.length ? (
                  <ol className="revision-list">
                    {[...state.revisions].reverse().map((r) => (
                      <li key={r.sequence}>
                        <span className="revision-number">
                          {String(r.sequence).padStart(2, "0")}
                        </span>
                        <div>
                          <h3>{human(r.action.replaceAll(".", " "))}</h3>
                          <p>
                            {time(r.at, true)} Paris ·{" "}
                            {r.actor === app?.actor
                              ? app?.displayName
                              : r.actor}
                          </p>
                          <code>{r.hash}</code>
                        </div>
                        <span className="revision-check">SHA-256 ✓</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="history-empty">
                    <span aria-hidden="true">↳</span>
                    <h3>The evidence is ready for review.</h3>
                    <p>
                      Sign a classification or update an evidence field to
                      create the first recorded revision.
                    </p>
                  </div>
                )}
                <div className="integration-strip">
                  <div>
                    <strong>Confluence workpaper</strong>
                    <p>
                      Publish the evidence register, signatures, report receipts
                      and revision hashes.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      client.isForge
                        ? setModal("settings")
                        : void task(download)
                    }
                  >
                    {client.isForge
                      ? "Publish to Confluence"
                      : "Export workpaper"}{" "}
                    <Arrow />
                  </button>
                </div>
              </section>
            )}
            <footer className="footer">
              <span>
                FOUR HOURS<span className="orange">.</span>{" "}
                <small>THE EVIDENCE BEFORE THE DEADLINE.</small>
              </span>
              <span>
                {incident.synthetic
                  ? "DEMO DATA · NO REGULATOR SUBMISSION"
                  : `LIVE SITE · ${incident.id}`}
                <span className="footer-dot">·</span>EU 2024/1772 + 2025/301
              </span>
            </footer>
          </>
        )}
        {busy && (
          <div className="busy-indicator" role="status">
            Working…
          </div>
        )}
      </main>
      {modal === "context" && incident && (
        <Modal
          error={error}
          title="Incident context"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(() =>
                mutate("context", {
                  context: {
                    ...contextDraft,
                    occurredAt: new Date(contextDraft.occurredAt).toISOString(),
                    awarenessAt: new Date(
                      contextDraft.awarenessAt,
                    ).toISOString(),
                    privacyAwarenessAt: contextDraft.privacyAwarenessAt
                      ? new Date(contextDraft.privacyAwarenessAt).toISOString()
                      : null,
                  },
                }),
              );
            }}
          >
            <label htmlFor="context-entity-id">
              Financial entity identifier
            </label>
            <input
              id="context-entity-id"
              value={contextDraft.entityId}
              maxLength={100}
              required
              onChange={(e) =>
                setContextDraft({ ...contextDraft, entityId: e.target.value })
              }
            />
            <p className="small-note">
              Use the same stable identifier only for incidents belonging to the
              same financial entity. Recurrence is scoped to this identifier.
            </p>
            <label htmlFor="context-service">Affected service</label>
            <input
              id="context-service"
              value={contextDraft.service}
              onChange={(e) =>
                setContextDraft({ ...contextDraft, service: e.target.value })
              }
              required
            />
            <label htmlFor="context-service-id">
              Stable service identifier
            </label>
            <input
              id="context-service-id"
              value={contextDraft.serviceId}
              onChange={(e) =>
                setContextDraft({ ...contextDraft, serviceId: e.target.value })
              }
              required
            />
            <label htmlFor="context-root">Apparent root cause</label>
            <input
              id="context-root"
              value={contextDraft.rootCause}
              onChange={(e) =>
                setContextDraft({ ...contextDraft, rootCause: e.target.value })
              }
              maxLength={300}
            />
            <label htmlFor="context-occurrence">
              Occurrence time (
              {Intl.DateTimeFormat().resolvedOptions().timeZone})
            </label>
            <input
              id="context-occurrence"
              type="datetime-local"
              value={contextDraft.occurredAt}
              onChange={(e) =>
                setContextDraft({ ...contextDraft, occurredAt: e.target.value })
              }
              required
            />
            <label htmlFor="context-awareness">ICT awareness time</label>
            <input
              id="context-awareness"
              type="datetime-local"
              value={contextDraft.awarenessAt}
              onChange={(e) =>
                setContextDraft({
                  ...contextDraft,
                  awarenessAt: e.target.value,
                })
              }
              required
            />
            <label htmlFor="context-privacy">
              Personal-data-breach awareness time
            </label>
            <input
              id="context-privacy"
              type="datetime-local"
              value={contextDraft.privacyAwarenessAt}
              onChange={(e) =>
                setContextDraft({
                  ...contextDraft,
                  privacyAwarenessAt: e.target.value,
                })
              }
            />
            <label htmlFor="context-entity">Entity type</label>
            <select
              id="context-entity"
              value={contextDraft.entity}
              onChange={(e) =>
                setContextDraft({ ...contextDraft, entity: e.target.value })
              }
            >
              <option value="credit-institution">Credit institution</option>
              <option value="central-counterparty">Central counterparty</option>
              <option value="trading-venue">Trading venue</option>
              <option value="nis2-essential-important">
                NIS2 essential or important entity
              </option>
              <option value="other">Other financial entity</option>
            </select>
            <label htmlFor="context-zone">Reporting timezone</label>
            <input
              id="context-zone"
              value={contextDraft.timezone}
              onChange={(e) =>
                setContextDraft({ ...contextDraft, timezone: e.target.value })
              }
              required
            />
            <label htmlFor="context-exempt">Recurring-incident exemption</label>
            <select
              id="context-exempt"
              value={String(contextDraft.recurrenceExempt)}
              onChange={(e) =>
                setContextDraft({
                  ...contextDraft,
                  recurrenceExempt: e.target.value === "true",
                })
              }
            >
              <option value="false">No exemption recorded</option>
              <option value="true">
                Microenterprise or Article 16(1) entity
              </option>
            </select>
            <p className="small-note">
              Awareness, service context and root cause are versioned evidence.
              The original major-classification deadline remains anchored to its
              signed record.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save incident context
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "report-field" && (
        <Modal
          error={error}
          title={
            REPORT_DETAILS.find((d) => d.code === detailCode)?.label ??
            "Report evidence"
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(() =>
                mutate("report-field", {
                  code: detailCode,
                  value: detailValue,
                  source,
                  url: sourceUrl,
                }),
              );
            }}
          >
            <label htmlFor="detail-value">Recorded report field</label>
            <textarea
              id="detail-value"
              value={detailValue}
              onChange={(e) => setDetailValue(e.target.value)}
              maxLength={4000}
              rows={4}
              required
            />
            <label htmlFor="detail-source">Evidence source</label>
            <input
              id="detail-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              minLength={3}
              required
            />
            <label htmlFor="detail-url">Evidence URL</label>
            <input
              id="detail-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              required
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save report field
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "sign" && incident && assessment && (
        <Modal
          error={error}
          title="Sign the classification"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(() =>
                mutate("sign", {
                  rationale,
                  classifiedAt: new Date(classifiedAt).toISOString(),
                }),
              );
            }}
          >
            <div className="sign-summary">
              <Status value={assessment.verdict} />
              <p>
                {incident.id} · {assessment.metGroups} materiality groups met
              </p>
            </div>
            <label htmlFor="actual-classification">
              Actual classification time (
              {Intl.DateTimeFormat().resolvedOptions().timeZone})
            </label>
            <input
              id="actual-classification"
              type="datetime-local"
              value={classifiedAt}
              onChange={(e) => setClassifiedAt(e.target.value)}
              required
            />
            <label htmlFor="rationale">Classification rationale</label>
            <textarea
              id="rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              minLength={12}
              maxLength={2000}
              required
              rows={4}
            />
            <p className="small-note">
              Signed as {app?.displayName}. The signature binds this evidence
              version and the classification time.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Confirm classification <Arrow />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "edit" && incident && (
        <Modal
          error={error}
          title={`Evidence · ${human(field)}`}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                let value: unknown;
                try {
                  value =
                    !draftValue.trim() || draftValue === "null"
                      ? null
                      : BOOLEAN_FIELDS.has(field)
                        ? draftValue === "true"
                        : field === "memberStates"
                          ? draftValue
                              .toUpperCase()
                              .split(/[,;\s]+/)
                              .filter(Boolean)
                          : Number(draftValue);
                } catch {
                  throw new Error(
                    "Enter a valid value: number, true, false, null, or a country-code array",
                  );
                }
                await mutate("evidence", {
                  field,
                  value,
                  source,
                  url: sourceUrl,
                });
              });
            }}
          >
            <label htmlFor="fact-value">Recorded value</label>
            {BOOLEAN_FIELDS.has(field) ? (
              <select
                id="fact-value"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
              >
                <option value="">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                id="fact-value"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                inputMode={field === "memberStates" ? "text" : "decimal"}
                placeholder={
                  field === "memberStates" ? "FR, DE, NL" : "Unknown"
                }
              />
            )}
            <p className="small-note">
              Leave the value empty when unknown. Country codes are separated by
              commas. The evidence source is recorded below.
            </p>
            <label htmlFor="fact-source">Evidence source</label>
            <input
              id="fact-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              minLength={3}
              maxLength={200}
              required
            />
            <label htmlFor="source-url">Source URL</label>
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              required
            />
            <p className="small-note">
              Updating evidence records your identity and observed time. A
              signed classification must be reviewed again.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save evidence
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "submit" && (
        <Modal
          error={error}
          title="Record an authority submission"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(() =>
                mutate("submit", {
                  receipt: {
                    kind: reportKind,
                    submittedAt: new Date(submitted).toISOString(),
                    reference,
                    ...(receiptNote.trim() ? { note: receiptNote.trim() } : {}),
                  },
                }),
              );
            }}
          >
            <p>Record the receipt from your authority’s portal.</p>
            <label htmlFor="submit-kind">Report stage</label>
            <select
              id="submit-kind"
              value={reportKind}
              onChange={(e) => setReportKind(e.target.value as ReportKind)}
            >
              <option value="initial">Initial notification</option>
              <option value="intermediate">Intermediate report</option>
              <option value="final">Final report</option>
              <option value="gdpr">GDPR notification</option>
              <option value="reclassification">Reclassification notice</option>
            </select>
            <label htmlFor="submitted-at">
              Actual submission time (
              {Intl.DateTimeFormat().resolvedOptions().timeZone})
            </label>
            <input
              id="submitted-at"
              type="datetime-local"
              value={submitted}
              onChange={(e) => setSubmitted(e.target.value)}
              required
            />
            <label htmlFor="authority-reference">
              Authority receipt reference
            </label>
            <input
              id="authority-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              minLength={3}
              maxLength={200}
              placeholder="e.g. ACPR-2026-10482"
              required
            />
            <p className="small-note">
              This receipt anchors the next applicable reporting clock.
            </p>
            <label htmlFor="receipt-note">
              Submission context or delay explanation
            </label>
            <textarea
              id="receipt-note"
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Record receipt
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          error={error}
          title="Incident desk settings"
          onClose={() => setModal(null)}
        >
          {client.isForge ? (
            <>
              <h3>Load the demo bank</h3>
              <p>
                Create five clearly labelled synthetic incidents in a project
                you administer.
              </p>
              <label htmlFor="demo-project">Jira project</label>
              <select
                id="demo-project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
              <button
                className="primary"
                disabled={busy || !project}
                onClick={() =>
                  void task(async () => {
                    await client.forgeCall("loadDemo", { project });
                    await refresh();
                    setModal(null);
                    setNotice("Demo incidents loaded in Jira.");
                  })
                }
              >
                Load demo bank
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    const r = await client.forgeCall<{ removed: number }>(
                      "resetDemo",
                    );
                    await refresh();
                    setModal(null);
                    setNotice(
                      `${r.removed} demo incidents deleted. Load the demo bank again to start over.`,
                    );
                  })
                }
              >
                Reset the demo
              </button>
              <hr />
              <h3>Risk officers</h3>
              <label htmlFor="risk-officers">
                Authorised Atlassian account IDs, one per line
              </label>
              <textarea
                id="risk-officers"
                value={officers}
                onChange={(e) => setOfficers(e.target.value)}
                rows={3}
              />
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await client.forgeCall("saveOfficers", {
                      officers: officers.split(/\s+/).filter(Boolean),
                    });
                    setNotice(
                      "Risk officer permissions saved. Jira issue access still applies.",
                    );
                    setModal(null);
                  })
                }
              >
                Save risk officers
              </button>
              <hr />
              <h3>Confluence workpaper</h3>
              <label htmlFor="space-id">Confluence space</label>
              <select
                id="space-id"
                value={space}
                onChange={(e) => setSpace(e.target.value)}
              >
                <option value="">Choose a space</option>
                {spaceList.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
              <button
                className="secondary"
                disabled={busy || !selected || !/^\d+$/.test(space)}
                onClick={() =>
                  void task(async () => {
                    const p = await client.forgeCall<{ url: string }>(
                      "publishWorkpaper",
                      { key: selected, spaceId: space },
                    );
                    setNotice(`Confluence workpaper published: ${p.url}`);
                    setModal(null);
                  })
                }
              >
                Publish current workpaper
              </button>
              <hr />
              <h3>Teamwork Graph</h3>
              <p>
                Connect Four Hours in Atlassian Administration, then sync from
                the Service context tab. Only synthetic technical metadata is
                indexed.
              </p>
            </>
          ) : (
            <>
              <span className="source-tag">SYNTHETIC REPLAY</span>
              <p>
                Explore the full workflow with five fictional incidents.
                Evidence, signatures and receipts stay in this browser.
              </p>
              <h3>Replay clock</h3>
              <p>{app ? time(app.now, true) : ""} Paris time</p>
              <div className="replay-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => setApp(await client.advance(2)))
                  }
                >
                  Advance 2 hours
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => setApp(await client.advance(72)))
                  }
                >
                  Advance 72 hours
                </button>
              </div>
              <hr />
              <button
                className="danger-button"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    setApp(await client.reset());
                    setSelected("FH-482");
                    setTab("classification");
                    setModal(null);
                    setNotice("Replay reset to the original five incidents.");
                  })
                }
              >
                Reset synthetic replay
              </button>
              <p className="small-note">
                Resets the demonstration in this browser.
              </p>
            </>
          )}
        </Modal>
      )}
      {modal === "create" && (
        <Modal
          error={error}
          title="Add an incident"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                const now = app!.now;
                const base = makeIncident(
                  {},
                  {
                    id: newKey,
                    serviceId: newService
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-"),
                    service: newService,
                    occurredAt: new Date(newAwareness).toISOString(),
                    awarenessAt: new Date(newAwareness).toISOString(),
                    assessedAt: now,
                    rootCause: "Unknown; investigation open",
                    synthetic: !client.isForge,
                  },
                );
                for (const f of Object.values(base.facts)) {
                  f.value = null;
                  f.observedAt = now;
                  f.source = "Evidence required";
                  f.url = client.isForge
                    ? `https://${location.host}`
                    : "https://demo.example/evidence";
                  f.quality = client.isForge ? "attested" : "synthetic";
                }
                await client.createIncident(base);
                await refresh();
                setSelected(newKey);
                setModal(null);
                setNotice(
                  "Incident added. Complete the sourced evidence before classification.",
                );
              });
            }}
          >
            <label htmlFor="new-key">Jira incident key</label>
            <input
              id="new-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              pattern="[A-Z][A-Z0-9_]*-[0-9]+"
              placeholder="INC-123"
              required
            />
            <label htmlFor="new-service">Affected service</label>
            <input
              id="new-service"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              maxLength={150}
              required
            />
            <label htmlFor="new-awareness">
              Awareness time ({Intl.DateTimeFormat().resolvedOptions().timeZone}
              )
            </label>
            <input
              id="new-awareness"
              type="datetime-local"
              value={newAwareness}
              onChange={(e) => setNewAwareness(e.target.value)}
              required
            />
            <p className="small-note">
              {client.isForge
                ? "The title is read from Jira. Your Jira permissions apply."
                : "This creates a synthetic incident in the browser replay."}{" "}
              All classification facts start as unknown.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Add incident
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
