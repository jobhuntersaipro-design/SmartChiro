import type { OutreachType } from "@prisma/client";
import type { TemplateLang } from "@/types/whatsapp";

/**
 * Email versions of the recall and review messages (the fallback when
 * WhatsApp can't send). Fixed text in en / ms / zh; like the WhatsApp
 * templates, every message says how to opt out.
 */
export interface OutreachMessageContext {
  firstName: string;
  branchName: string;
  branchPhone: string;
  /** REVIEW only. */
  reviewUrl?: string;
  /** One-click unsubscribe link (W4). */
  unsubscribeUrl?: string;
}

interface EmailCopy {
  subject: string;
  /** Paragraphs; `{name}` placeholders from OutreachMessageContext. */
  paragraphs: string[];
  /** Link label for the review button (REVIEW only). */
  cta?: string;
  signOff: string;
  optOut: string;
}

// Email replies aren't read by SmartChiro, so the email says how to stop
// with a link (the WhatsApp templates keep "reply STOP").
const OPT_OUT: Record<TemplateLang, string> = {
  en: "Don't want these messages? Unsubscribe here: {unsubscribeUrl} — or call {branchPhone}.",
  ms: "Tidak mahu menerima mesej ini? Berhenti langgan di sini: {unsubscribeUrl} — atau hubungi {branchPhone}.",
  zh: "不想再收到此类消息？点此退订：{unsubscribeUrl} ——或致电 {branchPhone}。",
};

export const OUTREACH_EMAIL: Record<OutreachType, Record<TemplateLang, EmailCopy>> = {
  RECALL: {
    en: {
      subject: "It's been a while — time for your next check-up at {branchName}",
      paragraphs: [
        "Hi {firstName},",
        "It has been a while since your last visit to {branchName}. Regular check-ups help keep your spine healthy.",
        "Call {branchPhone} or reply to this email to book your next session.",
      ],
      signOff: "See you soon,",
      optOut: OPT_OUT.en,
    },
    ms: {
      subject: "Sudah agak lama — masa untuk pemeriksaan seterusnya di {branchName}",
      paragraphs: [
        "Hai {firstName},",
        "Sudah agak lama sejak lawatan terakhir anda ke {branchName}. Pemeriksaan berkala membantu menjaga kesihatan tulang belakang anda.",
        "Balas e-mel ini atau hubungi {branchPhone} untuk menempah sesi seterusnya.",
      ],
      signOff: "Jumpa lagi,",
      optOut: OPT_OUT.ms,
    },
    zh: {
      subject: "好久不见——欢迎回到{branchName}复诊",
      paragraphs: [
        "{firstName}您好，",
        "距离您上次到{branchName}就诊已有一段时间。定期检查有助于保持脊椎健康。",
        "请回复此邮件或致电 {branchPhone} 预约下一次疗程。",
      ],
      signOff: "期待与您见面，",
      optOut: OPT_OUT.zh,
    },
  },
  REVIEW: {
    en: {
      subject: "How was your visit to {branchName}?",
      paragraphs: [
        "Hi {firstName},",
        "Thank you for your recent visit to {branchName}. We would love to hear how it went.",
        "Could you spare a minute to leave us a quick review?",
      ],
      cta: "Leave a review",
      signOff: "Thank you,",
      optOut: OPT_OUT.en,
    },
    ms: {
      subject: "Bagaimana lawatan anda ke {branchName}?",
      paragraphs: [
        "Hai {firstName},",
        "Terima kasih atas lawatan anda baru-baru ini ke {branchName}. Kami ingin mendengar pendapat anda.",
        "Sudi luangkan seminit untuk meninggalkan ulasan ringkas?",
      ],
      cta: "Tinggalkan ulasan",
      signOff: "Terima kasih,",
      optOut: OPT_OUT.ms,
    },
    zh: {
      subject: "您在{branchName}的体验如何？",
      paragraphs: [
        "{firstName}您好，",
        "感谢您近期到访{branchName}。我们很想听听您的体验。",
        "能否花一分钟给我们留个评价？",
      ],
      cta: "留下评价",
      signOff: "谢谢，",
      optOut: OPT_OUT.zh,
    },
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fill(text: string, ctx: OutreachMessageContext, escape: boolean): string {
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = ctx[name as keyof OutreachMessageContext];
    if (v === undefined) return m;
    return escape ? escapeHtml(v) : v;
  });
}

// Stands in for the unsubscribe URL while the HTML is escaped; replaced by a link.
const UNSUB_MARK = "%%UNSUBSCRIBE%%";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Renders the recall / review email in the patient's language. */
export function renderOutreachEmail(
  type: OutreachType,
  lang: TemplateLang,
  ctx: OutreachMessageContext,
): RenderedEmail {
  const copy = OUTREACH_EMAIL[type][lang];
  const link = type === "REVIEW" && ctx.reviewUrl ? ctx.reviewUrl : null;

  const textParts = copy.paragraphs.map((p) => fill(p, ctx, false));
  if (link) textParts.push(link);
  textParts.push(`${copy.signOff}\n${ctx.branchName}`, fill(copy.optOut, ctx, false));

  const p = (inner: string, extra = "") =>
    `<p style="font-size:16px;line-height:1.5;margin:0 0 12px;${extra}">${inner}</p>`;
  const htmlParts = copy.paragraphs.map((para) => p(fill(para, ctx, true)));
  if (link && copy.cta) {
    htmlParts.push(
      `<p style="margin:20px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#7747ff;color:#FFFFFF;text-decoration:none;padding:10px 20px;border-radius:4px;font-size:15px;">${escapeHtml(copy.cta)}</a></p>`,
    );
  }
  htmlParts.push(p(`${escapeHtml(copy.signOff)}<br/>${escapeHtml(ctx.branchName)}`, "margin-top:24px;"));
  const optOutHtml = fill(copy.optOut, { ...ctx, unsubscribeUrl: UNSUB_MARK }, true).replace(
    UNSUB_MARK,
    ctx.unsubscribeUrl ? `<a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#7d7d7d;">${escapeHtml(ctx.unsubscribeUrl)}</a>` : "",
  );
  htmlParts.push(`<p style="font-size:14px;line-height:1.5;color:#7d7d7d;margin:24px 0 0;">${optOutHtml}</p>`);

  return {
    subject: fill(copy.subject, ctx, false),
    text: textParts.join("\n\n"),
    html: `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0b0b0b;background:#f8f8f8;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #e9e9e9;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;"><tr><td>
${htmlParts.join("\n")}
</td></tr></table></body></html>`,
  };
}
