import {
  ArchitectureDiagram,
  type DiagramNode,
  type DiagramEdge,
} from "@/components/architecture-diagram";

const nodes: DiagramNode[] = [
  {
    id: "activity",
    title: "activity_records",
    description:
      "Current homepage: the latest retrieved case, linked history, and status assessment.",
    keys: "document_number · primary key",
    x: 50,
    y: 50,
    tone: "storage",
  },
  {
    id: "assessments",
    title: "activity_assessments",
    description:
      "Immutable assessments with their evidence. Identical content is saved only once.",
    keys: "fingerprint · PK    document_number · FK",
    x: 400,
    y: 50,
    tone: "storage",
  },
  {
    id: "catalog",
    title: "rule_catalog",
    description:
      "Retained agenda catalog. Superseded entries remain marked non-current; import does not create forecasts.",
    keys: "id · primary key    rin · unique",
    x: 50,
    y: 310,
    tone: "storage",
  },
  {
    id: "import",
    title: "catalog_import",
    description:
      "Latest complete agenda import: edition, source URL, observation time, and entry count.",
    keys: "singleton · primary key",
    x: 400,
    y: 310,
    tone: "storage",
  },
  {
    id: "resolutions",
    title: "prediction_resolutions",
    description:
      "Append-only observed outcomes for the retained publication-forecast experiment.",
    keys: "id · PK    prediction_id · FK",
    x: 750,
    y: 310,
    tone: "storage",
  },
  {
    id: "rules",
    title: "rules",
    description:
      "Legacy agenda monitor: latest complete rule snapshot, retained independently of change history.",
    keys: "id · primary key    rin · unique",
    x: 400,
    y: 570,
    tone: "storage",
  },
  {
    id: "predictions",
    title: "prediction_issues",
    description:
      "Immutable legacy forecast issues, including source evidence and the original evaluation report.",
    keys: "id · primary key    rule_id · foreign key",
    x: 750,
    y: 570,
    tone: "storage",
  },
  {
    id: "signals",
    title: "signals",
    description:
      "Deduplicated source evidence with wording, dates, links, and observation timestamps.",
    keys: "id · primary key    rule_id · foreign key",
    x: 50,
    y: 830,
    tone: "storage",
  },
  {
    id: "forecasts",
    title: "forecasts",
    description:
      "Latest legacy procedural assessment. Conclusions link back to supporting evidence.",
    keys: "id · PK    rule_id · unique foreign key",
    x: 400,
    y: 830,
    tone: "storage",
  },
  {
    id: "runs",
    title: "sync_runs",
    description:
      "Changed snapshots from six calendar months. Unchanged checks update only the current record.",
    keys: "id · primary key    rule_id · foreign key",
    x: 750,
    y: 830,
    tone: "storage",
  },
];
const edges: DiagramEdge[] = [
  { path: "M350 140 H400", label: "1 → many", x: 375, y: 120 },
  { path: "M700 660 H750", label: "1 → many", x: 725, y: 640 },
  { path: "M900 570 V490", label: "1 → many", x: 960, y: 530 },
  { path: "M550 750 V780 H200 V830", label: "1 → many", x: 200, y: 810 },
  { path: "M550 780 V830", label: "1 → 0 or 1", x: 615, y: 810 },
  { path: "M550 780 H900 V830", label: "1 → many", x: 900, y: 810 },
];
export default function DataModelPage() {
  return (
    <ArchitectureDiagram
      title="Data model"
      description="Ten server-only Supabase tables: current activity records at the top, plus the retained agenda catalog, monitor, and forecast experiment. Lines show foreign-key relationships."
      nodes={nodes}
      edges={edges}
      width={1100}
      height={1050}
      nodeWidth={300}
      nodeHeight={180}
      database
    />
  );
}
