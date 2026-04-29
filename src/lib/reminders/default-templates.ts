import type { Templates } from "@/types/reminder";

const WA_EN =
  "Hi {firstName}, this is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}. Reply or call {branchPhone} to reschedule. — {branchName}";

const WA_MS =
  "Hai {firstName}, ini peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}. Balas atau hubungi {branchPhone} untuk menukar tarikh. — {branchName}";

const EMAIL_EN =
  "Hi {firstName},\n\nThis is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}.\n\nLocation: {branchAddress}\nQuestions? Call {branchPhone}.\n\nSee you soon,\n{branchName}";

const EMAIL_MS =
  "Hai {firstName},\n\nIni peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}.\n\nLokasi: {branchAddress}\nSoalan? Hubungi {branchPhone}.\n\nJumpa lagi,\n{branchName}";

const EMAIL_HTML_EN = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0A2540;background:#F6F9FC;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #E3E8EE;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hi <strong>{firstName}</strong>,</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">This is a reminder of your appointment at <strong>{branchName}</strong> with <strong>{doctorName}</strong> on <strong>{dayOfWeek}, {date}</strong> at <strong>{time}</strong>.</p>
<p style="font-size:15px;line-height:1.5;color:#425466;margin:0 0 12px;">Location: {branchAddress}<br/>Questions? Call <a style="color:#635BFF;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>.</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">See you soon,<br/>{branchName}</p>
</td></tr></table></body></html>`;

const EMAIL_HTML_MS = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0A2540;background:#F6F9FC;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #E3E8EE;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hai <strong>{firstName}</strong>,</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Ini peringatan temujanji anda di <strong>{branchName}</strong> dengan <strong>{doctorName}</strong> pada <strong>{dayOfWeek}, {date}</strong> pukul <strong>{time}</strong>.</p>
<p style="font-size:15px;line-height:1.5;color:#425466;margin:0 0 12px;">Lokasi: {branchAddress}<br/>Soalan? Hubungi <a style="color:#635BFF;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>.</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">Jumpa lagi,<br/>{branchName}</p>
</td></tr></table></body></html>`;

export const DEFAULT_TEMPLATES: Templates = {
  whatsapp: { en: WA_EN, ms: WA_MS },
  email: {
    en: EMAIL_EN,
    ms: EMAIL_MS,
    htmlEn: EMAIL_HTML_EN,
    htmlMs: EMAIL_HTML_MS,
  },
};
