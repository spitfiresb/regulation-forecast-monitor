import { Dashboard } from "@/components/dashboard";
import { getDashboard } from "@/lib/repository";
export const dynamic = "force-dynamic";
export default async function Home() {
  const initial = await getDashboard();
  return <Dashboard initial={initial} asOf={initial.as_of} />;
}
