"use client";
import { ForecastResearch } from "./forecast-research";
import { useEffect, useRef, useState } from "react";
import {
  type ActivityCase,
  type ActivitySearch,
  type ActivityWindow,
} from "@/lib/activity/model";
import { formatDate } from "@/lib/dates";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ExpandableExcerpt } from "@/components/expandable-excerpt";
import { displayText } from "@/lib/display-text";
const commonAgencies = new Set([573, 136, 145, 188, 192, 199, 271, 466]);

export function ActivityMonitor({
  initialDocument,
  initialPage,
  initialAgency,
  initialType,
  window,
}: {
  initialDocument: string;
  initialPage: number;
  initialAgency: string;
  initialType: string;
  window: ActivityWindow;
}) {
  const [results, setResults] = useState<ActivitySearch | null>(null);
  const [record, setRecord] = useState<ActivityCase | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [agency, setAgency] = useState(initialAgency);
  const [publicationType, setPublicationType] = useState(initialType);
  const [agencies, setAgencies] = useState<{ id: number; name: string }[]>([]);
  const [agencyError, setAgencyError] = useState(false);
  const serial = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  async function choose(document: string, refresh = false, push = true) {
    const ticket = ++serial.current;
    setOpen(false);
    setBusy(true);
    setError("");
    if (!refresh) setRecord(null);
    if (push)
      history.pushState(
        {},
        "",
        `/?${new URLSearchParams({ document, agency, type: publicationType })}`,
      );
    try {
      const response = await fetch(
        `/api/activity/${encodeURIComponent(document)}/assess${refresh ? "?refresh=true" : ""}`,
        { method: "POST", signal: AbortSignal.timeout(120000) },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (ticket === serial.current) {
        setRecord(data);
        requestAnimationFrame(() => heading.current?.focus());
      }
    } catch (e) {
      if (ticket === serial.current)
        setError(
          e instanceof Error
            ? e.message
            : "The history could not be checked. Please retry.",
        );
    } finally {
      if (ticket === serial.current) setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialDocument) void choose(initialDocument, false, false);
      else void browse(initialPage, false, initialAgency, initialType);
      void fetch("/api/activity/agencies")
        .then((response) => {
          if (!response.ok) throw new Error("Agencies unavailable");
          return response.json();
        })
        .then(setAgencies)
        .catch(() => setAgencyError(true));
    }, 0);
    const pop = () => location.reload();
    addEventListener("popstate", pop);
    addEventListener("monitor:home", goHome);
    return () => {
      clearTimeout(timer);
      removeEventListener("popstate", pop);
      removeEventListener("monitor:home", goHome);
    };
    // The initial bookmarked selection runs once; later selections are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function browse(
    page = 1,
    push = true,
    selectedAgency = "",
    selectedType = "",
  ) {
    const ticket = ++serial.current;
    setSearching(true);
    setBusy(false);
    setError("");
    setRecord(null);
    setOpen(true);
    setAgency(selectedAgency);
    setPublicationType(selectedType);
    if (push)
      history.pushState(
        {},
        "",
        `/?${new URLSearchParams({ page: String(page), agency: selectedAgency, type: selectedType })}`,
      );
    try {
      const r = await fetch(
        `/api/activity?${new URLSearchParams({ page: String(page), agency: selectedAgency, type: selectedType })}`,
        { signal: AbortSignal.timeout(40000) },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (ticket === serial.current) setResults(data);
    } catch (e) {
      if (ticket === serial.current) {
        setResults(null);
        setError(
          e instanceof Error ? e.message : "Changes could not be loaded.",
        );
      }
    } finally {
      if (ticket === serial.current) setSearching(false);
    }
  }
  function goHome() {
    history.pushState({}, "", "/");
    void browse(1, false);
    scrollTo({ top: 0 });
  }
  const scopeWindow = record?.window ?? results?.window ?? window;
  return (
    <main className="record-monitor activity-monitor">
      <header className="activity-header">
        <Link
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            goHome();
          }}
        >
          Regulatory Forecast Monitor
        </Link>
      </header>
      <div className="activity-discovery">
        <form
          className="activity-browse"
          onSubmit={(e) => {
            e.preventDefault();
            void browse(1, true, agency, publicationType);
          }}
        >
          <div className="browse-field">
            <label htmlFor="browse-agency">Agency</label>
            <select
              id="browse-agency"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
            >
              <option value="">All agencies</option>
              {agency &&
                !agencies.some((item) => String(item.id) === agency) && (
                  <option value={agency}>Selected agency</option>
                )}
              {[
                {
                  label: "Common agencies",
                  items: agencies.filter((item) => commonAgencies.has(item.id)),
                },
                {
                  label: "Other agencies",
                  items: agencies.filter(
                    (item) => !commonAgencies.has(item.id),
                  ),
                },
              ].map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="browse-field">
            <label htmlFor="browse-type">Publication</label>
            <select
              id="browse-type"
              value={publicationType}
              onChange={(e) => setPublicationType(e.target.value)}
            >
              <option value="">All types</option>
              <option value="RULE">Rules</option>
              <option value="PRORULE">Proposals</option>
              <option value="NOTICE">Related notices</option>
            </select>
          </div>
          <button className="browse-submit" type="submit" disabled={searching}>
            View changes <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
        {agencyError && (
          <p className="scope-note">
            Agency options are unavailable. You can still browse all agencies.
          </p>
        )}
      </div>
      <div role="status" aria-live="polite">
        {searching && (
          <p className="record-status">Loading regulatory changes…</p>
        )}
        {busy && (
          <p className="record-status">
            Researching publications and historical comparisons…
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="record-error">
          {error}
          {!record && initialDocument && (
            <button onClick={() => void choose(initialDocument, true, false)}>
              Retry source check
            </button>
          )}
        </p>
      )}
      {open && results && !searching && (
        <section
          className="activity-results"
          aria-label="Recent regulatory changes"
        >
          <div className="activity-results-heading">
            <h1>Recent regulatory changes</h1>
            <span>Past six months</span>
          </div>
          {results.entries.map((event) => (
            <button
              className="activity-result"
              key={event.document.document_number}
              onClick={() => void choose(event.document.document_number)}
            >
              <span className="event-meta">
                {formatDate(event.document.publication_date)} · {event.label}
              </span>
              <strong>{displayText(event.document.title)}</strong>
              <span>
                {event.document.agencies
                  .map((a) => displayText(a.name || a.raw_name))
                  .filter(Boolean)
                  .join(" / ")}{" "}
                · {event.document.document_number}
              </span>
            </button>
          ))}
          {!results.entries.length && (
            <p>
              No matching regulatory changes.
              {results.next_page
                ? " Continue to the next page, or change the filters."
                : " Try different filters."}
            </p>
          )}
          {results.page > 1 && (
            <button
              className="activity-more"
              onClick={() =>
                void browse(
                  results.page - 1,
                  true,
                  results.agency,
                  results.publication_type,
                )
              }
            >
              ← Previous results
            </button>
          )}
          {results.next_page && (
            <button
              className="activity-more"
              onClick={() =>
                void browse(
                  results.next_page!,
                  true,
                  results.agency,
                  results.publication_type,
                )
              }
            >
              Next results →
            </button>
          )}
          <p className="scope-note">
            Federal Register · {formatDate(scopeWindow.from)}–
            {formatDate(scopeWindow.to)}
          </p>
        </section>
      )}
      {record && (
        <article className="single-record">
          <button
            className="record-back"
            onClick={() => {
              if (!results) {
                void browse(1, true, agency, publicationType);
                return;
              }
              ++serial.current;
              setBusy(false);
              setRecord(null);
              setError("");
              setOpen(true);
              setAgency(results.agency ?? "");
              setPublicationType(results.publication_type ?? "");
              history.pushState(
                {},
                "",
                `/?${new URLSearchParams({ page: String(results.page), agency: results.agency ?? "", type: results.publication_type ?? "" })}`,
              );
            }}
          >
            ← Back to results
          </button>
          <div className="record-identity">
            <p>
              {record.selected.agencies
                .map((a) => displayText(a.name || a.raw_name))
                .filter(Boolean)
                .join(" / ")}{" "}
              ·{" "}
              {record.selected.regulation_id_numbers.join(", ") ||
                record.selected.document_number}
            </p>
            <h1 ref={heading} tabIndex={-1}>
              {displayText(record.selected.title)}
            </h1>
          </div>
          <div className="current-status">
            <span className="provenance official">CURRENT STATUS</span>
            <strong>{displayText(record.assessment.current_status)}</strong>
            <span>
              Latest linked update:{" "}
              {formatDate(
                record.history[0]?.document.publication_date ??
                  record.selected.publication_date,
              )}
            </span>
          </div>
          <section className="generated-outlook">
            <div className="provenance inference">
              {record.assessment.ai?.status === "generated"
                ? record.assessment.ai.prediction
                  ? "AI FORECAST"
                  : "AI ASSESSMENT"
                : record.assessment.kind === "insufficient_evidence"
                  ? "FORECAST WITHHELD"
                  : "RULES-BASED FORECAST"}
            </div>
            <div
              className={
                record.assessment.ai?.status === "generated"
                  ? "ai-generated"
                  : "forecast-text"
              }
            >
              <h2>{displayText(record.assessment.next_status)}</h2>
              {record.assessment.ai?.prediction && (
                <p className="forecast-window">
                  Next {record.assessment.ai.prediction.horizon_days} days ·
                  Through{" "}
                  {formatDate(record.assessment.ai.prediction.window_end)}
                </p>
              )}
              <p>{displayText(record.assessment.forecast)}</p>
              {record.assessment.ai?.reason &&
                record.assessment.ai.reason !== record.assessment.forecast && (
                  <p
                    className={
                      record.assessment.ai.review
                        ? "forecast-fallback ai-inline"
                        : "forecast-fallback"
                    }
                  >
                    {displayText(record.assessment.ai.reason)}
                  </p>
                )}
              <ul className="activity-reasons">
                {record.assessment.basis.map((reason) => (
                  <li key={displayText(reason)}>{displayText(reason)}</li>
                ))}
              </ul>
            </div>
            <p className="outlook-timing">
              <strong>Published timing:</strong>{" "}
              {displayText(record.assessment.timing)}
            </p>
            <ForecastResearch record={record} />
          </section>
          <section className="change-summary">
            <div className="provenance official">
              SELECTED UPDATE · OFFICIAL EXCERPT
            </div>
            <h2>
              {formatDate(record.selected.publication_date)} ·{" "}
              {
                record.history.find(
                  (e) => e.document.document_number === record.id,
                )?.label
              }
            </h2>
            <ExpandableExcerpt
              key={record.id}
              text={
                record.summary.text ||
                record.selected.action ||
                "No abstract supplied."
              }
            />
            <details>
              <summary>Publication details</summary>
              {record.selected.dates && (
                <p>
                  <strong>Published dates:</strong>{" "}
                  {displayText(record.selected.dates)}
                </p>
              )}
              <Source
                href={record.selected.pdf_url || record.selected.html_url}
              >
                Official publication
              </Source>
            </details>
          </section>
          <section className="official-record">
            <div className="provenance official">
              RULE HISTORY · OLDER CONTEXT INCLUDED
            </div>
            <details className="activity-history">
              <summary>
                {record.history.length} linked publications ·{" "}
                {record.history_complete
                  ? "source lookup completed"
                  : "history incomplete"}
              </summary>
              <ol>
                {record.history.map((event) => (
                  <li key={event.document.document_number}>
                    <div>
                      <strong>{event.label}</strong>
                      <time>
                        {formatDate(event.document.publication_date)}
                        {event.document.publication_date < record.window.from
                          ? " · earlier context"
                          : ""}
                      </time>
                    </div>
                    <p>{displayText(event.document.action)}</p>
                    {event.document.effective_on && (
                      <p>
                        Published effective date:{" "}
                        {formatDate(event.document.effective_on)}
                      </p>
                    )}
                    <Source
                      href={event.document.pdf_url || event.document.html_url}
                    >
                      Source {event.document.document_number}
                    </Source>
                    <details>
                      <summary>Official wording</summary>
                      <p>{displayText(event.document.abstract)}</p>
                      <p>{displayText(event.document.dates)}</p>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          </section>
          <div className="record-bottom">
            <span>Checked {formatDate(record.checked_at, true)}</span>
            <button
              disabled={busy}
              onClick={() => void choose(record.id, true, false)}
            >
              {busy ? "Checking…" : "Refresh history"}
            </button>
          </div>
        </article>
      )}
    </main>
  );
}
function Source({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  );
}
