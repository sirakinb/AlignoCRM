import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import {
  searchAvailablePhoneNumbers,
  PhoneNumberError,
  type PhoneNumberType,
} from "@/lib/messaging/phone-numbers";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const allowed = await checkRateLimit(
      `phone-search:${tenant.workspaceId}`,
      RATE_LIMITS.phoneNumberMutations.limit,
      RATE_LIMITS.phoneNumberMutations.windowMs,
      true
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const country = (searchParams.get("country") ?? "US").toUpperCase();
    const areaCode = searchParams.get("areaCode") ?? undefined;
    const numberType = (searchParams.get("type") ?? "local") as PhoneNumberType;
    if (!["local", "tollfree", "mobile"].includes(numberType)) {
      return NextResponse.json({ error: "type must be local, tollfree, or mobile" }, { status: 400 });
    }

    const numbers = await searchAvailablePhoneNumbers({
      country,
      areaCode,
      numberType,
    });
    return NextResponse.json({ numbers });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof PhoneNumberError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET /api/messaging/phone-numbers/search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
