import "server-only";
import { insforge } from "@/lib/insforge/server";
import { getTwilioClient } from "@/lib/messaging/twilio-client";
import { normalizeE164 } from "@/lib/messaging/phone";
import { BLOCKED_NANP_AREA_CODES_PUBLIC } from "@/lib/messaging/phone-allowlist";

export type PhoneNumberType = "local" | "tollfree" | "mobile";
export type PhoneNumberStatus = "active" | "released";

export interface WorkspacePhoneNumber {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  phone_number: string;
  number_type: PhoneNumberType;
  twilio_sid: string;
  twilio_friendly_name: string | null;
  capabilities: { sms?: boolean; mms?: boolean; voice?: boolean };
  status: PhoneNumberStatus;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
}

export interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  isoCountry: string;
  capabilities: { sms: boolean; mms: boolean; voice: boolean };
  numberType: PhoneNumberType;
}

const ALLOWED_SEARCH_COUNTRIES = new Set(["US", "CA"]);

export function assertAllowedAreaCode(areaCode: string | undefined): void {
  if (!areaCode) return;
  if (!/^\d{3}$/.test(areaCode)) {
    throw new PhoneNumberError("Area code must be 3 digits");
  }
  if (BLOCKED_NANP_AREA_CODES_PUBLIC.has(areaCode)) {
    throw new PhoneNumberError(
      `Area code ${areaCode} is not available (premium or non-US/Canada NANP).`
    );
  }
}

export class PhoneNumberError extends Error {
  code: "validation" | "not_found" | "provider" | "conflict";
  constructor(message: string, code: PhoneNumberError["code"] = "validation") {
    super(message);
    this.code = code;
  }
}

