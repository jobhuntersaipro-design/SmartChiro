"use client";

import dynamic from "next/dynamic";

const AnatomyStudio = dynamic(
  () => import("./AnatomyStudio").then((mod) => mod.AnatomyStudio),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[50vh] items-center justify-center text-[15px] text-[#425466]">
        Opening anatomy
      </div>
    ),
  },
);

export function AnatomyLoader() {
  return <AnatomyStudio />;
}
