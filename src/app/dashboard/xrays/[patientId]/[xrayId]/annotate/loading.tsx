import { Loader2 } from "lucide-react";

// The viewer is full-screen and dark; keep that while it loads instead of
// flashing the light dashboard skeleton.
export default function AnnotateLoading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#1A1F36]" aria-busy="true" aria-label="Loading X-ray">
      <Loader2 className="h-6 w-6 animate-spin text-[#cdd5e2]" strokeWidth={1.5} />
    </div>
  );
}
