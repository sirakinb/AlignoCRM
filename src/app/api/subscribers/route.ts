import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";

const PENTRIDGE_API = "https://3nm75tby.us-east.insforge.app/functions";
const API_KEY = process.env.PENTRIDGE_ADMIN_API_KEY ?? "";

export async function GET(request: Request) {
  try {
    await requireTenantContext();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";
    const search = searchParams.get("search") ?? "";

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("search", search);

    const res = await fetch(
      `${PENTRIDGE_API}/list-subscribers?${params.toString()}`,
      { headers: { "x-api-key": API_KEY }, cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireTenantContext();
    const body = await request.json();

    const res = await fetch(`${PENTRIDGE_API}/manage-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(body),
    });

    return NextResponse.json(await res.json(), { status: res.status });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
