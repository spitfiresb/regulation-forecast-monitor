import { ActivityMonitor } from "@/components/activity-monitor";
import { activityWindow, documentId } from "@/lib/activity/model";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const document =
    typeof params.document === "string" &&
    documentId.safeParse(params.document).success
      ? params.document
      : "";
  return (
    <ActivityMonitor
      initialQuery={q}
      initialDocument={document}
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
