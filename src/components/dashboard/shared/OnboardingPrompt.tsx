"use client";

import { Building2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingPromptProps {
  onCreateBranch: () => void;
}

export function OnboardingPrompt({ onCreateBranch }: OnboardingPromptProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div
        className="max-w-[480px] w-full rounded-[6px] border border-[#e5edf5] bg-white p-8 text-center"
        style={{
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
        }}
      >
        <div className="flex justify-center mb-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ededfc]">
            <Building2 className="h-6 w-6 text-[#533afd]" strokeWidth={1.5} />
          </div>
        </div>
        <h2 className="text-[23px] font-light tracking-[-0.23px] text-[#061b31] mb-2">
          Welcome to SmartChiro
        </h2>
        <p className="text-[15px] text-[#273951] mb-6 leading-relaxed">
          Get started by creating your first branch, or wait for a branch owner to invite you.
        </p>

        <Button
          onClick={onCreateBranch}
          className="w-full h-10 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[15px] font-medium mb-3 cursor-pointer"
        >
          <Building2 className="h-4 w-4 mr-2" strokeWidth={1.5} />
          Create your first branch
        </Button>

        <div className="flex items-center gap-2 justify-center text-[14px] text-[#64748d]">
          <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Or wait for an invitation from a branch owner</span>
        </div>
      </div>
    </div>
  );
}
