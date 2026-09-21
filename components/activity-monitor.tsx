"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  type ActivityCase,
  type ActivitySearch,
  type ActivityWindow,
} from "@/lib/activity/model";
import { formatDate } from "@/lib/dates";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
const commonAgencies = new Set([573, 136, 145, 188, 192, 199, 271, 466]);

export function ActivityMonitor({
  initialQuery,
  initialDocument,
  initialPage,
  initialAgency,
  initialType,
  window,
}: {
  initialQuery: string;
  initialDocument: string;
  initialPage: number;
  initialAgency: string;
  initialType: string;
  window: ActivityWindow;
}) {
  const [query, setQuery] = useState(initialQuery);
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
        `/?${new URLSearchParams({ q: query, document, agency, type: publicationType })}`,
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
      else
        void search(
          initialQuery,
          initialPage,
          false,
          initialAgency,
          initialType,
        );
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
    return () => {
      clearTimeout(timer);
      removeEventListener("popstate", pop);
    };
    // The initial bookmarked selection runs once; later selections are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function search(
    text = query,
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
    setQuery(text);
    setAgency(selectedAgency);
    setPublicationType(selectedType);
    if (push)
      history.pushState(
        {},
        "",
        `/?${new URLSearchParams({ q: text, page: String(page), agency: selectedAgency, type: selectedType })}`,
      );
    try {
      const r = await fetch(
        `/api/activity?${new URLSearchParams({ q: text, page: String(page), agency: selectedAgency, type: selectedType })}`,
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
      <header className="activity-header">
        <Link className="brand" href="/">
          Regulatory Forecast Monitor
        </Link>
        <Link className="system-link" href="/how-it-works">
          How it works <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <div className="activity-discovery">
        <form className="record-search" onSubmit={submit}>
          <label htmlFor="activity-query">Find a regulation</label>
          <div className="record-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              id="activity-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={200}
              placeholder="Search by keyword or RIN"
              autoComplete="off"
            />
            <button type="submit" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </form>
        <div className="browse-divider">
          <span>or</span>
        </div>
        <form
          className="activity-browse"
          onSubmit={(e) => {
            e.preventDefault();
            void search("", 1, true, agency, publicationType);
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
            Agency options are unavailable. Search or browse all agencies.
          </p>
        )}
      </div>
      <div role="status" aria-live="polite">
        {searching && (
          <p className="record-status">Loading regulatory changes…</p>
        )}
        {busy && (
          <p className="record-status">Analyzing publication history…</p>
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
            <h1>
              {results.query ? "Search results" : "Recent regulatory changes"}
            </h1>
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
              No matching regulatory changes.
              {results.next_page
                ? " Continue to the next page, or narrow the search."
                : " Try another search or filter."}
            </p>
          )}
          {results.page > 1 && (
            <button
              className="activity-more"
              onClick={() =>
                void search(
                  results.query,
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
                void search(
                  results.query,
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
                void search(query, 1, true, agency, publicationType);
                return;
              }
              ++serial.current;
              setBusy(false);
              setRecord(null);
              setError("");
              setOpen(true);
              setQuery(results.query);
              setAgency(results.agency ?? "");
              setPublicationType(results.publication_type ?? "");
              history.pushState(
                {},
                "",
                `/?${new URLSearchParams({ q: results.query, page: String(results.page), agency: results.agency ?? "", type: results.publication_type ?? "" })}`,
              );
            }}
          >
            ← Back to results
          </button>
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
            <span className="provenance official">CURRENT STATUS</span>
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
              {record.assessment.ai?.status === "generated"
                ? "AI FORECAST"
                : record.assessment.kind === "insufficient_evidence"
                  ? "FORECAST WITHHELD"
                  : "RULES-BASED FORECAST"}
            </div>
            <h2>{record.assessment.next_status}</h2>
            <p>{record.assessment.forecast}</p>
            {record.assessment.ai?.reason && (
              <p className="forecast-fallback">{record.assessment.ai.reason}</p>
            )}
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
                This assessment is not calibrated against observed outcomes.
                Source citations identify supporting publications; they do not
                verify every inference.
              </p>
              {record.assessment.ai?.status === "generated" && (
                <p>
                  Model: {record.assessment.ai.model} · Prompt:{" "}
                  {record.assessment.ai.prompt_version}
                </p>
              )}
              <p>
                <Link href="/how-it-works">How forecasts are generated →</Link>
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
