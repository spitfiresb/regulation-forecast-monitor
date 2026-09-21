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
    title: "Generate with Gemini",
    description:
      "Eligible history, abstracts, actions, and dates go to Gemini. It returns a next-status scenario, cited reasons, and alternatives, or abstains.",
    x: 725,
    y: 40,
  },
  {
    id: "validation",
    title: "Validate or use a fallback",
    description:
      "Validate JSON and source IDs, including a latest-publication citation. Reject numerical claims. AI failure produces a labeled rules-based fallback.",
    x: 725,
    y: 320,
  },
  {
    id: "storage",
    title: "Save the evidence",
    description:
      "Supabase atomically saves the latest case and an immutable assessment. The snapshot includes history, model, prompt version, input hash, and citations.",
    x: 375,
    y: 320,
    tone: "storage",
  },
  {
    id: "display",
    title: "Display and refresh",
    description:
      "Only AI-generated text is blue. Official facts stay separate. Cases are cached for up to an hour; Refresh history retrieves and assesses sources again.",
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
