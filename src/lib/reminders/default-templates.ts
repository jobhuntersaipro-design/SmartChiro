import type { Templates } from "@/types/reminder";

const WA_EN =
  "Hi {firstName}, this is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}. Reply or call {branchPhone} to reschedule. — {branchName}";

const WA_MS =
  "Hai {firstName}, ini peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}. Balas atau hubungi {branchPhone} untuk menukar tarikh. — {branchName}";

const EMAIL_EN =
  "Hi {firstName},\n\nThis is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}.\n\nLocation: {branchAddress}\nQuestions? Call {branchPhone}.\n\nSee you soon,\n{branchName}";

const EMAIL_MS =
  "Hai {firstName},\n\nIni peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}.\n\nLokasi: {branchAddress}\nSoalan? Hubungi {branchPhone}.\n\nJumpa lagi,\n{branchName}";

const EMAIL_HTML_EN = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0b0b0b;background:#f8f8f8;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #e9e9e9;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hi <strong>{firstName}</strong>,</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">This is a reminder of your appointment at <strong>{branchName}</strong> with <strong>{doctorName}</strong> on <strong>{dayOfWeek}, {date}</strong> at <strong>{time}</strong>.</p>
<p style="font-size:15px;line-height:1.5;color:#585858;margin:0 0 12px;">Location: {branchAddress}<br/>Questions? Call <a style="color:#7747ff;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>.</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">See you soon,<br/>{branchName}</p>
</td></tr></table></body></html>`;

const EMAIL_HTML_MS = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0b0b0b;background:#f8f8f8;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #e9e9e9;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hai <strong>{firstName}</strong>,</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Ini peringatan temujanji anda di <strong>{branchName}</strong> dengan <strong>{doctorName}</strong> pada <strong>{dayOfWeek}, {date}</strong> pukul <strong>{time}</strong>.</p>
<p style="font-size:15px;line-height:1.5;color:#585858;margin:0 0 12px;">Lokasi: {branchAddress}<br/>Soalan? Hubungi <a style="color:#7747ff;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>.</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">Jumpa lagi,<br/>{branchName}</p>
</td></tr></table></body></html>`;

const WA_ZH =
  "{firstName}您好，提醒您于{dayOfWeek} {date} {time}在{branchName}与{doctorName}有预约。如需改期，请回复或致电 {branchPhone}。— {branchName}";

const EMAIL_ZH =
  "{firstName}您好，\n\n提醒您于{dayOfWeek} {date} {time}在{branchName}与{doctorName}有预约。\n\n地址：{branchAddress}\n如有疑问，请致电 {branchPhone}。\n\n期待与您见面，\n{branchName}";

const EMAIL_HTML_ZH = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0b0b0b;background:#f8f8f8;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #e9e9e9;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;"><strong>{firstName}</strong>您好，</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">提醒您于<strong>{dayOfWeek} {date} {time}</strong>在<strong>{branchName}</strong>与<strong>{doctorName}</strong>有预约。</p>
<p style="font-size:15px;line-height:1.5;color:#585858;margin:0 0 12px;">地址：{branchAddress}<br/>如有疑问，请致电 <a style="color:#7747ff;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>。</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">期待与您见面，<br/>{branchName}</p>
</td></tr></table></body></html>`;

export const DEFAULT_TEMPLATES: Templates = {
  whatsapp: { en: WA_EN, ms: WA_MS, zh: WA_ZH },
  email: {
    en: EMAIL_EN,
    ms: EMAIL_MS,
    zh: EMAIL_ZH,
    htmlEn: EMAIL_HTML_EN,
    htmlMs: EMAIL_HTML_MS,
    htmlZh: EMAIL_HTML_ZH,
  },
};

type ReminderLang = "en" | "ms" | "zh";

/** The branch's email text for a language, else the default (zh isn't editable yet). */
export function reminderEmailText(templates: Partial<Templates> | null | undefined, lang: ReminderLang): string {
  return templates?.email?.[lang] ?? DEFAULT_TEMPLATES.email[lang] ?? DEFAULT_TEMPLATES.email.en;
}

export function reminderEmailHtml(templates: Partial<Templates> | null | undefined, lang: ReminderLang): string {
  const key = lang === "ms" ? "htmlMs" : lang === "zh" ? "htmlZh" : "htmlEn";
  return templates?.email?.[key] ?? DEFAULT_TEMPLATES.email[key] ?? DEFAULT_TEMPLATES.email.htmlEn;
}
