import {
  ArchitectureDiagram,
  type DiagramNode,
  type DiagramEdge,
} from "@/components/architecture-diagram";

const nodes: DiagramNode[] = [
  {
    id: "records",
    title: "activity_records",
    description:
      "Latest case for a selected publication. Stores its publication date, checked_at timestamp, and complete case payload as JSONB.",
    keys: "PK document_number",
    x: 45,
    y: 100,
    tone: "storage",
  },
  {
    id: "assessments",
    title: "activity_assessments",
    description:
      "Immutable assessment snapshots, including research, validation findings, and model reviews. A content fingerprint deduplicates identical cases. Each assessment belongs to one selected publication.",
    keys: "PK fingerprint · FK document_number",
    x: 445,
    y: 100,
    tone: "storage",
  },
  {
    id: "source",
    title: "Source fields in the payload",
    description:
      "Selected publication, linked history, source URLs, linkage method, completeness, limitations, official excerpt, and current status.",
    keys: "JSONB fields, not a separate table",
    x: 45,
    y: 365,
  },
  {
    id: "forecast",
    title: "Forecast fields in the payload",
    description:
      "Target event, issue date, window end, reasons, counterargument, and watch signals. AI metadata retains tool actions, source excerpts, comparisons, review, model, prompt, and input hash.",
    keys: "JSONB fields, not a separate table",
    x: 445,
    y: 365,
  },
];
const edges: DiagramEdge[] = [
  { path: "M375 195 H445", label: "1 → many", x: 410, y: 178 },
  { path: "M210 290 V365", label: "payload", x: 249, y: 335 },
  { path: "M610 290 V365", label: "payload", x: 650, y: 335 },
];
export default function DataModelPage() {
  return (
    <ArchitectureDiagram
      title="Current data model"
      description="Two active Supabase tables, saved together through save_activity_case. Row-level security restricts access to the server. Eight retained legacy tables are outside this MVP's current workflow."
      nodes={nodes}
      edges={edges}
      width={820}
      height={590}
      nodeWidth={330}
      nodeHeight={190}
      database
    />
  );
}
