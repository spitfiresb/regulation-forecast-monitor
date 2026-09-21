import Link from "next/link";
import type { ActivityCase } from "@/lib/activity/model";
import { formatDate } from "@/lib/dates";
import { displayText } from "@/lib/display-text";

const toolNames = {
  read_publication: "Read official text",
  find_comparables: "Search historical cases",
  trace_comparable: "Trace a historical case",
};

export function ForecastResearch({ record }: { record: ActivityCase }) {
  const { assessment } = record;
  const ai = assessment.ai;
  const prediction = ai?.prediction;
  const research = ai?.research;
  const sources =
    research?.sources ??
    record.history.map(({ document: d }) => ({
      id: d.document_number,
      title: d.title,
      url: d.html_url,
      publication_date: d.publication_date,
    }));
  function sourceLinks(ids: string[]) {
    return ids.map((id) => {
      const s = sources.find((source) => source.id === id);
      return s ? (
        <li key={id}>
          <a href={s.url} target="_blank" rel="noreferrer">
            {displayText(s.title)} · {formatDate(s.publication_date)} ↗
          </a>
        </li>
      ) : null;
    });
  }
  return (
    <>
      {research && (
        <details className="research-details">
          <summary>
            Research performed · {research.steps.length} source actions
          </summary>
          <p>
            The model chose these research actions. Historical matches are
            selected examples, not a statistical sample.
          </p>
          <ol className="research-steps">
            {research.steps.map((step, index) => (
              <li key={index}>
                <strong>
                  {toolNames[step.tool]}
                  {step.status === "failed" ? " · Unavailable" : ""}
                </strong>
                <p className="ai-inline">{displayText(step.purpose)}</p>
                {step.query && (
                  <p className="research-query">
                    Query:{" "}
                    <span className="ai-inline">{displayText(step.query)}</span>
                  </p>
                )}
                <p>{displayText(step.result)}</p>
                <ul className="research-sources">
                  {sourceLinks(step.source_ids)}
                </ul>
              </li>
            ))}
          </ol>
          {research.sources
            .filter((s) => s.full_text_read)
            .map((s) => (
              <details key={s.id} className="research-excerpt">
                <summary>Inspected text · {s.id}</summary>
                {s.text_url && (
                  <p>
                    <a href={s.text_url} target="_blank" rel="noreferrer">
                      Open the inspected official text ↗
                    </a>
                  </p>
                )}
                <p className="source-passage">{displayText(s.excerpt)}</p>
              </details>
            ))}
        </details>
      )}
      <details>
        <summary>Evidence, alternatives & limitations</summary>
        {prediction && (
          <div className="ai-generated forecast-reasoning">
            <h3>Why this window</h3>
            <p>{displayText(prediction.horizon_basis)}</p>
            <h3>Strongest counterargument</h3>
            <p>{displayText(prediction.counterargument)}</p>
            <h3>What would change the forecast</h3>
            <ul>
              {prediction.watch_for.map((line) => (
                <li key={line}>{displayText(line)}</li>
              ))}
            </ul>
            {prediction.missing_evidence.length > 0 && (
              <>
                <h3>Missing evidence</h3>
                <ul>
                  {prediction.missing_evidence.map((line) => (
                    <li key={line}>{displayText(line)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {assessment.alternatives.length > 0 && (
          <ul
            className={
              ai?.status === "generated"
                ? "ai-generated ai-alternatives"
                : undefined
            }
          >
            {assessment.alternatives.map((line) => (
              <li key={line}>{displayText(line)}</li>
            ))}
          </ul>
        )}
        <ul className="research-sources">{sourceLinks(assessment.evidence)}</ul>
        {ai?.review && (
          <p>
            Model review:{" "}
            {ai.review.approved
              ? "passed evidence and specificity checks"
              : "forecast withheld"}
            . This is a second model call, not independent human verification.
          </p>
        )}
        <p>
          Experimental forecast. Accuracy has not been measured. Citation checks
          and model review do not establish that every inference is correct.
        </p>
        {record.limitations.map((line) => (
          <p key={line}>{displayText(line)}</p>
        ))}
        <p>
          The browsing window covers six months of updates. The forecast window
          is chosen separately and concerns a future publication, not legal
          enforceability.
        </p>
        {ai && (
          <p>
            Model: {ai.model} · Prompt: {ai.prompt_version}
          </p>
        )}
        <p>
          <Link href="/how-it-works">How forecasts are generated →</Link>
        </p>
      </details>
    </>
  );
}
