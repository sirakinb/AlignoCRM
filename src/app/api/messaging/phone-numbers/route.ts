import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import {
  listWorkspacePhoneNumbers,
  purchasePhoneNumber,
  PhoneNumberError,
  type PhoneNumberType,
} from "@/lib/messaging/phone-numbers";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const numbers = await listWorkspacePhoneNumbers(tenant.workspaceId);
    return NextResponse.json({ numbers });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/phone-numbers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const allowed = await checkRateLimit(
      `phone-purchase:${tenant.workspaceId}`,
      RATE_LIMITS.phoneNumberMutations.limit,
      RATE_LIMITS.phoneNumberMutations.windowMs
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const user = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber : null;
    const numberType = (body.numberType ?? "local") as PhoneNumberType;

    if (!phoneNumber) {
      return NextResponse.json({ error: "phoneNumber is required" }, { status: 400 });
    }
    if (!["local", "tollfree", "mobile"].includes(numberType)) {
      return NextResponse.json({ error: "numberType must be local, tollfree, or mobile" }, { status: 400 });
    }

    const number = await purchasePhoneNumber({
      workspaceId: tenant.workspaceId,
      organizationId: tenant.organizationId,
      phoneNumber,
      numberType,
      createdBy: user?.id,
    });

    return NextResponse.json({ number }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof PhoneNumberError) {
      const status = error.code === "provider" ? 502 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("POST /api/messaging/phone-numbers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
