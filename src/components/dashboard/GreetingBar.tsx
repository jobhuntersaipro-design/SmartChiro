"use client";

import { useState, useCallback } from "react";
import { BranchPicker } from "./BranchPicker";
import { RefreshCw } from "lucide-react";
import type { BranchRole } from "@prisma/client";

interface GreetingBarProps {
  userName: string | null;
  branchRole: BranchRole | null;
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  onBranchChange: (branchId: string | null) => void;
}

const QUOTES = [
  "The spine is the lifeline. A lot of people should go and get a chiropractic adjustment. — Jack LaLanne",
  "Every patient carries their own doctor inside. We just help them discover it.",
  "The nervous system holds the key to the body's incredible potential to heal itself. — Sir Jay Holder",
  "Look to the spine for the cause of disease. — Hippocrates",
  "The doctor of the future will give no medicine, but will interest his patients in the care of the human frame. — Thomas Edison",
  "Chiropractic care is more than just making the pain disappear. It is about learning, understanding, and taking care of your body.",
  "The power that made the body, heals the body. — B.J. Palmer",
  "Good health is not something we can buy. However, it can be an extremely valuable savings account. — Anne Wilson Schaef",
  "Healing is a matter of time, but it is sometimes also a matter of opportunity. — Hippocrates",
  "The preservation of health is easier than the cure of disease. — B.J. Palmer",
  "To keep the body in good health is a duty, otherwise we shall not be able to keep our mind strong and clear. — Buddha",
  "Take care of your body. It's the only place you have to live. — Jim Rohn",
  "A subluxation-free spine is the foundation of wellness.",
  "Your spine is your lifeline — protect it, align it, thrive.",
  "Movement is medicine for the body and peace for the mind.",
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getDailyQuoteIndex(): number {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return seed % QUOTES.length;
}

export function GreetingBar({
  userName,
  branchRole,
  branches,
  selectedBranchId,
  onBranchChange,
}: GreetingBarProps) {
  const greeting = getGreeting();
  const displayName = userName ?? "there";
  const isDoctor = branchRole === "DOCTOR";

  const [quoteIndex, setQuoteIndex] = useState(getDailyQuoteIndex);

  const refreshQuote = useCallback(() => {
    setQuoteIndex((prev) => {
      let next = Math.floor(Math.random() * QUOTES.length);
      while (next === prev && QUOTES.length > 1) {
        next = Math.floor(Math.random() * QUOTES.length);
      }
      return next;
    });
  }, []);

  // Determine branch name to display
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  let branchDisplayName: string | null = null;
  if (selectedBranch) {
    branchDisplayName = selectedBranch.name;
  } else if (branches.length === 1) {
    branchDisplayName = branches[0].name;
  } else if (branches.length > 1) {
    branchDisplayName = "All Branches";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[23px] font-light tracking-[-0.23px] text-[#061b31]" suppressHydrationWarning>
            {greeting},{" "}
            <span className="font-medium">{displayName}</span>
          </h1>
          {branchDisplayName && (
            <p className="text-[14px] text-[#64748d] mt-0.5">{branchDisplayName}</p>
          )}
        </div>

        {isDoctor ? (
          branches.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#ededfc] px-3 py-1 text-[14px] font-medium text-[#533afd] transition-transform duration-200 hover:scale-105">
              {branches[0]?.name}
            </span>
          )
        ) : (
          <BranchPicker
            branches={branches}
            selectedBranchId={selectedBranchId}
            onBranchChange={onBranchChange}
          />
        )}
      </div>

      {/* Daily quote card */}
      <div
        className="relative rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4 transition-all duration-200 hover:border-[#c1c9d2]"
        style={{
          boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
        }}
      >
        <p className="text-[14px] text-[#273951] italic leading-relaxed pr-8" suppressHydrationWarning>
          &ldquo;{QUOTES[quoteIndex]}&rdquo;
        </p>
        <button
          onClick={refreshQuote}
          className="absolute bottom-3 right-3 flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#533afd] active:scale-90 cursor-pointer"
          title="New quote"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
