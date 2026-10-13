import { Suspense } from "react";
import { MapExplorer } from "@/components/map/explorer";
import { requireUser } from "@/lib/auth";

export default async function MapPage() {
  const user = await requireUser();
  return (
    <Suspense>
      <MapExplorer userName={user.name} />
    </Suspense>
  );
}
