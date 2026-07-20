import { NextResponse } from "next/server";
import { getRoadmap } from "@/lib/linear";

// Serverless proxy. The browser calls THIS (same-origin, no token exposed);
// this function calls Linear using the server-side LINEAR_API_KEY.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getRoadmap();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
