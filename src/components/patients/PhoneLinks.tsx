"use client";

import type { MouseEvent, KeyboardEvent } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { buildTelUrl, buildWhatsAppUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PhoneLinksProps {
  phone: string | null | undefined;
  /** Who the number belongs to, for the link labels ("Call Alice Tan"). */
  name: string;
  className?: string;
  textClassName?: string;
}

// Links sit inside clickable rows/cards: keep their clicks and Enter presses
// from also opening the row.
const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

const ICON_LINK =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[#64748d] transition-colors hover:bg-[#f0f3f7] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#533afd]";

/**
 * A phone number as plain text plus two icon links: call (`tel:`) and
 * WhatsApp (new tab). The number itself is not a link.
 */
export function PhoneLinks({ phone, name, className, textClassName }: PhoneLinksProps) {
  if (!phone) return <span className={cn("text-[14px] text-[#94a3b8]", className)}>—</span>;
  const tel = buildTelUrl(phone);
  const whatsapp = buildWhatsAppUrl(phone);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className={cn("shrink-0 whitespace-nowrap tabular-nums", textClassName)}>{phone}</span>
      {tel && (
        <a
          href={tel}
          onClick={stop}
          onKeyDown={stop}
          aria-label={`Call ${name}`}
          title={`Call ${phone}`}
          className={cn(ICON_LINK, "hover:text-[#533afd]")}
        >
          <Phone className="h-4 w-4" strokeWidth={1.5} />
        </a>
      )}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          onKeyDown={stop}
          aria-label={`WhatsApp ${name}`}
          title={`WhatsApp ${phone}`}
          className={cn(ICON_LINK, "hover:text-[#1a8d4a]")}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
        </a>
      )}
    </span>
  );
}
