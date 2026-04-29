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

/** Substitutes placeholders. Throws if validation fails. */
export function renderTemplate(tpl: string, ctx: TemplateContext): string {
  const v = validateTemplate(tpl);
  if (!v.ok) throw new Error(v.message);
  return tpl.replace(/\{(\w+)\}/g, (_, name: string) => {
    return ctx[name as keyof TemplateContext];
  });
}
