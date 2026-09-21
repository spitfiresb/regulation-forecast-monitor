import {
  ArchitectureDiagram,
  type DiagramNode,
  type DiagramEdge,
} from "@/components/architecture-diagram";

const nodes: DiagramNode[] = [
  {
    id: "search",
    title: "Search recent activity",
    description:
      "Find Federal Register rules and notices published in the past six calendar months.",
    x: 25,
    y: 50,
  },
  {
    id: "history",
    title: "Link publication history",
    description:
      "Select an update. Match related publications by identifiers, agency, and docket or title, including older history.",
    x: 375,
    y: 50,
    tone: "source",
  },
  {
    id: "assessment",
    title: "Assess the next status",
    description:
      "Fixed rules read actions and dates. Incomplete or ambiguous evidence produces an unresolved assessment.",
    x: 725,
    y: 50,
  },
  {
    id: "storage",
    title: "Save case and assessment",
    description:
      "Supabase saves the latest case and immutable assessment together. Local files are the development fallback.",
    x: 725,
    y: 350,
    tone: "storage",
  },
  {
    id: "monitor",
    title: "Show the evidence",
    description:
      "Display current status, an experimental next-step estimate, alternatives, official excerpts, and source links.",
    x: 375,
    y: 350,
  },
  {
    id: "recheck",
    title: "Check again",
    description:
      "Saved cases can be reused briefly. An explicit recheck fetches source history again; identical evidence is deduplicated.",
    x: 25,
    y: 350,
  },
];
const edges: DiagramEdge[] = [
  { path: "M305 140 H375" },
  { path: "M655 140 H725" },
  { path: "M865 230 V350" },
  { path: "M725 440 H655" },
  { path: "M375 440 H305" },
  { path: "M165 350 V280 H515 V230" },
];
export default function ArchitecturePage() {
  return (
    <ArchitectureDiagram
      title="Current system flow"
      description="Recent publications → linked history → evidence-backed next-status assessment. This flow uses fixed rules, not Gemini or the legacy probability experiment."
      nodes={nodes}
      edges={edges}
      width={1030}
      height={570}
      nodeWidth={280}
      nodeHeight={180}
    />
  );
}
