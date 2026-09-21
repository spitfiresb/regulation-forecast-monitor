import { ActivityMonitor } from "@/components/activity-monitor";
import { curatedExamples } from "@/lib/activity/examples";
import { activityWindow, documentId } from "@/lib/activity/model";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const document =
    typeof params.document === "string" &&
    documentId.safeParse(params.document).success
      ? params.document
      : "";
  return (
    <ActivityMonitor
      initialDocument={document}
      initialExample={
        typeof params.example === "string" &&
        curatedExamples.some((e) => e.id === params.example)
          ? params.example
          : ""
      }
      initialAgency={
        typeof params.agency === "string" && /^\d+$/.test(params.agency)
          ? params.agency
          : ""
      }
      initialType={
        typeof params.type === "string" &&
        ["RULE", "PRORULE", "NOTICE"].includes(params.type)
          ? params.type
          : ""
      }
      initialPage={
        typeof params.page === "string"
          ? Math.min(1000, Math.max(1, Math.floor(Number(params.page)) || 1))
          : 1
      }
      window={activityWindow()}
    />
  );
}
