import { ALL_MISSIONS } from "@/lib/missions";
import Workspace from "@/components/Workspace";

export function generateStaticParams() {
  return ALL_MISSIONS.map((m) => ({ id: m.id }));
}

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Workspace missionId={id} />;
}
