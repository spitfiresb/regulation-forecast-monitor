"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type CatalogResults } from "@/lib/catalog";
import { type RuleDetail } from "@/lib/detail";
import { type Signal } from "@/lib/model";
import { formatDate, parseAgendaDate, targetElapsed } from "@/lib/dates";
import { buildOutlook, OUTLOOK_VERSION } from "@/lib/prediction/outlook";

export function RecordMonitor({
  initialDetail,
  initialQuery,
  initialError,
  asOf,
}: {
  initialDetail: RuleDetail | null;
  initialQuery: string;
  initialError: string;
  asOf: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [matches, setMatches] = useState<CatalogResults | null>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(initialError);
  const [now, setNow] = useState(asOf);
  const [active, setActive] = useState(-1);
  const selection = useRef(0);
  const searchId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  async function lookup(text: string) {
    const id = ++searchId.current;
    setSearching(true);
    try {
      const response = await fetch(
        `/api/rules?${new URLSearchParams({ q: text.trim(), limit: "6" })}`,
        { signal: AbortSignal.timeout(20000) },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (id === searchId.current) {
        setMatches(data);
        setActive(-1);
      }
      return id === searchId.current ? (data as CatalogResults) : null;
    } finally {
      if (id === searchId.current) setSearching(false);
    }
  }
  useEffect(() => {
    if (!query.trim()) return;
    let live = true;
    const timer = setTimeout(() => {
      void lookup(query).catch(() => {
        if (live) setError("Search is unavailable. Please try again.");
      });
    }, 250);
    debounce.current = timer;
    return () => {
      live = false;
      clearTimeout(timer);
      // Invalidate outstanding requests, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++searchId.current;
    };
  }, [query]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60000);
    const pop = () => location.reload();
    window.addEventListener("popstate", pop);
    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  async function refresh(rin: string, ticket = selection.current) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/rules/${rin}/refresh`, {
        method: "POST",
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (ticket === selection.current) {
        setDetail(data);
        setNow(new Date().toISOString());
      }
    } catch (e) {
      if (ticket === selection.current)
        setError(
          e instanceof Error ? e.message : "Source check failed. Retry below.",
        );
    } finally {
      if (ticket === selection.current) setBusy(false);
    }
  }
  async function select(rin: string) {
    const ticket = ++selection.current;
    setOpen(false);
    setError("");
    setDetail(null);
    setBusy(true);
    history.pushState(
      {},
      "",
      `/?${new URLSearchParams({ q: query.trim(), rin })}`,
    );
    try {
      const response = await fetch(`/api/rules/${rin}`, {
        signal: AbortSignal.timeout(20000),
      });
      const data: RuleDetail & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (ticket !== selection.current) return;
      setDetail(data);
      requestAnimationFrame(() => heading.current?.focus());
      if (
        !data.snapshot ||
        Date.parse(now) - Date.parse(data.snapshot.synced_at) > 86400000 ||
        data.prediction?.method_version !== OUTLOOK_VERSION
      )
        await refresh(rin, ticket);
    } catch (e) {
      if (ticket === selection.current)
        setError(e instanceof Error ? e.message : "Could not load this rule.");
    } finally {
      if (ticket === selection.current) setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) return;
    setError("");
    if (open && active >= 0 && matches?.entries[active]) {
      await select(matches.entries[active].rin);
      return;
    }
    try {
      const result = await lookup(query);
      if (!result) return;
      if (result.entries[0]) await select(result.entries[0].rin);
      else {
        ++selection.current;
        setBusy(false);
        setDetail(null);
        setOpen(true);
      }
    } catch {
      setError("Search is unavailable. Please try again.");
    }
  }
  return (
    <main className="record-monitor">
      <header>
        <button
          className="brand"
          onClick={() => {
            ++selection.current;
            ++searchId.current;
            setQuery("");
            setDetail(null);
            setMatches(null);
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
      <form onSubmit={submit} className="record-search">
        <label htmlFor="record-query">
          Which rule do you want to understand?
        </label>
        <div className="record-search-input">
          <input
            ref={input}
            id="record-query"
            role="combobox"
            aria-expanded={open && !!query.trim()}
            aria-controls="rule-matches"
            aria-autocomplete="list"
            aria-activedescendant={
              open && active >= 0 ? `match-${active}` : undefined
            }
            value={query}
            placeholder="Search a topic, rule name, or RIN"
            autoComplete="off"
            maxLength={200}
            onFocus={() => query.trim() && setOpen(true)}
            onChange={(e) => {
              ++selection.current;
              ++searchId.current;
              setDetail(null);
              setBusy(false);
              setSearching(false);
              setMatches(null);
              setQuery(e.target.value);
              setOpen(true);
              setError("");
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) =>
                  Math.min(a + 1, (matches?.entries.length ?? 1) - 1),
                );
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
            }}
          />
          <button type="submit" disabled={!query.trim() || searching}>
            {searching ? "Finding…" : "Find rule"}
          </button>
        </div>
        {open && query.trim() && (
          <div
            className="match-menu"
            id="rule-matches"
            role="listbox"
            aria-label="Matching rulemakings"
          >
            {matches?.entries.map((entry, i) => (
              <button
                type="button"
                id={`match-${i}`}
                role="option"
                aria-selected={active === i}
                key={entry.rin}
                onClick={() => void select(entry.rin)}
              >
                <strong>{entry.title}</strong>
                <span>
                  {entry.agency} · {entry.rin}
                </span>
              </button>
            ))}
            {matches?.entries.length === 0 && !searching && (
              <p>No matches. Try a shorter phrase or a rule number.</p>
            )}
            {!!matches?.entries.length && (
              <p>
                {matches.total > 6
                  ? `${matches.total} matches. Showing the closest six; narrow your search for more.`
                  : "Choose a match, or press Enter to open the closest."}
              </p>
            )}
          </div>
        )}
      </form>
      {!detail && !busy && !query && (
        <p className="search-hint">
          Try{" "}
          <button
            onClick={() => {
              setQuery("APOR");
              setOpen(true);
              input.current?.focus();
            }}
          >
            APOR
          </button>
          ,{" "}
          <button
            onClick={() => {
              setQuery("mortgage");
              setOpen(true);
              input.current?.focus();
            }}
          >
            mortgages
          </button>
          , or{" "}
          <button
            onClick={() => {
              setQuery("privacy");
              setOpen(true);
              input.current?.focus();
            }}
          >
            privacy
          </button>
          .
        </p>
      )}
      <div role="status" aria-live="polite">
        {busy && (
          <p className="record-status">
            {detail ? "Checking official sources…" : "Finding the rule…"}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="record-error">
          {error}
        </p>
      )}
      {detail && (
        <Record
          detail={detail}
          now={now}
          busy={busy}
          refresh={() => void refresh(detail.entry.rin)}
          heading={heading}
        />
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
function Evidence({ signals }: { signals: Signal[] }) {
  return (
    <ul className="record-evidence">
      {signals.map((signal) => (
        <li key={signal.id}>
          <strong>{signal.title}</strong>
          <p>{signal.raw_wording}</p>
          <Source href={signal.source_url}>{signal.source_name}</Source>
        </li>
      ))}
    </ul>
  );
}
function Record({
  detail,
  now,
  busy,
  refresh,
  heading,
}: {
  detail: RuleDetail;
  now: string;
  busy: boolean;
  refresh: () => void;
  heading: React.RefObject<HTMLHeadingElement | null>;
}) {
  const { entry, snapshot, prediction } = detail;
  const outlook = buildOutlook(entry, snapshot, now);
  const signals = snapshot?.signals ?? [];
  const generated = snapshot?.forecast.summary_method === "gemini";
  const summary = snapshot?.forecast.expected_change || entry.summary;
  const publication =
    signals.find((s) => s.signal_type === "FINAL_RULE_PUBLISHED") ??
    signals.find((s) => s.signal_type === "NPRM_PUBLISHED");
  const relevant = entry.timetable.filter((t) =>
    /nprm|proposed|final/i.test(t.action),
  );
  const target = relevant.filter((t) => parseAgendaDate(t.date).date).at(-1);
  const date = target ? parseAgendaDate(target.date).date : null;
  const freshPrediction =
    prediction &&
    prediction.evidence_cutoff === snapshot?.synced_at &&
    prediction.method_version === OUTLOOK_VERSION &&
    prediction.evaluation_version === detail.evaluation.version &&
    Date.parse(now) - Date.parse(prediction.evidence_cutoff) <= 86400000;
  const probability = freshPrediction ? prediction.probability : null;
  const evidence = signals.filter((s) => outlook.evidence_ids.includes(s.id));
  return (
    <article className="single-record">
      <div className="record-identity">
        <p>
          {entry.agency} · {entry.rin}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {entry.title}
        </h1>
      </div>
      <section className="generated-outlook" aria-label="Generated outlook">
        <div className="provenance inference">
          {outlook.kind === "known"
            ? "OFFICIAL EVENT · NO FORECAST NEEDED"
            : "GENERATED OUTLOOK · RULES-BASED INFERENCE"}
        </div>
        <h2>{outlook.headline}</h2>
        <p className="outlook-timing">
          <strong>When:</strong> {outlook.timing}
        </p>
        <p className="outlook-basis">{outlook.basis}</p>
        {probability !== null && (
          <p>
            <strong>{Math.round(probability * 100)}% estimated chance</strong>{" "}
            of{" "}
            {prediction?.target === "NPRM_PUBLISHED"
              ? "proposal"
              : "final-rule"}{" "}
            publication by {formatDate(prediction!.window_end.slice(0, 10))}.
          </p>
        )}
        <details>
          <summary>Why this outlook?</summary>
          <p>
            <strong>Watch next:</strong> {outlook.watch_for}
          </p>
          <p>
            <strong>What could change:</strong> {outlook.alternative}
          </p>
          <p>
            This is a directional inference from the current stage, not a tested
            probability of adoption. A missing agency date does not prevent this
            outlook; it does prevent quoting an official target.
          </p>
          <Evidence signals={evidence} />
          <p>
            RIN searches can miss publications with absent or incorrect
            identifiers.
          </p>
          {freshPrediction && (
            <Source href={`/api/forecasts/${prediction!.id}/evidence`}>
              Saved assessment
            </Source>
          )}
        </details>
      </section>
      <section className="change-summary" aria-label="Expected change">
        <div className={`provenance ${generated ? "ai" : "official"}`}>
          {generated ? "AI-GENERATED SUMMARY" : "OFFICIAL AGENDA EXCERPT"}
        </div>
        <h2>What could change</h2>
        <p className={generated ? "" : "official-excerpt"}>
          {summary || "No description supplied in the agenda."}
        </p>
        <details>
          <summary>Read the official wording</summary>
          <blockquote>{snapshot?.rule.summary || entry.summary}</blockquote>
          <Source href={snapshot?.rule.source_url || entry.source_url}>
            Government source
          </Source>
        </details>
      </section>
      <section className="official-record" aria-label="Official facts">
        <div className="provenance official">OFFICIAL RECORDS</div>
        <dl>
          <div>
            <dt>Agenda stage</dt>
            <dd>{snapshot?.rule.stage || entry.stage}</dd>
          </div>
          <div>
            <dt>Agency timetable</dt>
            <dd>
              {date
                ? `${formatDate(date)}${targetElapsed(date, new Date(now)) && !target?.fr_citation ? " · target passed" : ""}`
                : "No date listed"}
              <small>
                {target?.action || "Publication timing not specified"}
              </small>
            </dd>
          </div>
          <div>
            <dt>Publication found</dt>
            <dd>
              {publication
                ? `${publication.signal_type === "FINAL_RULE_PUBLISHED" ? "Final rule" : "Proposal"} · ${formatDate(publication.date)}`
                : snapshot?.federal_register_checked_at
                  ? "None in checked RIN search"
                  : "Not checked"}
            </dd>
          </div>
        </dl>
        <details>
          <summary>Sources & other dates</summary>
          <p>
            Agenda edition {entry.publication_id}. Agency timetable dates are
            plans or listed historical actions, not our predictions.
          </p>
          <p>
            CFR: {entry.cfr_citation.join(" · ") || "Not specified"}. Effective
            date: {formatDate(snapshot?.forecast.effective_date ?? null)}.
          </p>
          <ul>
            {entry.timetable.map((row, i) => (
              <li key={i}>
                {row.action}: {formatDate(parseAgendaDate(row.date).date)}
                {row.fr_citation ? ` · ${row.fr_citation}` : ""}
              </li>
            ))}
          </ul>
          <Source href={snapshot?.rule.source_url || entry.source_url}>
            Unified Agenda
          </Source>
          {publication && (
            <>
              {" "}
              ·{" "}
              <Source href={publication.source_url}>Published document</Source>
            </>
          )}
          {snapshot?.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </details>
      </section>
      <div className="record-bottom">
        <span>
          Checked {snapshot ? formatDate(snapshot.synced_at, true) : "not yet"}
        </span>
        <button onClick={refresh} disabled={busy}>
          {busy ? "Checking…" : "Refresh sources"}
        </button>
      </div>
      <details className="validation-note">
        <summary>How reliable is this forecast?</summary>
        <p>
          The next-step outlook uses explicit procedural rules. It predicts a
          direction, not whether the agency will adopt the change.
        </p>
        <p>
          Numerical chances and estimated publication dates are not yet
          validated. The historical audit found incorrect publication matches;
          percentages stay disabled until those labels and the evaluation are
          corrected.
        </p>
        <p>
          Our preliminary test included {detail.evaluation.counts.test} held-out
          cases. Software tests verify the rules behave correctly; they do not
          prove forecasting accuracy.
        </p>
        <p>
          Date estimates require separate validation on both dated and undated
          rules. A six-month observation window is not a promised publication
          date.
        </p>
      </details>
    </article>
  );
}