export async function listWorkspacePhoneNumbers(
  workspaceId: string
): Promise<WorkspacePhoneNumber[]> {
  const { data, error } = await insforge.database
    .from("workspace_phone_numbers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkspacePhoneNumber[];
}

export async function getDefaultWorkspacePhoneNumber(
  workspaceId: string
): Promise<WorkspacePhoneNumber | null> {
  const { data, error } = await insforge.database
    .from("workspace_phone_numbers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .eq("is_default", true)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as WorkspacePhoneNumber | undefined) ?? null;
}

export async function getWorkspacePhoneNumberById(
  workspaceId: string,
  id: string
): Promise<WorkspacePhoneNumber | null> {
  const { data, error } = await insforge.database
    .from("workspace_phone_numbers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as WorkspacePhoneNumber | undefined) ?? null;
}

/** Resolve workspace for an inbound To number via purchased numbers first. */
export async function findWorkspaceByPurchasedNumber(
  toNumber: string
): Promise<{ workspace_id: string } | null> {
  const e164 = normalizeE164(toNumber) ?? toNumber;
  const { data, error } = await insforge.database
    .from("workspace_phone_numbers")
    .select("workspace_id")
    .eq("phone_number", e164)
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { workspace_id: string } | undefined) ?? null;
}

export async function searchAvailablePhoneNumbers(input: {
  country: string;
  areaCode?: string;
  numberType: PhoneNumberType;
  limit?: number;
}): Promise<AvailablePhoneNumber[]> {
  const country = input.country.toUpperCase();
  if (!ALLOWED_SEARCH_COUNTRIES.has(country)) {
    throw new PhoneNumberError("Only US and Canada numbers are available in v1");
  }
  assertAllowedAreaCode(input.areaCode);

  const client = getTwilioClient();
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 20);

  const params: Record<string, string | boolean | number> = {
    smsEnabled: true,
    limit,
  };
  if (input.areaCode) params.areaCode = input.areaCode;

  let results: Array<{
    phoneNumber: string;
    friendlyName?: string;
    locality?: string;
    region?: string;
    isoCountry: string;
    capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
  }> = [];

  if (input.numberType === "tollfree") {
    results = await client.availablePhoneNumbers(country).tollFree.list(params);
  } else if (input.numberType === "mobile") {
    results = await client.availablePhoneNumbers(country).mobile.list(params);
  } else {
    results = await client.availablePhoneNumbers(country).local.list(params);
  }

  return results.map((r) => ({
    phoneNumber: r.phoneNumber,
    friendlyName: r.friendlyName ?? null,
    locality: r.locality ?? null,
    region: r.region ?? null,
    isoCountry: r.isoCountry,
    capabilities: {
      sms: !!r.capabilities?.sms,
      mms: !!r.capabilities?.mms,
      voice: !!r.capabilities?.voice,
    },
    numberType: input.numberType,
  }));
}

export async function purchasePhoneNumber(input: {
  workspaceId: string;
  organizationId: string | null;
  phoneNumber: string;
  numberType: PhoneNumberType;
  createdBy?: string;
}): Promise<WorkspacePhoneNumber> {
  const e164 = normalizeE164(input.phoneNumber);
  if (!e164) throw new PhoneNumberError("Invalid phone number");

  // Reject blocked NANP area codes at purchase time too.
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    assertAllowedAreaCode(digits.slice(1, 4));
  }

  const existing = await listWorkspacePhoneNumbers(input.workspaceId);
  const isFirst = existing.length === 0;

  const client = getTwilioClient();
  const publicBase = process.env.MESSAGING_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const smsUrl = publicBase ? `${publicBase}/api/webhooks/twilio/inbound` : undefined;

  let purchased;
  try {
    purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: e164,
      friendlyName: `Aligno ${input.workspaceId.slice(0, 8)}`,
      ...(smsUrl
        ? {
            smsUrl,
            smsMethod: "POST" as const,
          }
        : {}),
    });
  } catch (err) {
    throw new PhoneNumberError(
      err instanceof Error ? err.message : "Twilio purchase failed",
      "provider"
    );
  }

  const { data, error } = await insforge.database
    .from("workspace_phone_numbers")
    .insert({
      workspace_id: input.workspaceId,
      ...(input.organizationId ? { organization_id: input.organizationId } : {}),
      phone_number: e164,
      number_type: input.numberType,
      twilio_sid: purchased.sid,
      twilio_friendly_name: purchased.friendlyName ?? null,
      capabilities: {
        sms: purchased.capabilities?.sms ?? true,
        mms: purchased.capabilities?.mms ?? false,
        voice: purchased.capabilities?.voice ?? false,
      },
      status: "active",
      is_default: isFirst,
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
    })
    .select("*")
    .single();

  if (error) {
    // Best-effort release so we don't leak a paid number without a DB row.
    try {
      await client.incomingPhoneNumbers(purchased.sid).remove();
    } catch {
      /* ignore */
    }
    throw error;
  }

  return data as WorkspacePhoneNumber;
}

export async function releasePhoneNumber(
  workspaceId: string,
  id: string
): Promise<void> {
  const row = await getWorkspacePhoneNumberById(workspaceId, id);
  if (!row || row.status !== "active") {
    throw new PhoneNumberError("Phone number not found", "not_found");
  }

  const client = getTwilioClient();
  try {
    await client.incomingPhoneNumbers(row.twilio_sid).remove();
  } catch (err) {
    // If Twilio already released it, continue marking local row released.
    const message = err instanceof Error ? err.message : String(err);
    if (!/404|not found|was not found/i.test(message)) {
      throw new PhoneNumberError(message, "provider");
    }
  }

  const { error } = await insforge.database
    .from("workspace_phone_numbers")
    .update({
      status: "released",
      is_default: false,
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  // If we released the default, promote another active number if present.
  if (row.is_default) {
    const remaining = await listWorkspacePhoneNumbers(workspaceId);
    if (remaining[0]) {
      await setDefaultPhoneNumber(workspaceId, remaining[0].id);
    }
  }
}

export async function setDefaultPhoneNumber(
  workspaceId: string,
  id: string
): Promise<WorkspacePhoneNumber> {
  const row = await getWorkspacePhoneNumberById(workspaceId, id);
  if (!row || row.status !== "active") {
    throw new PhoneNumberError("Phone number not found", "not_found");
  }

  await insforge.database
    .from("workspace_phone_numbers")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .neq("id", id);

  const { data, error } = await insforge.database
    .from("workspace_phone_numbers")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkspacePhoneNumber;
}
