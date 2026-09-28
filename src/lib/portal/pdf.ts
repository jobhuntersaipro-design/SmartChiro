import { NextResponse } from "next/server";

/** A PDF for the portal: opened in the browser, never cached. */
export function pdfResponse(bytes: Uint8Array, fileName: string): Response {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
