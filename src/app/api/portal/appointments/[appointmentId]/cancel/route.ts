import { z } from "zod";
import { cancelPortalAppointment } from "@/lib/portal/data";
import { portalJson, withPortal } from "@/lib/portal/http";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const Body = z.object({ reason: z.string().trim().max(300).optional() }).strict();
const Id = z.string().min(1).max(64);

/** Cancel one of the patient's own SCHEDULED appointments before the branch's cutoff. */
export function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  return withPortal(req, async (session) => {
    const id = Id.safeParse((await ctx.params).appointmentId);
    if (!id.success) return portalJson({ error: "not_found" }, 404);
    const body = Body.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return portalJson({ error: "validation" }, 422);

    const result = await cancelPortalAppointment(session, id.data, body.data.reason || null);
    if (!result.ok) {
      const { status, ...rest } = result;
      return portalJson(rest, status);
    }
    return portalJson({ appointment: result.appointment });
  });
}
