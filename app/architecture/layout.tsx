import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Workflow } from "lucide-react";
import { ArchitectureNav } from "@/components/architecture-nav";
import "./architecture.css";

export const metadata: Metadata = {
  title: "Architecture | Regulatory Forecast Monitor",
  description:
    "System flow and Supabase data model for the Regulatory Forecast Monitor.",
};

export default function ArchitectureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="architecture-shell">
      <header className="architecture-header">
        <div className="architecture-brand">
          <Workflow size={21} aria-hidden="true" />
          <span>
            Regulatory Monitor{" "}
            <span className="architecture-brand-detail">/ Architecture</span>
          </span>
        </div>
        <Link href="/" className="architecture-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to monitor
        </Link>
      </header>
      <div className="architecture-workspace">
        <aside className="architecture-sidebar">
          <ArchitectureNav />
        </aside>
        <main className="architecture-main">{children}</main>
      </div>
    </div>
  );
}
