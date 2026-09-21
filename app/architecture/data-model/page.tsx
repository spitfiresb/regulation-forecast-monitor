import {
  ArchitectureDiagram,
  type DiagramNode,
  type DiagramEdge,
} from "@/components/architecture-diagram";

const nodes: DiagramNode[] = [
  {
    id: "rules",
    title: "rules",
    description:
      "The latest official title, abstract, stage, and agenda details for each rule.",
    keys: "id · primary key     rin · unique",
    x: 400,
    y: 105,
    tone: "storage",
  },
  {
    id: "signals",
    title: "signals",
    description:
      "Source wording, dates, and links form a deduplicated history of rulemaking evidence.",
    keys: "id · primary key     rule_id · foreign key",
    x: 50,
    y: 365,
    tone: "storage",
  },
  {
    id: "forecasts",
    title: "forecasts",
    description:
      "The latest progress, summary, and timing link back to their supporting evidence.",
    keys: "id · primary key     rule_id · unique foreign key",
    x: 400,
    y: 365,
    tone: "storage",
  },
  {
    id: "runs",
    title: "sync_runs",
    description:
      "Each successful check saves a complete snapshot; the newest powers the monitor.",
    keys: "id · primary key     rule_id · foreign key",
    x: 750,
    y: 365,
    tone: "storage",
  },
];
const edges: DiagramEdge[] = [
  { path: "M550 285 V300 H200 V365", label: "1 → many", x: 200, y: 345 },
  { path: "M550 300 V365", label: "1 → 0 or 1", x: 615, y: 345 },
  { path: "M550 300 H900 V365", label: "1 → many", x: 900, y: 345 },
];
export default function DataModelPage() {
  return (
    <ArchitectureDiagram
      title="Data model"
      description="Four related tables, hosted in Supabase PostgreSQL."
      nodes={nodes}
      edges={edges}
      width={1100}
      height={575}
      nodeWidth={300}
      nodeHeight={180}
      database
    />
  );
}
