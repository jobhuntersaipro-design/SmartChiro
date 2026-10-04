import { isAllowedPlaceholder } from "./placeholders";
import type { TemplateContext } from "@/types/reminder";

export type ValidateResult = { ok: true } | { ok: false; message: string };

/** Returns ok=false with a message describing what's wrong; ok=true otherwise. */
export function validateTemplate(tpl: string): ValidateResult {
  if (tpl.length === 0) return { ok: false, message: "template is empty" };

  if (/\{[^}]*$/.test(tpl)) {
    return { ok: false, message: "unclosed placeholder" };
  }

  const re = /\{(\w+)\}/g;
  for (const m of tpl.matchAll(re)) {
    const name = m[1];
    if (!isAllowedPlaceholder(name)) {
      return { ok: false, message: `unknown placeholder: ${name}` };
    }
  }
  return { ok: true };
}

const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Substitutes placeholders. Throws if validation fails. `html` escapes the
 * values (patient names come from the public booking form).
 */
export function renderTemplate(tpl: string, ctx: TemplateContext, opts: { html?: boolean } = {}): string {
  const v = validateTemplate(tpl);
  if (!v.ok) throw new Error(v.message);
  // Single-pass replace — values inserted here are NOT re-scanned for `{x}`
  // placeholders, so a name like "Hi {date}" stays literal in the output.
  return tpl.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = String(ctx[name as keyof TemplateContext] ?? "");
    return opts.html ? value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]) : value;
  });
}
