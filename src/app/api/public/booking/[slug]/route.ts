import { NextResponse } from "next/server";
import { guardPublic, publicConfig } from "@/lib/booking/public";

type RouteCtx = { params: Promise<{ slug: string }> };

/** Public booking page config: branch, treatments, bookable doctors, window, note. */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { slug } = await ctx.params;
  const guard = await guardPublic(req, slug);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ config: await publicConfig(guard.branch) });
}
