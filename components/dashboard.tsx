"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Workflow } from "lucide-react";
import { type DashboardData, type Signal } from "@/lib/model";
import { formatDate, targetElapsed } from "@/lib/dates";
import { currentBrief, proceduralLabels, reviewedContext } from "@/lib/brief";

type Conclusion = "change" | "likelihood" | "timing";

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
  const context = reviewedContext(data);
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
        <div className="header-actions">
          <button className="button" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh official data"}
          </button>
          <Link className="button architecture-link" href="/architecture">
            <Workflow size={16} aria-hidden="true" /> Architecture
          </Link>
        </div>
      </header>
      <p className="meta">
        Sources last checked: {formatDate(data.synced_at, true)}
      </p>
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
        <h2 id="rule-title">
          {context ? "APOR backup calculations" : rule.title}
        </h2>
        <p>CFPB · RIN {rule.rin}</p>
        <p className="key-finding">{currentBrief(data, now)}</p>
        <p>
          <strong>Latest agenda stage:</strong> {rule.stage}
        </p>
        <p className="meta">
          Affected:{" "}
          {rule.cfr_citation
            .map((part) =>
              part === "12 CFR 1003"
                ? "Regulation C / 12 CFR 1003"
                : part === "12 CFR 1026"
                  ? "Regulation Z / 12 CFR 1026"
                  : part,
            )
            .join(" · ")}
        </p>
        <p className="meta">
          The check time records when we fetched the sources, not when CFPB
          updated its plan. Exact-RIN searches may miss publications without RIN
          metadata.
        </p>
        <Why
          signals={signals.filter((s) =>
            [
              "PROPOSED_RULE_STAGE",
              "FINAL_RULE_STAGE",
              "NPRM_SCHEDULED",
              "NPRM_PUBLISHED",
              "FINAL_RULE_PUBLISHED",
              "FR_CHECK",
              "REVIEW_REQUIRED",
            ].includes(s.signal_type),
          )}
          label="Why this status?"
        />
      </section>

      <section aria-labelledby="change-title">
        <h2 id="change-title">What CFPB is considering</h2>
        <p>{context?.change ?? forecast.expected_change}</p>
        <p className="meta">
          {context
            ? "Plain-English explanation of the agenda abstract."
            : forecast.summary_method === "gemini"
              ? "AI summary of the official abstract."
              : "Excerpt from the official abstract."}
        </p>
        <Why
          signals={evidenceFor("change")}
          label="Why this expected change?"
        />
      </section>

      <section aria-labelledby="relevance-title">
        <h2 id="relevance-title">Why it matters to your team</h2>
        <p>
          {context?.relevance ??
            "The official abstract has changed. The previous explanation of team impact needs review against the new wording below."}
        </p>
        <p className="meta">
          {context
            ? "Our interpretation of the agenda’s stated scope. The agenda entry itself establishes no new calculation requirement."
            : "No updated impact assessment is available."}
        </p>
        <p>
          <strong>What to watch:</strong>{" "}
          {forecast.likelihood === "FINALIZED" ||
          forecast.likelihood === "REVIEW REQUIRED"
            ? "Review the published documents and their scope before assessing any operational change."
            : signals.some((s) => s.signal_type === "NPRM_PUBLISHED")
              ? "Any comment deadline, revisions to the proposal, and further agency publications."
              : "A published proposal explaining the fallback method, when it could be used, and any comment deadline."}
        </p>
        <Why signals={evidenceFor("change")} label="Why this relevance?" />
      </section>

      <section aria-labelledby="likelihood-title">
        <h2 id="likelihood-title">Rulemaking progress</h2>
        <p>
          <strong>{proceduralLabels[forecast.likelihood]}</strong>
        </p>
        <p>{forecast.reasoning[0]}</p>
        {forecast.likelihood !== "FINALIZED" && (
          <p className="meta">
            Likelihood of adoption: not assessed. Procedural stage alone does
            not establish how likely this is to become a final rule.
          </p>
        )}
        <Why
          signals={evidenceFor("likelihood")}
          label="Why this assessment?"
          reasoning={forecast.reasoning.slice(1)}
        />
      </section>

      <section aria-labelledby="timing-title">
        <h2 id="timing-title">Timing</h2>
        <dl className="dates">
          <div>
            <dt>Next listed agency action</dt>
            <dd>{forecast.next_action}</dd>
          </div>
          <div>
            <dt>{elapsed ? "Original agenda target" : "Listed action date"}</dt>
            <dd>
              {formatDate(forecast.expected_action_date)}
              {elapsed ? "; target has passed" : ""}
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
          <p>
            Current timing is unconfirmed. No replacement date is established by
            the checked evidence.
          </p>
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

      <section aria-labelledby="changes-title">
        <h2 id="changes-title">Changes since the previous check</h2>
        {data.comparison ? (
          <>
            <p className="meta">
              Compared with{" "}
              {formatDate(data.comparison.previous_checked_at, true)}.
            </p>
            {data.comparison.incomplete && (
              <p>
                Publication comparison is incomplete because one of the Federal
                Register checks was unavailable. Only verified agenda changes
                are compared.
              </p>
            )}
            {data.comparison.changes.length ? (
              <ul className="changes">
                {data.comparison.changes.map((change, index) => (
                  <li key={index}>
                    <strong>{change.label}</strong>
                    <p>Before: {change.before}</p>
                    <p>Now: {change.after}</p>
                    <a
                      href={change.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Current source
                    </a>
                    {" · "}
                    <a
                      href={change.previous_source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Previous source link
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {data.comparison.incomplete
                  ? "No changes found in the compared agenda fields."
                  : "No changes found in the tracked agenda fields or publication evidence."}
              </p>
            )}
            <p className="meta">
              Comparison uses saved source data. Source links may now show
              updated wording. Check times and AI wording are not counted as
              regulatory changes.
            </p>
          </>
        ) : (
          <p>
            No comparison has been recorded for this snapshot. Refresh official
            data to compare with the saved record.
          </p>
        )}
      </section>

      <section aria-labelledby="sources-title">
        <h2 id="sources-title">Official sources</h2>
        <p className="meta">Official title: {rule.title}</p>
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
