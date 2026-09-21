"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>The monitor couldn’t load.</h1>
      <p>Please try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
