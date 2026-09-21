"use client";

import { useEffect, useState } from "react";
import { type DashboardData, type Signal } from "@/lib/model";
import { formatDate, targetElapsed } from "@/lib/dates";

type Conclusion = "change" | "likelihood" | "timing";
const readable = (value: string) =>
  value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function Dashboard({
  initial,
  asOf,
}: {
  initial: DashboardData;
  asOf: number;
}) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(asOf);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { rule, forecast, signals } = data;
  const elapsed =
    forecast.next_action === "Proposed rule (NPRM)" &&
    targetElapsed(forecast.expected_action_date, new Date(now));
  const stale = now - Date.parse(data.synced_at) > 86_400_000;
  const evidenceFor = (conclusion: Conclusion) =>
    signals.filter((signal) =>
      forecast.evidence[conclusion].includes(signal.id),
    );
  const sources = Array.from(
    new Map(signals.map((signal) => [signal.source_url, signal])).values(),
  );

  async function refresh() {
    setRefreshing(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not refresh official data.");
      setData(body.data);
      setNow(Date.now());
      setMessage(body.message || "Official data refreshed.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Refresh failed. Previous data is retained.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="monitor">
      <header className="page-header">
        <h1>Regulation Z Forecast Monitor</h1>
        <button className="button" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh official data"}
        </button>
      </header>
      <p className="meta">Last checked: {formatDate(data.synced_at, true)}</p>
      <div role="status" aria-live="polite">
        {message && <p className="notice">{message}</p>}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {(data.storage === "snapshot" || stale || data.storage_warning) && (
        <p className="notice">
          {data.storage_warning ||
            "Showing a saved snapshot. Refresh to check for changes."}
        </p>
      )}
      {data.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}

      <section className="rule" aria-labelledby="rule-title">
        <h2 id="rule-title">{rule.title}</h2>
        <p>CFPB · RIN {rule.rin} · Regulation Z</p>
        <p>
          <strong>Official status:</strong> {rule.stage}
        </p>
        <p className="meta">
          Affected CFR parts: {rule.cfr_citation.join(", ")}
        </p>
      </section>

      <section aria-labelledby="change-title">
        <h2 id="change-title">Expected change</h2>
        <p>{forecast.expected_change}</p>
        <p className="meta">
          {forecast.summary_method === "gemini"
            ? "AI summary of the official abstract."
            : "Excerpt from the official abstract."}
        </p>
        <Why
          signals={evidenceFor("change")}
          label="Why this expected change?"
        />
      </section>

      <section aria-labelledby="likelihood-title">
        <h2 id="likelihood-title">Likelihood</h2>
        <p>
          <strong>{readable(forecast.likelihood)}</strong> ·{" "}
          {forecast.confidence === "Confirmed"
            ? "Publication confirmed"
            : `${forecast.confidence} confidence`}
        </p>
        <p>{forecast.reasoning[0]}</p>
        {forecast.likelihood !== "FINALIZED" && (
          <p className="meta">
            Our assessment of procedural progress, not an official probability.
          </p>
        )}
        <Why
          signals={evidenceFor("likelihood")}
          label="Why this forecast?"
          reasoning={forecast.reasoning.slice(1)}
        />
      </section>

      <section aria-labelledby="timing-title">
        <h2 id="timing-title">Timing</h2>
        <dl className="dates">
          <div>
            <dt>Expected next action</dt>
            <dd>{forecast.next_action}</dd>
          </div>
          <div>
            <dt>{elapsed ? "Original agenda target" : "Next action date"}</dt>
            <dd>
              {formatDate(forecast.expected_action_date)}
              {elapsed ? " — target has passed" : ""}
            </dd>
          </div>
          <div>
            <dt>
              {forecast.final_rule_date
                ? "Final rule published"
                : "Final rule timing"}
            </dt>
            <dd>{formatDate(forecast.final_rule_date)}</dd>
          </div>
          <div>
            <dt>Effective date</dt>
            <dd>{formatDate(forecast.effective_date)}</dd>
          </div>
        </dl>
        {elapsed && (
          <p>No replacement date is established by the checked evidence.</p>
        )}
        <p className="meta">
          {rule.legal_deadline === "None"
            ? "No legal deadline is listed in the agenda."
            : `Agenda legal deadline: ${rule.legal_deadline}.`}{" "}
          {forecast.effective_date
            ? "The effective date comes from the published rule."
            : "No effective date is inferred."}
        </p>
        <Why signals={evidenceFor("timing")} label="Why these dates?" />
      </section>

      <section aria-labelledby="sources-title">
        <h2 id="sources-title">Official sources</h2>
        <ul className="sources">
          {sources.map((source) => (
            <li key={source.source_url}>
              <a href={source.source_url} target="_blank" rel="noreferrer">
                {source.source_name}
              </a>
              <span className="meta">
                {" "}
                · Checked {formatDate(source.observed_at, true)}
              </span>
            </li>
          ))}
        </ul>
        <p className="meta">
          {data.federal_register_checked_at
            ? "Federal Register checks use this exact RIN and may miss documents without RIN metadata."
            : "Federal Register publication status has not been verified."}
        </p>
      </section>
    </main>
  );
}

function Why({
  signals,
  label,
  reasoning = [],
}: {
  signals: Signal[];
  label: string;
  reasoning?: string[];
}) {
  return (
    <details className="why">
      <summary>{label}</summary>
      <div className="why-content">
        {reasoning.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
        <ul>
          {signals.map((signal) => (
            <li key={signal.id}>
              <strong>{signal.title}</strong>
              <p>{signal.raw_wording}</p>
              <a href={signal.source_url} target="_blank" rel="noreferrer">
                {signal.source_name}
              </a>
              <span className="meta">
                {" "}
                · Observed {formatDate(signal.observed_at, true)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
