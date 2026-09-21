"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  type ActivityCase,
  type ActivitySearch,
  type ActivityWindow,
} from "@/lib/activity/model";
import { formatDate } from "@/lib/dates";
export function ActivityMonitor({
  initialQuery,
  initialDocument,
  initialPage,
  initialSearch,
  window,
}: {
  initialQuery: string;
  initialDocument: string;
  initialPage: number;
  initialSearch: boolean;
  window: ActivityWindow;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ActivitySearch | null>(null);
  const [record, setRecord] = useState<ActivityCase | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
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
        `/?${new URLSearchParams({ q: query, document })}`,
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
      else if (initialSearch) void search(initialQuery, initialPage, false);
    }, 0);
    const pop = () => location.reload();
    addEventListener("popstate", pop);
    return () => {
      clearTimeout(timer);
      removeEventListener("popstate", pop);
    };
    // The initial bookmarked selection runs once; later selections are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function search(text = query, page = 1, push = true) {
    const ticket = ++serial.current;
    setSearching(true);
    setBusy(false);
    setError("");
    setRecord(null);
    setOpen(true);
    setQuery(text);
    if (push)
      history.pushState(
        {},
        "",
        `/?${new URLSearchParams({ q: text, page: String(page) })}`,
      );
    try {
      const r = await fetch(
        `/api/activity?${new URLSearchParams({ q: text, page: String(page) })}`,
        { signal: AbortSignal.timeout(40000) },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (ticket === serial.current) setResults(data);
    } catch (e) {
      if (ticket === serial.current) {
        setResults(null);
        setError(e instanceof Error ? e.message : "Search failed.");
      }
    } finally {
      if (ticket === serial.current) setSearching(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void search();
  }
  const scopeWindow = record?.window ?? results?.window ?? window;
  return (
    <main className="record-monitor activity-monitor">
      <header>
        <button
          className="brand"
          onClick={() => {
            ++serial.current;
            setRecord(null);
            setResults(null);
            setQuery("");
            setOpen(false);
            setBusy(false);
            setSearching(false);
            setError("");
            history.pushState({}, "", "/");
          }}
        >
          Regulatory Forecast Monitor
        </button>
        <span className="prototype-label">Research preview</span>
      </header>
      <form className="record-search" onSubmit={submit}>
        <label htmlFor="activity-query">
          What changed—and what happens next?
        </label>
        <div className="record-search-input">
          <input
            id="activity-query"
            value={query}
            onChange={(e) => {
              ++serial.current;
              setSearching(false);
              setBusy(false);
              setOpen(false);
              setQuery(e.target.value);
            }}
            maxLength={200}
            placeholder="Topic, agency, rule name, or RIN"
            autoComplete="off"
          />
          <button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        <p className="activity-radius">
          Published activity in the past six months ·{" "}
          {formatDate(scopeWindow.from)}–{formatDate(scopeWindow.to)}
        </p>
      </form>
      {!record && !open && !busy && (
        <div className="activity-start">
          <p>
            Choose a recent update. We’ll check its earlier history and assess
            the next status change.
          </p>
          <div className="activity-examples">
            <button onClick={() => void search("1903-AA20")}>
              Effective-date delays
            </button>
            <button onClick={() => void search("mortgage")}>
              Mortgage rules
            </button>
            <button onClick={() => void search("")}>Recent activity</button>
          </div>
          <p className="scope-note">
            Rules, proposals, and related notices published in the Federal
            Register. Agenda plans and unpublished developments do not enter
            this search.
          </p>
        </div>
      )}
      <div role="status" aria-live="polite">
        {busy && (
          <p className="record-status">
            Reading related publications, including earlier history…
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
          aria-label="Recent activity results"
        >
          <p className="results-intro">Choose one published update.</p>
          {results.entries.map((event) => (
            <button
              className="activity-result"
              key={event.document.document_number}
              onClick={() => void choose(event.document.document_number)}
            >
              <span className="event-meta">
                {formatDate(event.document.publication_date)} · {event.label}
              </span>
              <strong>{event.document.title}</strong>
              <span>
                {event.document.agencies
                  .map((a) => a.name || a.raw_name)
                  .filter(Boolean)
                  .join(" / ")}{" "}
                · {event.document.document_number}
              </span>
            </button>
          ))}
          {!results.entries.length && (
            <p>
              No matching regulatory activity on this results page.
              {results.next_page
                ? " Continue to the next page, or narrow the search."
                : " Try a different phrase. Older agenda listings are outside this search."}
            </p>
          )}
          {results.page > 1 && (
            <button
              className="activity-more"
              onClick={() => void search(results.query, results.page - 1)}
            >
              ← Previous results
            </button>
          )}
          {results.next_page && (
            <button
              className="activity-more"
              onClick={() => void search(results.query, results.next_page!)}
            >
              Next results →
            </button>
          )}
          <p className="scope-note">
            Dates are publication dates. Search is restricted to the displayed
            six-month window.
          </p>
        </section>
      )}
      {record && (
        <article className="single-record">
          <div className="record-identity">
            <p>
              {record.selected.agencies
                .map((a) => a.name || a.raw_name)
                .filter(Boolean)
                .join(" / ")}{" "}
              ·{" "}
              {record.selected.regulation_id_numbers.join(", ") ||
                record.selected.document_number}
            </p>
            <h1 ref={heading} tabIndex={-1}>
              {record.selected.title}
            </h1>
          </div>
          <div className="current-status">
            <span className="provenance official">
              CURRENT STATUS · FROM LINKED PUBLICATIONS
            </span>
            <strong>{record.assessment.current_status}</strong>
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
              GENERATED FORECAST · EXPERIMENTAL RULES-BASED ASSESSMENT
            </div>
            <h2>{record.assessment.next_status}</h2>
            <p>{record.assessment.forecast}</p>
            <ul className="activity-reasons">
              {record.assessment.basis.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="outlook-timing">
              <strong>Timing:</strong> {record.assessment.timing}
            </p>
            <details>
              <summary>Evidence, alternatives & limitations</summary>
              <p>
                This is an uncalibrated inference from the linked publication
                history, not an official forecast or a measured probability.
              </p>
              <ul>
                {record.assessment.alternatives.map((alternative) => (
                  <li key={alternative}>{alternative}</li>
                ))}
              </ul>
              <ul>
                {record.assessment.evidence.map((id) => {
                  const source = record.history.find(
                    (e) => e.document.document_number === id,
                  );
                  return source ? (
                    <li key={id}>
                      <Source
                        href={
                          source.document.pdf_url || source.document.html_url
                        }
                      >
                        {source.label} ·{" "}
                        {formatDate(source.document.publication_date)}
                      </Source>
                    </li>
                  ) : null;
                })}
              </ul>
              {record.limitations.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>
                The six-month limit defines which updates appear in search. It
                is not a prediction deadline.
              </p>
            </details>
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
            <p className="official-excerpt">
              {record.summary.text ||
                record.selected.action ||
                "No abstract supplied."}
            </p>
            <details>
              <summary>Read the source wording</summary>
              <blockquote>{record.summary.text}</blockquote>
              {record.selected.dates && (
                <p>
                  <strong>Published dates:</strong> {record.selected.dates}
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
                    <p>{event.document.action}</p>
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
                      <p>{event.document.abstract}</p>
                      <p>{event.document.dates}</p>
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
