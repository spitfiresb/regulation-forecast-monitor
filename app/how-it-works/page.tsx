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
    label: "Retrieve",
    title: "Official publications",
    detail:
      "The Federal Register API supplies rules, proposals, and regulatory notices. Search covers the past six months.",
  },
  {
    label: "Link",
    title: "Publication history",
    detail:
      "RINs and docket IDs locate related documents. Agency and docket or title checks keep unrelated proceedings separate. Earlier history is included.",
  },
  {
    label: "Assess",
    title: "AI forecast",
    detail:
      "Gemini reads the linked actions, abstracts, and dates. It weighs the sequence of changes and agency explanations to propose a next status, supporting reasons, and alternatives.",
  },
  {
    label: "Validate",
    title: "Evidence and record",
    detail:
      "The server checks the response format and citation IDs, then saves the assessment with its source history, model, and prompt version.",
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
          A research tool for tracking regulatory changes and assessing the next
          procedural step, with the publications behind each assessment.
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
            The model proposes a leading scenario and explains which
            publications support it. Repeated delays, for example, can support
            another delay; scheduled effectiveness and withdrawal remain
            alternatives.
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
            If Gemini is unavailable or its response fails validation, the
            result is explicitly labeled as a rules-based assessment.
          </p>
        </div>
      </section>
      <section className={styles.architecture}>
        <div>
          <h2>System architecture</h2>
          <p>
            Next.js serves the interface and server APIs. The server retrieves
            Federal Register records, calls Gemini, and stores cases and
            assessment snapshots in Supabase. Credentials stay on the server.
          </p>
        </div>
        <Link href="/architecture" className={styles.diagramLink}>
          Explore architecture <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <details className={styles.details}>
        <summary>Model inputs, validation & limitations</summary>
        <p>
          Gemini receives public publication metadata, action text, abstracts,
          date fields, the checked current status, and the assessment date. It
          does not receive database credentials or unrelated stored records.
          This is retrieval-grounded generation, not a model trained on this
          app’s cases.
        </p>
        <p>
          The model returns structured JSON with a proposed next status, concise
          forecast, cited reasons, and alternatives. Validation requires known
          document IDs and a citation to the latest publication, and rejects
          numerical claims and dates in model prose. These checks do not
          establish that every inference is correct.
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
          can use files when Supabase is unconfigured.
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
