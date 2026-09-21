import {
  ArchitectureDiagram,
  type DiagramNode,
  type DiagramEdge,
} from "@/components/architecture-diagram";

const nodes: DiagramNode[] = [
  {
    id: "refresh",
    title: "Refresh",
    description:
      "A manual refresh checks official sources for the latest rulemaking evidence.",
    x: 25,
    y: 140,
  },
  {
    id: "agenda",
    title: "Reginfo",
    description:
      "The current agenda supplies the rule’s abstract, stage, and planned dates.",
    x: 325,
    y: 30,
    tone: "source",
  },
  {
    id: "register",
    title: "Federal Register",
    description:
      "An exact-RIN search finds published proposals, comment windows, and final rules.",
    x: 325,
    y: 250,
    tone: "source",
  },
  {
    id: "forecast",
    title: "Forecast engine",
    description:
      "Evidence determines procedural progress and timing, with a source for each conclusion.",
    x: 625,
    y: 140,
  },
  {
    id: "summary",
    title: "Gemini summary",
    description:
      "Optional AI simplifies the abstract, falling back to official wording when unavailable.",
    x: 925,
    y: 140,
    tone: "optional",
  },
  {
    id: "comparison",
    title: "Compare & validate",
    description:
      "Compare official changes with the previous check and validate the complete snapshot.",
    x: 925,
    y: 430,
  },
  {
    id: "storage",
    title: "Supabase",
    description:
      "Save current records and snapshot history together, using a local file when unconfigured.",
    x: 625,
    y: 430,
    tone: "storage",
  },
  {
    id: "dashboard",
    title: "Monitor",
    description:
      "Display the saved forecast, changes, and linked evidence, with warnings for stale or failed checks.",
    x: 325,
    y: 430,
  },
];
const edges: DiagramEdge[] = [
  { path: "M265 210 H295 V100 H325" },
  { path: "M295 210 V320 H325" },
  { path: "M565 100 H595 V210 H625" },
  { path: "M565 320 H595 V210" },
  { path: "M865 210 H925" },
  { path: "M1045 280 V430" },
  { path: "M925 500 H865" },
  { path: "M625 500 H565" },
];
export default function ArchitecturePage() {
  return (
    <ArchitectureDiagram
      title="System flow"
      description="From official sources to an evidence-backed forecast."
      nodes={nodes}
      edges={edges}
      width={1200}
      height={600}
    />
  );
}
