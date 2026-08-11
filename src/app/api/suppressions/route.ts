import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  listSuppressions,
  addSuppression,
  removeSuppression,
} from "@/lib/messaging/suppressions";
import { normalizeSendableE164, PhoneError } from "@/lib/messaging/phone";
import type { MessageChannel } from "@/types/messaging";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** GET /api/suppressions?channel=email|sms — list workspace opt-outs (P4-29). */
export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const url = new URL(request.url);
    const channelParam = url.searchParams.get("channel");
    const channel: MessageChannel | undefined =
      channelParam === "email" || channelParam === "sms" ? channelParam : undefined;

    const suppressions = await listSuppressions(tenant.workspaceId, channel);
    return NextResponse.json({ suppressions });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/suppressions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST — manually add a suppression (reason 'manual'). Requires owner/admin
 * (REQ-SEC-15.6). Address is normalized per P1-31 (email lowercased; phone E.164).
 */
export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.channel !== "email" && body.channel !== "sms") {
      return NextResponse.json(
        { error: "channel must be 'email' or 'sms'.", field: "channel" },
        { status: 400 }
      );
    }
    const rawAddress = typeof body.address === "string" ? body.address.trim() : "";
    if (!rawAddress) {
      return NextResponse.json(
        { error: "address is required.", field: "address" },
        { status: 400 }
      );
    }

    let address = rawAddress;
    if (body.channel === "email") {
      if (!isValidEmail(rawAddress)) {
        return NextResponse.json(
          { error: "Provide a valid email address.", field: "address" },
          { status: 400 }
        );
      }
    } else {
      try {
        address = normalizeSendableE164(rawAddress);
      } catch (err) {
        if (err instanceof PhoneError) {
          return NextResponse.json(
            { error: "Provide a valid phone number.", field: "address" },
            { status: 400 }
          );
        }
        throw err;
      }
    }

    // Idempotent + precedence-aware: adding an already-suppressed address is a
    // friendly no-op, not a constraint-violation error (P4-30).
    await addSuppression({
      workspaceId: tenant.workspaceId,
      channel: body.channel,
      address,
      reason: "manual",
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/suppressions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE — remove a suppression (operator override). Requires owner/admin.
 * Removing an SMS `stop` carries a compliance warning surfaced in the UI (P4-31).
 */
export async function DELETE(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const channel = body.channel ?? url.searchParams.get("channel");
    const rawAddress = body.address ?? url.searchParams.get("address");

    if (channel !== "email" && channel !== "sms") {
      return NextResponse.json(
        { error: "channel must be 'email' or 'sms'.", field: "channel" },
        { status: 400 }
      );
    }
    if (typeof rawAddress !== "string" || rawAddress.trim().length === 0) {
      return NextResponse.json(
        { error: "address is required.", field: "address" },
        { status: 400 }
      );
    }

    let address = rawAddress.trim();
    if (channel === "sms") {
      try {
        address = normalizeSendableE164(address);
      } catch {
        // fall through with the raw value; removeSuppression normalizes too
      }
    }

    await removeSuppression(tenant.workspaceId, channel, address);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("DELETE /api/suppressions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
