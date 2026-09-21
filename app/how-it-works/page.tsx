import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How it works | Regulatory Forecast Monitor",
  description:
    "How official regulatory history becomes an evidence-linked AI forecast.",
};

const steps = [
  {
    label: "Establish",
    title: "Source history",
    detail:
      "The server links Federal Register publications by agency, RIN, and docket. Source checks establish the current status and decide whether the history is reliable enough to investigate.",
  },
  {
    label: "Investigate",
    title: "Model-directed research",
    detail:
      "Gemini chooses what to read and which historical cases to search. It can inspect official document passages, follow a comparison's history, and revise its search after seeing the results. The loop allows three rounds and six source actions.",
  },
  {
    label: "Forecast",
    title: "A testable future event",
    detail:
      "The model selects a future publication event and a 90, 180, or 365 day window. It must explain why the evidence favors that event, identify a counterargument, and state what would change its view. It can abstain.",
  },
  {
    label: "Review",
    title: "Challenge and preserve",
    detail:
      "The server validates event eligibility and citations. A separate Gemini call challenges the forecast's specificity, evidence, and timing. A rejected draft may be revised once against the feedback and reviewed again. The app saves the research trace, source excerpts, forecast window, and review together.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Regulatory Forecast Monitor
        </Link>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to monitor
        </Link>
      </header>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>How it works</p>
        <h1>
          From regulatory history
          <br />
          to an AI forecast.
        </h1>
        <p>
          An early MVP that investigates regulatory changes and forecasts future
          publication events, with an inspectable research trail.
        </p>
      </div>
      <ol className={styles.flow} aria-label="Forecast pipeline">
        {steps.map((step, index) => (
          <li key={step.label}>
            <span className={styles.step}>
              {String(index + 1).padStart(2, "0")} / {step.label}
            </span>
            <h2>{step.title}</h2>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
      <section className={styles.explanation}>
        <div>
          <h2>What the AI decides</h2>
          <p>
            The model chooses research actions, compares retrieved evidence, and
            proposes a future event within a stated window. A current status
            such as “comments open” is not a forecast. “Another effective-date
            delay within 180 days” is a claim that can be checked later.
          </p>
          <p>
            Current status and published dates come from source checks. The AI
            cannot change those fields or override a decision to withhold a
            forecast.
          </p>
        </div>
        <div>
          <h2>When a forecast is withheld</h2>
          <p>
            Incomplete history, uncertain document links, conflicting same-day
            actions, and unresolved status stop AI forecasting. The model can
            also decline to choose a scenario.
          </p>
          <p>
            Unfinished source research, failed validation, or a rejected model
            review also withhold the prediction. The app preserves the source
            findings and explains the failure.
          </p>
        </div>
      </section>
      <section className={styles.architecture}>
        <div>
          <h2>System architecture</h2>
          <p>
            Next.js serves the interface and server APIs. The server runs the
            bounded research loop, retrieves Federal Register records, calls
            Gemini, and stores cases and assessment snapshots in Supabase.
            Credentials stay on the server.
          </p>
        </div>
        <Link href="/architecture" className={styles.diagramLink}>
          Explore architecture <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <p className={styles.mvpNote}>
        This MVP demonstrates the workflow. Company-specific impact analysis,
        alerts, and measured forecast accuracy are future work.
      </p>
      <details className={styles.details}>
        <summary>Model inputs, validation & limitations</summary>
        <p>
          Gemini receives checked publication history and the results of its
          chosen source tools. Longer documents are supplied as explicitly
          selected passages, not silently treated as complete readings. The
          source trace includes the exact passages inspected and their text URL.
          GovInfo provides the official fallback when Federal Register text is
          unavailable. This uses an existing model; it does not train a new
          model on the app’s cases.
        </p>
        <p>
          Historical searches cover up to 15 years, within the same agency.
          Matches are selected examples, not a representative sample. An
          incomplete comparison cannot establish a proposal-to-final interval.
          Discovery-only matches cannot be cited as inspected evidence.
        </p>
        <p>
          Structured output requires a future event, window, cited reasons,
          counterargument, alternatives, and signals to watch. Validation
          rejects unknown or uninspected citations and numerical probabilities.
          The review call is a critique, not independent human review or proof
          of predictive accuracy.
        </p>
        <p>
          The forecast has no measured probability or validated accuracy score.
          Missing metadata, court decisions, and unpublished agency actions can
          change the picture. A publication or elapsed effective date does not
          establish current legal enforceability.
        </p>
        <p>
          Cases can be reused for up to an hour on the same UTC day. Refresh
          history retrieves the sources and reassesses them. Production stores
          the latest case and immutable assessment snapshots; local development
          can use files when Supabase is unconfigured. Curated example links
          always retrieve sources and run new AI research, bypassing the cached
          assessment. They contain no saved forecast text.
        </p>
      </details>
      <footer className={styles.footer}>
        Sources:{" "}
        <a
          href="https://www.federalregister.gov/developers/documentation/api/v1"
          target="_blank"
          rel="noreferrer"
        >
          Federal Register API ↗
        </a>
        <a
          href="https://ai.google.dev/gemini-api/docs/structured-output"
          target="_blank"
          rel="noreferrer"
        >
          Gemini structured output ↗
        </a>
      </footer>
    </main>
  );
}
