"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DetectLandmarksRejection, PelvisImageAssessment } from "@/types/pelvis";

interface PelvisRejectedDialogProps {
  open: boolean;
  /** The 422 body from POST /api/viewer/detect-landmarks. Kept after close so the content doesn't blank mid-animation. */
  rejection: DetectLandmarksRejection | null;
  onClose: () => void;
}

const REGION_TEXT: Record<PelvisImageAssessment["region"], string> = {
  pelvis: "pelvis",
  full_spine: "full spine",
  lumbar: "lumbar spine",
  hip: "hip",
  chest: "chest",
  other: "other region",
};

/** e.g. "Seen: AP · full spine · radiograph". */
function seenSummary(a: PelvisImageAssessment): string {
  const parts = [
    a.projection === "unknown" ? "unknown view" : a.projection === "other" ? "other view" : a.projection,
    REGION_TEXT[a.region],
    a.isRadiograph ? "radiograph" : "not a radiograph",
  ];
  return `Seen: ${parts.join(" · ")}`;
}

/** Shown when the AI gate decides the film isn't an AP pelvis it can analyse. */
export function PelvisRejectedDialog({ open, rejection, onClose }: PelvisRejectedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] text-foreground">
            This X-ray can&apos;t be analysed by AI
          </DialogTitle>
          <DialogDescription className="text-[14px] text-fg-secondary">
            {rejection?.message ?? "No landmarks were placed."}
          </DialogDescription>
        </DialogHeader>
        {rejection && (
          <>
            {rejection.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-[14px] text-foreground">
                {rejection.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            <div className="space-y-1 text-[13px] text-fg-muted">
              <p>{seenSummary(rejection.assessment)}</p>
              {rejection.assessment.notes && <p>{rejection.assessment.notes}</p>}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
