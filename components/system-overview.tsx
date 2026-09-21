import { ArrowRight } from "lucide-react";
import styles from "./system-overview.module.css";

const steps = [
  {
    title: "Find an update",
    detail:
      "Search the Federal Register—the government’s published rules and notices—from the past six months.",
  },
  {
    title: "Trace its history",
    detail:
      "Pick an update. We link related publications, including older ones, and collect actions and dates.",
  },
  {
    title: "Assess what’s next",
    detail:
      "Fixed rules assess the latest status and next step. For example, repeated delays suggest another delay.",
  },
  {
    title: "See the evidence",
    detail:
      "Get a short assessment, other possible outcomes, and links to the official sources behind it.",
  },
];

export function SystemOverview({ hidden }: { hidden: boolean }) {
  return (
    <section
      id="system-overview"
      className={styles.overview}
      aria-labelledby="system-overview-title"
      hidden={hidden}
    >
      <h2 id="system-overview-title">
        From a government update to what might happen next
      </h2>
      <ol className={styles.flow}>
        {steps.map((step, index) => (
          <li className={styles.step} key={step.title}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
            {index < steps.length - 1 && (
              <ArrowRight
                className={styles.arrow}
                size={18}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
      <p className={styles.note}>
        These are estimates, not guarantees or AI predictions. If the evidence
        is incomplete or unclear, we say so instead of guessing.
      </p>
    </section>
  );
}
