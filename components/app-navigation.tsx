"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CircleHelp, Info, X, ArrowRight } from "lucide-react";

export function AppNavigation() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div className="site-topbar">
        <p className="ai-legend">
          <span aria-hidden="true">*</span> Text highlighted in light blue or
          shown in blue is AI generated.
        </p>
        <a
          className="repository-link"
          href="https://github.com/spitfiresb/regulation-z-forecast-monitor"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub (opens in a new tab)"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
      <nav className="floating-nav" aria-label="Main navigation">
        <Link
          href="/"
          onClick={(event) => {
            // A home click also clears a selected case held in client state.
            if (pathname === "/") {
              event.preventDefault();
              dispatchEvent(new Event("monitor:home"));
            }
          }}
          className="floating-action"
          aria-label="Home"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <Home size={18} aria-hidden="true" />
          <span className="nav-tooltip" aria-hidden="true">
            Home
          </span>
        </Link>
        <Link
          href="/how-it-works"
          className="floating-action"
          aria-label="How it Works"
          aria-current={pathname === "/how-it-works" ? "page" : undefined}
        >
          <CircleHelp size={18} aria-hidden="true" />
          <span className="nav-tooltip" aria-hidden="true">
            How it Works
          </span>
        </Link>
        <button
          type="button"
          className="floating-action"
          aria-label="What's the point of this?"
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          <Info size={18} aria-hidden="true" />
          <span className="nav-tooltip" aria-hidden="true">
            What&apos;s the point of this?
          </span>
        </button>
      </nav>
      <dialog
        ref={dialog}
        className="purpose-dialog"
        aria-labelledby="purpose-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="purpose-content">
          <button
            className="dialog-close"
            type="button"
            aria-label="Close explanation"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <span className="mvp-label">MVP concept</span>
          <h2 id="purpose-title">
            Regulations change.
            <br />
            The context should keep up.
          </h2>
          <p>
            Kobalt Labs helps companies understand how current regulations apply
            to their documents and circumstances. This concept explores a
            companion data layer: tracking how those regulations change and
            anticipating what could happen next.
          </p>
          <p>
            The foundation is accurate, traceable regulatory data. This monitor
            links official publications into a history, separates observed
            changes from AI forecasts, and keeps the evidence behind each
            assessment.
          </p>
          <h2>What this could become</h2>
          <ul>
            <li>
              Connect regulatory changes to a company&apos;s documents and
              obligations.
            </li>
            <li>
              Flag developments early so teams can prepare before changes take
              effect.
            </li>
            <li>
              Track forecast outcomes and improve the data and models over time.
            </li>
          </ul>
          <p className="mvp-note">
            This is an early MVP, nowhere near a finished product. It
            demonstrates the data and forecasting workflow. Company-specific
            impact analysis, alerts, and validated predictive accuracy are
            future work.
          </p>
          <Link
            href="/architecture"
            className="purpose-link"
            onClick={() => dialog.current?.close()}
          >
            Explore the architecture <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </dialog>
    </>
  );
}
