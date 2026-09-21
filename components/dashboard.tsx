"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Landmark,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { type DashboardData, type Signal, type SignalType } from "@/lib/model";
import { formatDate, targetElapsed } from "@/lib/dates";

type EvidenceGroup = "all" | "change" | "likelihood" | "timing";
const groupLabels: Record<EvidenceGroup, string> = {
  all: "All evidence",
  change: "Expected change",
  likelihood: "Likelihood",
  timing: "Timing",
};
const humanize = (value: string) =>
  value.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());

export function Dashboard({
  initial,
  asOf,
}: {
  initial: DashboardData;
  asOf: number;
}) {
  const [now, setNow] = useState(asOf);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [group, setGroup] = useState<EvidenceGroup>("all");
  const [tab, setTab] = useState<"overview" | "evidence">("overview");
  const { rule, forecast, signals } = data;
  const elapsed =
    forecast.next_action === "Proposed rule (NPRM)" &&
    targetElapsed(forecast.expected_action_date, new Date(now));
  const stale = now - Date.parse(data.synced_at) > 24 * 60 * 60 * 1000;
  const evidence =
    group === "all"
      ? signals
      : signals.filter((s) => forecast.evidence[group].includes(s.id));
  const has = (type: SignalType) => signals.some((s) => s.signal_type === type);
  const paused = forecast.likelihood === "REVIEW REQUIRED";

  function showEvidence(next: EvidenceGroup) {
    setGroup(next);
    setTab("evidence");
    requestAnimationFrame(() =>
      document
        .getElementById("evidence")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
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
        throw new Error(
          body.error || "Official sources could not be refreshed.",
        );
      setData(body.data);
      setNow(Date.now());
      setMessage(body.message);
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
  const why = (key: Exclude<EvidenceGroup, "all">) => (
    <button className="why" onClick={() => showEvidence(key)}>
      Why? <ArrowUpRight size={15} aria-hidden="true" />
    </button>
  );

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to dashboard
      </a>
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label="Regulation Z Forecast Monitor home"
        >
          <span className="brand-mark">
            Z<span />
          </span>
          <span>
            Regulation Z<span className="brand-sub">FORECAST MONITOR</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <button
            className={tab === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setTab("overview");
              document
                .getElementById("main")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Overview
          </button>
          <button
            className={tab === "evidence" ? "nav-item active" : "nav-item"}
            onClick={() => showEvidence("all")}
          >
            Evidence <span className="nav-count">{signals.length}</span>
          </button>
        </nav>
        <span className="scope">
          <span className="live-dot" />
          Single-rule monitor
        </span>
      </header>

      <main id="main" className="shell">
        <div className="page-tools">
          <div className="eyebrow">
            <Landmark size={15} aria-hidden="true" /> CFPB <span>/</span>{" "}
            RULEMAKING WATCH
          </div>
          <button
            className="button refresh"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw
              size={15}
              className={refreshing ? "spin" : ""}
              aria-hidden="true"
            />
            {refreshing
              ? "Checking official sources…"
              : "Refresh official data"}
          </button>
        </div>
        <div className="rule-heading">
          <div>
            <div className="rule-id">
              RIN {rule.rin} <span className="tiny-divider" /> FEATURED RULE
            </div>
            <h1>
              Contingency Calculations
              <br className="desktop-break" /> for APOR
              <span className="heading-dot">.</span>
            </h1>
            <p className="full-title">{rule.title}</p>
          </div>
          <div className="heading-aside">
            <span className="eyebrow">OFFICIAL AGENDA STATUS</span>
            <div className="stage-pill">
              <span />
              {rule.stage}
            </div>
            <button
              className="text-link"
              onClick={() => showEvidence("likelihood")}
            >
              View supporting record <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        <div className="metadata-strip">
          <span>
            <Landmark size={15} aria-hidden="true" /> Consumer Financial
            Protection Bureau
          </span>
          <span>
            <BookOpen size={15} aria-hidden="true" /> Regulation Z · 12 CFR 1026
          </span>
          <span>
            <Clock3 size={15} aria-hidden="true" /> Checked{" "}
            {formatDate(data.synced_at)}
          </span>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {message && (
            <p className="notice success">
              <Check size={16} />
              {message}
            </p>
          )}
          {error && (
            <p className="notice warning" role="alert">
              <TriangleAlert size={17} />
              {error}
            </p>
          )}
        </div>
        {(data.storage === "snapshot" || stale || data.storage_warning) && (
          <p className="notice snapshot">
            <Clock3 size={17} />
            <span>
              {data.storage_warning ||
                `${data.storage === "snapshot" ? "Saved official-source snapshot." : "Verification is more than 24 hours old."} Last verified ${formatDate(data.synced_at, true)}. Refresh to check for changes.`}
            </span>
          </p>
        )}
        {data.warnings.map((w) => (
          <p key={w} className="notice warning">
            <TriangleAlert size={17} />
            {w}
          </p>
        ))}

        <div className="answer-grid">
          <section className="card change-card" aria-labelledby="change-title">
            <div className="card-top">
              <h2 id="change-title">
                <span className="section-number">01</span> Expected change
              </h2>
              <span className="tag">
                {forecast.summary_method === "gemini" ? (
                  <>
                    <Sparkles size={12} /> AI summary
                  </>
                ) : (
                  "OFFICIAL WORDING"
                )}
              </span>
            </div>
            <h3>
              A fallback for weekly
              <br />
              mortgage benchmark rates.
            </h3>
            <p className="change-copy">{forecast.expected_change}</p>
            <div className="card-bottom">
              <span className="muted">
                <BookOpen size={14} /> Grounded in the agency abstract
              </span>
              {why("change")}
            </div>
          </section>
          <section
            className="card likelihood-card"
            aria-labelledby="likelihood-title"
          >
            <div className="card-top">
              <h2 id="likelihood-title">
                <span className="section-number">02</span> Likelihood
              </h2>
              <Radio size={18} aria-hidden="true" />
            </div>
            <div className="likelihood-value">
              {humanize(forecast.likelihood)}
            </div>
            <div className="confidence">
              <span className="signal-bars" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i
                    key={i}
                    className={
                      i <
                      {
                        EARLY: 1,
                        DEVELOPING: 2,
                        STRONG: 3,
                        "HIGH SIGNAL": 4,
                        "VERY HIGH SIGNAL": 5,
                        FINALIZED: 5,
                        "REVIEW REQUIRED": 0,
                      }[forecast.likelihood]
                        ? "filled"
                        : ""
                    }
                  />
                ))}
              </span>
              {forecast.confidence === "Confirmed"
                ? "Publication confirmed"
                : `${forecast.confidence} confidence`}
            </div>
            <p>{forecast.reasoning[0]}</p>
            <div className="card-bottom">
              <span className="inference-tag">
                {forecast.likelihood === "FINALIZED"
                  ? "OFFICIAL PUBLICATION"
                  : "OUR INFERENCE · NO PROBABILITY"}
              </span>
              {why("likelihood")}
            </div>
          </section>
        </div>

        <section className="timeline-card" aria-labelledby="timeline-title">
          <div className="timeline-header">
            <h2 id="timeline-title">The rulemaking path</h2>
            <div className="legend">
              <span>
                <i className="known" />
                Known
              </span>
              <span>
                <i className="forecast" />
                Forecast
              </span>
              <span>
                <i className="unknown" />
                Unknown
              </span>
            </div>
          </div>
          <ol className="timeline">
            {[
              {
                title: "Unified Agenda",
                known: has("AGENDA_LISTED"),
                current: forecast.likelihood === "EARLY",
                future: false,
              },
              {
                title: "Proposed Rule Stage",
                known: has("PROPOSED_RULE_STAGE"),
                current: forecast.likelihood === "DEVELOPING",
                future: forecast.likelihood === "EARLY",
              },
              {
                title: "NPRM",
                known: has("NPRM_PUBLISHED"),
                current:
                  forecast.likelihood === "STRONG" &&
                  !has("COMMENT_PERIOD_OPEN"),
                future: forecast.likelihood === "DEVELOPING",
              },
              {
                title: "Public Comments",
                known:
                  has("COMMENT_PERIOD_OPEN") || has("COMMENT_PERIOD_CLOSED"),
                current:
                  (forecast.likelihood === "STRONG" &&
                    has("COMMENT_PERIOD_OPEN")) ||
                  forecast.likelihood === "HIGH SIGNAL",
                future:
                  forecast.likelihood === "STRONG" &&
                  !has("COMMENT_PERIOD_OPEN"),
              },
              {
                title: "Final Rule Stage",
                known: has("FINAL_RULE_STAGE"),
                current: forecast.likelihood === "VERY HIGH SIGNAL",
                future: forecast.likelihood === "HIGH SIGNAL",
              },
              {
                title: "Final Rule",
                known: has("FINAL_RULE_PUBLISHED"),
                current: forecast.likelihood === "FINALIZED",
                future: forecast.likelihood === "VERY HIGH SIGNAL",
              },
              {
                title: "Effective Date",
                known: !!forecast.effective_date,
                current: false,
                future: false,
              },
            ].map((step, i) => (
              <li
                key={step.title}
                className={`${step.known ? "is-known" : step.future && !paused ? "is-forecast" : "is-unknown"} ${step.current ? "is-current" : ""}`}
              >
                <span className="step-node">
                  {step.known && !step.current ? (
                    <Check size={13} />
                  ) : step.current ? (
                    <span />
                  ) : (
                    i + 1
                  )}
                </span>
                <strong>{step.title}</strong>
                <span className="step-caption">
                  {step.current
                    ? "YOU ARE HERE"
                    : step.known
                      ? "Known"
                      : step.future && !paused
                        ? "Expected next"
                        : "Unknown"}
                </span>
              </li>
            ))}
          </ol>
          <p className="timeline-note">
            <CircleHelp size={14} />A typical path, not a guaranteed sequence.
            Only observed milestones are marked known.
          </p>
        </section>

        <div className="detail-grid">
          <section className="card timing-card" aria-labelledby="timing-title">
            <div className="card-top">
              <h2 id="timing-title">
                <span className="section-number">03</span> Timing
              </h2>
              {why("timing")}
            </div>
            <div className="next-action">
              <div>
                <span className="eyebrow">EXPECTED NEXT ACTION</span>
                <h3>{forecast.next_action}</h3>
              </div>
              <ArrowRight size={23} className="muted" />
            </div>
            <div className="action-date">
              <span>{formatDate(forecast.expected_action_date)}</span>
              {elapsed ? (
                <span className="elapsed-tag">Agenda target elapsed</span>
              ) : forecast.expected_action_date ? (
                <span className="tag">
                  {has("FINAL_RULE_PUBLISHED") || has("COMMENT_PERIOD_OPEN")
                    ? "PUBLISHED DATE"
                    : "AGENDA TARGET"}
                </span>
              ) : null}
            </div>
            {elapsed && (
              <p className="timing-note">
                The agenda target has passed. A replacement date is not
                established by the checked evidence.
              </p>
            )}
            <dl className="date-list">
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
            <p className="footnote">
              {rule.legal_deadline === "None"
                ? "No legal deadline is listed in the agenda."
                : `Agenda legal deadline: ${rule.legal_deadline}.`}{" "}
              {forecast.effective_date
                ? "Effective date taken from the published rule."
                : "No effective date is inferred."}
            </p>
          </section>

          <section
            className="card evidence-summary"
            aria-labelledby="evidence-summary-title"
          >
            <div className="card-top">
              <h2 id="evidence-summary-title">
                <span className="section-number">04</span> Evidence
              </h2>
              <ShieldCheck size={19} className="green" />
            </div>
            <h3>
              Trace every conclusion
              <br />
              to the source.
            </h3>
            <div className="source-row">
              <span className="source-icon">
                <Landmark size={19} />
              </span>
              <div>
                <strong>Unified Agenda</strong>
                <span>Stage, proposed change & agency timetable</span>
              </div>
              <a
                href={rule.source_url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open official Unified Agenda record"
              >
                <ArrowUpRight size={19} />
              </a>
            </div>
            <div className="source-row">
              <span className="source-icon">
                <FileText size={19} />
              </span>
              <div>
                <strong>Federal Register</strong>
                <span>
                  {data.federal_register_checked_at
                    ? `RIN lookup checked ${formatDate(data.federal_register_checked_at)}`
                    : "Publication status not yet verified"}
                </span>
              </div>
              <a
                href={
                  signals.find((s) => s.signal_type === "FR_CHECK")
                    ?.source_url || "https://www.federalregister.gov/"
                }
                target="_blank"
                rel="noreferrer"
                aria-label="Open Federal Register RIN lookup"
              >
                <ArrowUpRight size={19} />
              </a>
            </div>
            <button
              className="evidence-button"
              onClick={() => showEvidence("all")}
            >
              Explore {signals.length} supporting records{" "}
              <ArrowDown size={15} />
            </button>
          </section>
        </div>

        <section
          id="evidence"
          className="evidence-section"
          aria-labelledby="evidence-title"
        >
          <div className="evidence-heading">
            <div className="eyebrow">THE AUDIT TRAIL</div>
            <h2 id="evidence-title">Evidence, in the original words.</h2>
            <p>
              Official facts and our interpretation remain separate. Open a
              record to inspect its wording.
            </p>
          </div>
          <div
            className="evidence-filters"
            role="group"
            aria-label="Filter evidence by conclusion"
          >
            {(Object.keys(groupLabels) as EvidenceGroup[]).map((key) => (
              <button
                key={key}
                className={key === group ? "selected" : ""}
                aria-pressed={key === group}
                onClick={() => setGroup(key)}
              >
                {groupLabels[key]}
                <span>
                  {key === "all"
                    ? signals.length
                    : forecast.evidence[key].length}
                </span>
              </button>
            ))}
          </div>
          <div className="evidence-list">
            {evidence.map((signal, i) => (
              <EvidenceRecord key={signal.id} signal={signal} index={i} />
            ))}
          </div>
          <details className="methodology">
            <summary>
              <CircleHelp size={16} />
              How the forecast is determined
              <ChevronDown size={16} />
            </summary>
            <div>
              <p>
                Deterministic procedural signals determine the label. These
                labels describe how far a rulemaking has progressed; they are
                not statistical probabilities of finalization.
              </p>
              <div className="method-grid">
                {[
                  ["Agenda only", "Early"],
                  ["Proposed Rule Stage", "Developing"],
                  ["NPRM published", "Strong"],
                  ["Comments closed", "High signal"],
                  ["Final Rule Stage", "Very high signal"],
                  ["Final rule published", "Finalized"],
                ].map(([fact, label]) => (
                  <p key={fact}>
                    <span>{fact}</span>
                    <ArrowRight size={14} />
                    <strong>{label}</strong>
                  </p>
                ))}
              </div>
              <p>
                Confidence is a qualitative assessment of procedural evidence,
                not an official CFPB rating. Withdrawals, corrections,
                additional publications, and ambiguous stages pause the
                automatic forecast for review. An unsuccessful source check
                never establishes that a rule does not exist.
              </p>
              <p>
                Optional Gemini summarization only rewrites the agency abstract.
                It cannot set stages, dates, likelihood, or publication status.
                Month-only agenda dates retain month precision.
              </p>
              {forecast.reasoning.slice(1).map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          </details>
        </section>

        <footer>
          <span className="footer-brand">
            Regulation Z <span>/</span> Forecast Monitor
          </span>
          <span>One rule. Official evidence. Clear uncertainty.</span>
          <a href={rule.source_url} target="_blank" rel="noreferrer">
            Original government record <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
    </>
  );
}

function EvidenceRecord({ signal, index }: { signal: Signal; index: number }) {
  return (
    <details className="evidence-record">
      <summary>
        <span className="record-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="record-content">
          <strong>{signal.title}</strong>
          <span>
            {signal.source_name} <i>·</i>{" "}
            {signal.date ? formatDate(signal.date) : "Date not specified"}
          </span>
        </span>
        <span className="record-type">
          {signal.signal_type.replaceAll("_", " ")}
        </span>
        <ChevronDown className="record-chevron" size={17} />
      </summary>
      <div className="record-body">
        <span className="eyebrow">
          {signal.signal_type === "FR_CHECK"
            ? "NORMALIZED API RESULT"
            : "OFFICIAL WORDING / FIELD VALUES"}
        </span>
        <blockquote>{signal.raw_wording}</blockquote>
        <div className="record-footer">
          <span>
            Observed {formatDate(signal.observed_at, true)}
            {signal.date_precision === "month"
              ? " · Month precision; no day supplied"
              : ""}
          </span>
          <a href={signal.source_url} target="_blank" rel="noreferrer">
            Open original source <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </details>
  );
}
