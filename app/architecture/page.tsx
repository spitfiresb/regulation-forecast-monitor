import {
  ArchitectureDiagram,
  type DiagramNode,
  type DiagramEdge,
} from "@/components/architecture-diagram";

const nodes: DiagramNode[] = [
  {
    id: "browse",
    title: "Browse official changes",
    description:
      "Agency and publication filters query the Federal Register API. Only publications from the past six months appear in the listing.",
    x: 25,
    y: 40,
    tone: "source",
  },
  {
    id: "history",
    title: "Link history and check status",
    description:
      "RIN or docket lookup retrieves older context. Identity, completeness, action, and date checks establish status and decide forecast eligibility.",
    x: 375,
    y: 40,
    tone: "source",
  },
  {
    id: "ai",
    title: "Agent researches evidence",
    description:
      "Gemini chooses official text reads, historical searches, and comparison traces. Up to three rounds adapt to returned evidence; six source actions maximum.",
    x: 725,
    y: 40,
  },
  {
    id: "validation",
    title: "Forecast and challenge",
    description:
      "Generate a future event and 90, 180, or 365 day window. Validate citations and eligibility; a second model call reviews reasoning. Failed checks withhold predictions.",
    x: 725,
    y: 320,
  },
  {
    id: "storage",
    title: "Save the evidence",
    description:
      "Supabase atomically saves the latest case and an immutable assessment. The snapshot includes source passages, tool actions, comparisons, the forecast contract, review, model, prompt version, and input hash.",
    x: 375,
    y: 320,
    tone: "storage",
  },
  {
    id: "display",
    title: "Display and refresh",
    description:
      "Source facts stay separate from blue AI text. Live cases cache for one hour; refresh reruns research. Curated links open dated JSON snapshots instantly.",
    x: 25,
    y: 320,
  },
];
const edges: DiagramEdge[] = [
  { path: "M325 135 H375" },
  { path: "M675 135 H725" },
  { path: "M875 230 V320" },
  { path: "M725 415 H675" },
  { path: "M375 415 H325" },
];
export default function ArchitecturePage() {
  return (
    <ArchitectureDiagram
      title="System architecture"
      description="Next.js on Cloudflare Workers connects official publications, source checks, Gemini, and Supabase. Incomplete or ambiguous evidence bypasses AI and withholds a forecast."
      nodes={nodes}
      edges={edges}
      width={1050}
      height={550}
      nodeWidth={300}
      nodeHeight={190}
    />
  );
}
