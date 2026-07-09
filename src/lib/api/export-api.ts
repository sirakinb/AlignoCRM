import { NextResponse } from "next/server";
import { getInternalApiAuthContext } from "@/lib/api/internal-auth";

export const exportCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

export function exportOptions() {
  return new NextResponse(null, { status: 204, headers: exportCorsHeaders });
}

export async function requireExportTenant(request: Request) {
  const authContext = await getInternalApiAuthContext(request);
  if (!authContext.authorized) {
    return {
      tenant: null,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: exportCorsHeaders }
      ),
    };
  }

  return { tenant: authContext.tenant, response: null };
}
