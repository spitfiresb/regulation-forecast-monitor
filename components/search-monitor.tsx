"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  browseCategories,
  browseExamples,
  categoryFor,
  agendaEdition,
  listedTimetable,
} from "@/lib/browse";
import { type CatalogResults } from "@/lib/catalog";
import { type Signal } from "@/lib/model";
import { type RuleDetail } from "@/lib/detail";
import { type Evaluation, targetName } from "@/lib/prediction/model";
import { formatDate, parseAgendaDate, targetElapsed } from "@/lib/dates";

type Props = {
  initial: CatalogResults | null;
  initialDetail: RuleDetail | null;
  initialQuery: string;
  initialCategory: string;
  initialBrowsing: boolean;
  initialError: string;
  asOf: string;
};
export function SearchMonitor({
  initial,
  initialDetail,
  initialQuery,
  initialCategory,
  initialBrowsing,
  initialError,
  asOf,
}: Props) {
  const [category, setCategory] = useState(initialCategory);
  const categoryRef = useRef(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [results, setResults] = useState(initial);
  const [detail, setDetail] = useState(initialDetail);
  const [showResults, setShowResults] = useState(
    !initialDetail && initialBrowsing,
  );
  const [searching, setSearching] = useState(false);
  const [loadingRule, setLoadingRule] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(asOf);
  const sequence = useRef(0);
  const searchSequence = useRef(0);
  const selected = useRef(initialDetail?.entry.rin ?? null);
  const searchText = useRef(initialQuery);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  function url(q: string, rin: string | null, offset = 0) {
    const params = new URLSearchParams();
    params.set("browse", "all");
    if (categoryRef.current) params.set("category", categoryRef.current);
    if (q) params.set("q", q);
    if (rin) params.set("rin", rin);
    if (offset) params.set("offset", String(offset));
    return "/" + (params.size ? "?" + params : "");
  }
  async function search(
    q: string,
    offset = 0,
    push = true,
    nextCategory = categoryRef.current,
  ) {
    categoryRef.current = nextCategory;
    setCategory(nextCategory);
    setQuery(q);
    const ticket = ++searchSequence.current;
    ++sequence.current;
    selected.current = null;
    searchText.current = q;
    setSubmittedQuery(q);
    setSearching(true);
    setLoadingRule(false);
    setRefreshing(false);
    setError("");
    setNotice("");
    setDetail(null);
    setShowResults(true);
    if (push) history.pushState({}, "", url(q, null, offset));
    try {
      const r = await fetch(
        `/api/rules?${new URLSearchParams({ q, category: nextCategory, limit: "8", offset: String(offset) })}`,
        { signal: AbortSignal.timeout(20000) },
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (ticket === searchSequence.current) setResults(body);
    } catch (e) {
      if (ticket === searchSequence.current) {
        setResults(null);
        setError(
          e instanceof Error ? e.message : "Search could not be completed.",
        );
      }
    } finally {
      if (ticket === searchSequence.current) setSearching(false);
    }
  }
  async function refresh(rin: string, ticket = sequence.current) {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/rules/${rin}/refresh`, {
        method: "POST",
        signal: AbortSignal.timeout(120000),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (ticket === sequence.current && rin === selected.current) {
        setDetail(body);
        setNow(new Date().toISOString());
        setNotice("Official sources checked. Forecast assessment saved.");
      }
    } catch (e) {
      if (ticket === sequence.current && rin === selected.current)
        setError(
          e instanceof Error
            ? e.message
            : "Refresh failed. Previous information is retained.",
        );
    } finally {
      if (ticket === sequence.current) setRefreshing(false);
    }
  }
  async function select(rin: string, push = true) {
    const ticket = ++sequence.current;
    ++searchSequence.current;
    selected.current = rin;
    setLoadingRule(true);
    setSearching(false);
    setRefreshing(false);
    setError("");
    setNotice("");
    setDetail(null);
    setShowResults(false);
    if (push) history.pushState({}, "", url(searchText.current, rin));
    try {
      const r = await fetch(`/api/rules/${rin}`, {
        signal: AbortSignal.timeout(20000),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (ticket !== sequence.current) return;
      setDetail(body);
      setLoadingRule(false);
      requestAnimationFrame(() => detailHeading.current?.focus());
      if (!body.snapshot) await refresh(rin, ticket);
    } catch (e) {
      if (ticket === sequence.current) {
        setShowResults(true);
        setError(e instanceof Error ? e.message : "Rule could not be loaded.");
      }
    } finally {
      if (ticket === sequence.current) setLoadingRule(false);
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60000);
    const pop = () => {
      const p = new URLSearchParams(location.search);
      const q = p.get("q") ?? "";
      const nextCategory = categoryFor(p.get("category") ?? "")?.id ?? "";
      categoryRef.current = nextCategory;
      setCategory(nextCategory);
      setQuery(q);
      searchText.current = q;
      setSubmittedQuery(q);
      const rin = p.get("rin");
      if (rin) void select(rin, false);
      else if (p.get("browse") === "all" || q || nextCategory)
        void search(q, Number(p.get("offset") ?? 0), false, nextCategory);
      else {
        ++sequence.current;
        ++searchSequence.current;
        selected.current = null;
        setDetail(null);
        setShowResults(false);
        setSearching(false);
        setLoadingRule(false);
        setRefreshing(false);
        setNotice("");
        setError("");
      }
    };
    window.addEventListener("popstate", pop);
    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", pop);
      // Mutable request counters intentionally invalidate work on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++sequence.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++searchSequence.current;
    };
    // Navigation requests read their current query and selection from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    void search(query.trim());
  }
  return (
    <main className="search-monitor">
      <header className="monitor-header">
        <div>
          <p className="eyebrow">REGULATORY RESEARCH & FORECASTS</p>
          <h1>Regulatory Forecast Monitor</h1>
          <p className="intro">
            Explore possible rule changes. See the evidence behind them.
          </p>
        </div>
        <Link href="/architecture" className="quiet-link">
          Architecture
        </Link>
      </header>
      <section className="browse-start" aria-label="Browse rulemakings">
        <h2>What would you like to explore?</h2>
        <p className="muted">
          Choose an area to get started. You don’t need a rule name or number.
        </p>
        <div className="browse-controls">
          <div className="category-field">
            <label htmlFor="rule-category">Browse by category</label>
            <select
              id="rule-category"
              value={category}
              onChange={(event) => void search("", 0, true, event.target.value)}
            >
              <option value="">Choose a category…</option>
              {browseCategories.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="secondary-button"
            onClick={() => void search("", 0, true, "")}
          >
            View all rulemakings
          </button>
        </div>
        <p className="small muted">
          Categories group issuing agencies and may overlap. The full list
          includes every imported agenda entry.
        </p>
        <details className="optional-search">
          <summary>Have something specific in mind? Search by keyword</summary>
          <form className="search-form" onSubmit={submit}>
            <label htmlFor="rule-search">
              Keyword or rule number{category ? " within this category" : ""}
            </label>
            <div className="search-input-row">
              <input
                id="rule-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={200}
                placeholder="For example: mortgage, privacy, or 3170-AB57"
                autoComplete="off"
              />
              <button
                className="primary-button"
                disabled={searching}
                type="submit"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </form>
        </details>
      </section>
      {!showResults && !detail && !loadingRule && (
        <section className="browse-examples" aria-label="Examples to explore">
          <h2>Not sure where to start?</h2>
          <p className="muted">
            Try one of these topics to see real government records.
          </p>
          <div className="example-grid">
            {browseExamples.map((example) => (
              <button
                className="example-card"
                key={example.title}
                onClick={() => void search(example.query, 0, true, "")}
              >
                <strong>
                  {example.title} <span aria-hidden="true">→</span>
                </strong>
                <span>{example.description}</span>
              </button>
            ))}
          </div>
          <p className="small muted">
            A rulemaking is a government process to introduce, change, or remove
            a rule. An agenda listing does not mean a change is already law.
          </p>
        </section>
      )}
      <p className="small muted coverage">
        {results?.metadata
          ? `${results.metadata.entry_count.toLocaleString()} agenda entries · Catalog imported ${formatDate(results.metadata.imported_at)}`
          : "Search covers the imported Unified Agenda catalog."}{" "}
        <span>Catalog listing does not confirm publication.</span>
      </p>
      <div aria-live="polite" role="status">
        {notice && <p className="status-message">{notice}</p>}
        {searching && <p className="status-message">Searching the catalog…</p>}
        {loadingRule && (
          <p className="status-message">Loading the selected rulemaking…</p>
        )}
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {showResults && results && !searching && (
        <section className="result-section" aria-label="Search results">
          <div className="section-heading">
            <h2>
              {submittedQuery
                ? `Results for “${submittedQuery}”`
                : (categoryFor(category)?.label ?? "All rulemakings")}
            </h2>
            <span className="small muted">
              {results.total.toLocaleString()} results
            </span>
          </div>
          <p className="small muted">
            {category && submittedQuery
              ? `In ${categoryFor(category)?.label}. `
              : ""}
            Dates below are listed agenda timetable dates, not confirmation that
            a rule was published or took effect.
          </p>
          {results.entries.length === 0 ? (
            <p className="empty-state">
              No matching entries in this catalog. Try a shorter phrase, an
              agency name, or an exact RIN. This does not establish that no
              relevant regulation exists.
            </p>
          ) : (
            <ul className="result-list">
              {results.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    className="result-button"
                    onClick={() => void select(entry.rin)}
                  >
                    <span className="result-top">
                      <span className="result-title">{entry.title}</span>
                      <span className="stage-label">{entry.stage}</span>
                    </span>
                    <span className="result-agency">
                      {entry.agency} · {entry.rin}
                    </span>
                    <span className="result-description">
                      {entry.summary ||
                        "No abstract supplied in this agenda entry."}
                    </span>
                    <span className="result-foot">
                      Official agenda excerpt ·{" "}
                      {results.checked_ids?.includes(entry.id)
                        ? "Previously checked"
                        : "Publication not yet checked"}
                    </span>
                  </button>
                  <div className="result-verification">
                    <div>
                      <p>{listedTimetable(entry, now)}</p>
                      <span className="small muted">
                        {agendaEdition(entry.publication_id)} · RIN {entry.rin}
                      </span>
                    </div>
                    <SourceLink href={entry.source_url}>
                      Official record ↗
                    </SourceLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {results.total > results.limit && (
            <div className="pagination">
              <button
                className="secondary-button"
                disabled={results.offset === 0 || searching}
                onClick={() =>
                  void search(
                    searchText.current,
                    Math.max(0, results.offset - results.limit),
                  )
                }
              >
                Previous
              </button>
              <span className="small muted">
                {results.offset + 1}–
                {Math.min(results.offset + results.limit, results.total)} of{" "}
                {results.total}
              </span>
              <button
                className="secondary-button"
                disabled={
                  results.offset + results.limit >= results.total || searching
                }
                onClick={() =>
                  void search(
                    searchText.current,
                    results.offset + results.limit,
                  )
                }
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
      {detail && !loadingRule && (
        <article className="rule-detail" aria-busy={refreshing}>
          <div className="detail-toolbar">
            <button
              className="text-button"
              onClick={() => {
                ++sequence.current;
                selected.current = null;
                setDetail(null);
                setRefreshing(false);
                setShowResults(true);
                setNotice("");
                setError("");
                history.pushState(
                  {},
                  "",
                  url(searchText.current, null, results?.offset),
                );
              }}
            >
              ← Search results
            </button>
            <button
              className="secondary-button"
              disabled={refreshing}
              onClick={() => void refresh(detail.entry.rin)}
            >
              {refreshing ? "Checking sources…" : "Refresh official data"}
            </button>
          </div>
          <div className="rule-heading">
            <p className="eyebrow">
              {detail.entry.agency} · {detail.entry.rin}
            </p>
            <h2 ref={detailHeading} tabIndex={-1}>
              {detail.entry.title}
            </h2>
            <p className="summary-label">
              {detail.snapshot?.forecast.summary_method === "gemini"
                ? "AI SUMMARY · BASED ON THE AGENDA ABSTRACT"
                : "OFFICIAL AGENDA EXCERPT"}
            </p>
            <p className="rule-summary">
              {detail.snapshot?.forecast.expected_change ||
                detail.entry.summary ||
                "No abstract is available for this entry."}
            </p>
            <details>
              <summary>Original wording</summary>
              <blockquote>
                {detail.snapshot?.rule.summary || detail.entry.summary}
              </blockquote>
              <SourceLink
                href={
                  detail.snapshot?.rule.source_url || detail.entry.source_url
                }
              >
                Read the agenda record
              </SourceLink>
            </details>
          </div>
          {detail.snapshot?.warnings.map((w) => (
            <p className="status-message" key={w}>
              {w}
            </p>
          ))}
          {!detail.snapshot && (
            <p className="status-message">
              {refreshing
                ? "Checking publication evidence for this rulemaking."
                : "This is a catalog entry. Check official sources to assess publication status."}
            </p>
          )}
          <Forecast detail={detail} now={now} />
          <OfficialFacts detail={detail} now={now} />
          <Changes detail={detail} />
          <section className="detail-section">
            <h3>Sources & testing</h3>
            <p className="small muted">
              {detail.snapshot
                ? `Agenda retrieved ${formatDate(detail.snapshot.synced_at, true)}. Federal Register checked ${formatDate(detail.snapshot.federal_register_checked_at, true)}.`
                : "Publication sources have not been checked for this entry."}{" "}
              Retrieval time is not the agency’s update date.
            </p>
            <p className="small">
              <SourceLink href={detail.entry.source_url}>
                Unified Agenda
              </SourceLink>
              {detail.snapshot?.signals.find(
                (s) => s.signal_type === "FR_CHECK",
              ) && (
                <>
                  {" "}
                  ·{" "}
                  <SourceLink
                    href={
                      detail.snapshot.signals.find(
                        (s) => s.signal_type === "FR_CHECK",
                      )!.source_url
                    }
                  >
                    Federal Register lookup
                  </SourceLink>
                </>
              )}
            </p>
            <Testing
              report={detail.prediction?.evaluation ?? detail.evaluation}
            />
          </section>
        </article>
      )}
      <footer className="monitor-footer">
        Official records, AI summaries, and experimental forecasts are labeled
        separately. This monitor does not determine applicability to your
        business.
      </footer>
    </main>
  );
}
function SourceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
function Evidence({ signals }: { signals: Signal[] }) {
  return (
    <ul className="evidence-list">
      {signals.map((s) => (
        <li key={s.id}>
          <strong>{s.title}</strong>
          <p>{s.raw_wording}</p>
          <SourceLink href={s.source_url}>{s.source_name}</SourceLink>
          <span className="small muted">
            {" "}
            · Checked {formatDate(s.observed_at, true)}
          </span>
        </li>
      ))}
    </ul>
  );
}
function Forecast({ detail, now }: { detail: RuleDetail; now: string }) {
  const p = detail.prediction;
  const snapshot = detail.snapshot;
  const inferredTarget = snapshot?.signals.some(
    (s) => s.signal_type === "FINAL_RULE_PUBLISHED",
  )
    ? null
    : snapshot?.signals.some((s) => s.signal_type === "NPRM_PUBLISHED") ||
        detail.entry.stage === "Final Rule Stage"
      ? "FINAL_RULE_PUBLISHED"
      : detail.entry.stage === "Proposed Rule Stage"
        ? "NPRM_PUBLISHED"
        : null;
  const target = p ? p.target : inferredTarget;
  const stale =
    p &&
    (Date.parse(now) - Date.parse(p.evidence_cutoff) > 86400000 ||
      p.evaluation_version !== detail.evaluation.version ||
      p.evidence_cutoff !== snapshot?.synced_at);
  const end = p?.window_end;
  return (
    <section className="forecast-section" aria-labelledby="forecast-title">
      <p className="eyebrow">OUR FORECAST · EXPERIMENTAL</p>
      <h3 id="forecast-title">
        {target
          ? targetName(target)
          : "No supported future publication forecast"}
      </h3>
      {target && (
        <p className="forecast-window">
          {end
            ? `Within six months · by ${formatDate(end.slice(0, 10))}`
            : "Forecast question: publication within six months of a new assessment."}
        </p>
      )}
      <p className="forecast-chance">
        {p?.probability != null && !stale
          ? `${Math.round(p.probability * 100)}% estimated chance`
          : p?.status === "not_applicable"
            ? "Known event or unsupported stage"
            : stale
              ? "Refresh needed"
              : "Chance not yet estimable"}
      </p>
      <p>
        {stale
          ? "This saved assessment is dated or uses an older method. Refresh to assess the current evidence."
          : (p?.reason ??
            (snapshot
              ? "The sources have been checked. Refresh to record a forecast against the current evaluation."
              : "Publication evidence must be checked before a forecast can be assessed."))}
      </p>
      {p && (
        <>
          <ul className="reason-list">
            {p.facts.map((fact, i) => (
              <li key={i}>{fact.text}</li>
            ))}
          </ul>
          <details>
            <summary>Why this forecast?</summary>
            <p className="small">
              This assessment uses a defined publication event and a fixed
              six-month window. The agency’s timetable is separate. The estimate
              is produced by a versioned statistical method, not by the language
              model.
            </p>
            <p className="small">
              {p.probability !== null
                ? `Method: ${p.evaluation.method}. Cohort: ${p.evaluation.cohort.cases} historical cases.`
                : "No probability was issued because the evidence or evaluation requirements were not met."}
            </p>
            <Evidence
              signals={p.evidence.filter((s) =>
                p.facts.some((f) => f.evidence_ids.includes(s.id)),
              )}
            />
            <ul className="small limitations">
              {p.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="small">
              <SourceLink href={`/api/forecasts/${p.id}/evidence`}>
                Exact saved evidence and method
              </SourceLink>
            </p>
          </details>
          <p className="small muted">
            Assessment issued {formatDate(p.issued_at, true)}.
          </p>
        </>
      )}
    </section>
  );
}
function OfficialFacts({ detail, now }: { detail: RuleDetail; now: string }) {
  const { entry, snapshot } = detail;
  const rule = snapshot?.rule ?? entry;
  const reviewed = snapshot?.signals.some(
    (s) => s.signal_type === "REVIEW_REQUIRED",
  );
  const final = snapshot?.signals.find(
    (s) => s.signal_type === "FINAL_RULE_PUBLISHED",
  );
  const proposal = snapshot?.signals.find(
    (s) => s.signal_type === "NPRM_PUBLISHED",
  );
  const timing =
    snapshot?.signals.filter((s) =>
      [
        "NPRM_SCHEDULED",
        "COMMENT_PERIOD_OPEN",
        "COMMENT_PERIOD_CLOSED",
        "FINAL_RULE_PUBLISHED",
        "EFFECTIVE_DATE",
        "LEGAL_DEADLINE",
      ].includes(s.signal_type),
    ) ?? [];
  return (
    <section className="detail-section">
      <p className="eyebrow">OFFICIAL INFORMATION</p>
      <h3>Where it stands</h3>
      <dl className="fact-grid">
        <div>
          <dt>Agenda stage</dt>
          <dd>{rule.stage}</dd>
        </div>
        <div>
          <dt>Publication evidence</dt>
          <dd>
            {reviewed
              ? "Additional records need review"
              : final
                ? `Final rule found · ${formatDate(final.date)}`
                : proposal
                  ? `Proposal found · ${formatDate(proposal.date)}`
                  : snapshot?.federal_register_checked_at
                    ? "No matching proposal or final rule found in the checked exact-RIN search"
                    : "Not checked"}
          </dd>
        </div>
        <div>
          <dt>Affected CFR parts</dt>
          <dd>{rule.cfr_citation.join(" · ") || "Not specified"}</dd>
        </div>
        <div>
          <dt>Effective date</dt>
          <dd>{formatDate(snapshot?.forecast.effective_date ?? null)}</dd>
        </div>
      </dl>
      <h4>Agency timetable</h4>
      {entry.timetable.length ? (
        <ul className="timetable">
          {entry.timetable.map((t, i) => {
            const d = parseAgendaDate(t.date).date;
            return (
              <li key={i}>
                <span>{t.action}</span>
                <span>
                  {formatDate(d)}
                  {d && !t.fr_citation && targetElapsed(d, new Date(now))
                    ? " · listed date has passed"
                    : ""}
                  {t.fr_citation ? ` · ${t.fr_citation}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No timetable supplied in the catalog.</p>
      )}
      <p className="small muted">
        Timetable from the imported agenda edition {entry.publication_id}.
        Listed dates can change; they are not forecast dates. Legal deadline:{" "}
        {rule.legal_deadline}.
      </p>
      {timing.length > 0 && (
        <details>
          <summary>Why these dates?</summary>
          <Evidence signals={timing} />
        </details>
      )}
    </section>
  );
}
function Changes({ detail }: { detail: RuleDetail }) {
  const comparison = detail.snapshot?.comparison;
  return (
    <section className="detail-section">
      <h3>Changes since the previous check</h3>
      {!comparison ? (
        <p className="muted">
          No comparison is recorded yet. Future checks will show changes against
          the saved record.
        </p>
      ) : (
        <>
          <p className="small muted">
            Compared with {formatDate(comparison.previous_checked_at, true)}.
          </p>
          {comparison.incomplete && (
            <p className="status-message">
              Publication comparison is incomplete. Only verified agenda changes
              are compared.
            </p>
          )}
          {comparison.changes.length ? (
            <ul className="evidence-list">
              {comparison.changes.map((c, i) => (
                <li key={i}>
                  <strong>{c.label}</strong>
                  <p>Before: {c.before}</p>
                  <p>Now: {c.after}</p>
                  <SourceLink href={c.source_url}>Source</SourceLink>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {comparison.incomplete
                ? "No changes found in the compared agenda fields."
                : "No changes found in tracked agenda fields or publication evidence."}
            </p>
          )}
          <p className="small muted">
            New check times and rewritten AI summaries do not count as
            regulatory changes.
          </p>
        </>
      )}
    </section>
  );
}
function Testing({ report }: { report: Evaluation }) {
  return (
    <details className="testing">
      <summary>How are these forecasts tested?</summary>
      <p>
        We replay archived agenda records using only information available at a
        historical cutoff, then look for a matching publication within the next
        six months.
      </p>
      <p className="small">
        <strong>
          {report.enabled
            ? "Experimental historical estimate"
            : "Preliminary evaluation · probabilities withheld"}
        </strong>
      </p>
      <dl className="fact-grid">
        <div>
          <dt>Training cases</dt>
          <dd>{report.counts.training.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Development cases</dt>
          <dd>{report.counts.development.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Held-out cases</dt>
          <dd>{report.counts.test.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Holdout window</dt>
          <dd>
            {formatDate(report.periods.test_start)} –{" "}
            {formatDate(report.periods.test_end)}
          </dd>
        </div>
        <div>
          <dt>Model Brier score</dt>
          <dd>{report.metrics.brier?.toFixed(4) ?? "Not measured"}</dd>
        </div>
        <div>
          <dt>Stage-only baseline</dt>
          <dd>{report.metrics.baseline_brier?.toFixed(4) ?? "Not measured"}</dd>
        </div>
      </dl>
      <p className="small muted">
        Brier score measures probability error; lower is better. It is not an
        accuracy percentage. Preliminary metrics use candidate outcome labels
        and do not establish validated performance.
      </p>
      {report.reasons.map((r) => (
        <p className="small" key={r}>
          {r}
        </p>
      ))}
      <ul className="small limitations">
        {report.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="small">Method version: {report.version}</p>
      <ul className="small">
        {report.sources.map((s) => (
          <li key={s.url}>
            <SourceLink href={s.url}>{s.label}</SourceLink>
          </li>
        ))}
      </ul>
    </details>
  );
}
