"use client";

import { MiniMap, type MiniMarker } from "@/components/map/mini-map";

export function SharedMap({ markers }: { markers: MiniMarker[] }) {
  return <MiniMap markers={markers} height={320} zoom={13} />;
}
