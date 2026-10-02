"use client";

import { Plus, Trash2 } from "lucide-react";
import { blankLine, parseMoney, parseQuantity, type LineDraft, type LineErrors } from "@/lib/invoice-form";
import { formatMYR } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { FIELD_ERROR, FIELD_INPUT, INVALID } from "./form-styles";

interface LineItemsEditorProps {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  /** Per-row errors, shown once the user tries to save. */
  errors: Record<string, LineErrors>;
  showErrors: boolean;
}

const MAX_LINES = 50;

/** Description / qty / unit price / SST-taxable rows for a manual invoice. */
export function LineItemsEditor({ lines, onChange, errors, showErrors }: LineItemsEditorProps) {
  function update(key: string, patch: Partial<LineDraft>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function remove(key: string) {
    const next = lines.filter((l) => l.key !== key);
    onChange(next.length ? next : [blankLine()]);
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_7rem_6rem_4.5rem_2rem] gap-2 px-0.5 text-[12px] font-medium uppercase tracking-[0.04em] text-fg-secondary sm:grid">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit (RM)</span>
        <span className="text-right">Amount</span>
        <span className="text-center">SST</span>
        <span className="sr-only">Remove</span>
      </div>

      {lines.map((line, index) => {
        const e = showErrors ? errors[line.key] ?? {} : {};
        const qty = parseQuantity(line.quantity);
        const price = parseMoney(line.unitPrice);
        const amount = qty !== null && price !== null ? Math.round(qty * price * 100) / 100 : null;
        const n = index + 1;
        return (
          <div
            key={line.key}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_2rem] gap-2 rounded-panel border border-border p-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem_6rem_4.5rem_2rem] sm:border-0 sm:p-0"
          >
            <div className="col-span-4 sm:col-span-1">
              <input
                aria-label={`Item ${n} description`}
                value={line.description}
                maxLength={200}
                onChange={(ev) => update(line.key, { description: ev.target.value })}
                placeholder="e.g. Chiropractic adjustment"
                aria-invalid={e.description ? true : undefined}
                className={cn(FIELD_INPUT, e.description && INVALID)}
              />
              {e.description && <p className={FIELD_ERROR}>{e.description}</p>}
            </div>
            <div>
              <input
                aria-label={`Item ${n} quantity`}
                inputMode="decimal"
                value={line.quantity}
                onChange={(ev) => update(line.key, { quantity: ev.target.value })}
                aria-invalid={e.quantity ? true : undefined}
                className={cn(FIELD_INPUT, "px-2 text-right tabular-nums", e.quantity && INVALID)}
              />
              {e.quantity && <p className={FIELD_ERROR}>{e.quantity}</p>}
            </div>
            <div>
              <input
                aria-label={`Item ${n} unit price`}
                inputMode="decimal"
                value={line.unitPrice}
                onChange={(ev) => update(line.key, { unitPrice: ev.target.value })}
                placeholder="0.00"
                aria-invalid={e.unitPrice ? true : undefined}
                className={cn(FIELD_INPUT, "px-2 text-right tabular-nums", e.unitPrice && INVALID)}
              />
              {e.unitPrice && <p className={FIELD_ERROR}>{e.unitPrice}</p>}
            </div>
            <div className="hidden h-9 items-center justify-end whitespace-nowrap text-[14px] tabular-nums text-fg-secondary sm:flex">
              {amount === null ? "—" : formatMYR(amount)}
            </div>
            <label
              className="flex h-9 cursor-pointer items-center justify-center gap-1.5 text-[13px] text-fg-secondary"
              title="Subject to SST (charged to non-Malaysian patients when the branch has SST on)"
            >
              <input
                type="checkbox"
                checked={line.taxable}
                onChange={(ev) => update(line.key, { taxable: ev.target.checked })}
                className="h-4 w-4 cursor-pointer accent-brand"
                aria-label={`Item ${n} subject to SST`}
              />
              <span className="sm:hidden">SST</span>
            </label>
            <button
              type="button"
              onClick={() => remove(line.key)}
              aria-label={`Remove item ${n}`}
              className="flex h-9 w-8 items-center justify-center rounded-control text-fg-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}

      {lines.length < MAX_LINES && (
        <button
          type="button"
          onClick={() => onChange([...lines, blankLine()])}
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-[14px] font-medium text-brand transition-colors hover:bg-brand-subtle"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Add item
        </button>
      )}
    </div>
  );
}
