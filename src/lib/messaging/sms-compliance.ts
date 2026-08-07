import "server-only";
import { insforge } from "@/lib/insforge/server";
import { getTwilioClient } from "@/lib/messaging/twilio-client";
import { messagingPublicBaseUrl } from "@/lib/messaging/urls";
import {
  getWorkspacePhoneNumberById,
  type WorkspacePhoneNumber,
} from "@/lib/messaging/phone-numbers";

const SECONDARY_CUSTOMER_PROFILE_POLICY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
const A2P_TRUST_PRODUCT_POLICY = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export type ComplianceStatus = "draft" | "pending" | "approved" | "rejected";
export type TollfreeStatus = "PENDING_REVIEW" | "TWILIO_APPROVED" | "TWILIO_REJECTED";

export interface A2pBusinessInfo {
  businessName: string;
  businessType: string;
  businessIndustry: string;
  businessRegistrationIdentifier: string;
  businessRegistrationNumber: string;
  websiteUrl: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  isoCountry: string;
  authorizedRepFirstName: string;
  authorizedRepLastName: string;
  authorizedRepEmail: string;
  authorizedRepPhone: string;
  authorizedRepTitle: string;
  companyType: string;
  brandContactEmail: string;
  campaignDescription: string;
  messageFlow: string;
  messageSample1: string;
  messageSample2: string;
  usAppToPersonUsecase: string;
  privacyPolicyUrl: string;
  termsAndConditionsUrl: string;
  hasEmbeddedLinks?: boolean;
  hasEmbeddedPhone?: boolean;
  stockExchange?: string;
  stockTicker?: string;
}

export interface WorkspaceSmsProfile {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  business_info: Record<string, unknown>;
  customer_profile_sid: string | null;
  trust_product_sid: string | null;
  brand_sid: string | null;
  campaign_sid: string | null;
  brand_status: ComplianceStatus | null;
  campaign_status: ComplianceStatus | null;
  status_callback_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTollfreeVerification {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  phone_number_id: string;
  tfv_sid: string;
  status: TollfreeStatus;
  business_details: Record<string, unknown>;
  rejection_reasons: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TollfreeVerificationInput {
  phoneNumberId: string;
  businessName: string;
  businessWebsite: string;
  notificationEmail: string;
  useCaseCategories: string[];
  useCaseSummary: string;
  productionMessageSample: string;
  optInType: string;
  optInImageUrls: string[];
  messageVolume: string;
  additionalInformation?: string;
}

export class SmsComplianceError extends Error {
  code: "validation" | "not_found" | "provider" | "conflict";
  constructor(message: string, code: SmsComplianceError["code"] = "validation") {
    super(message);
    this.code = code;
  }
}

/** Twilio client surface used by compliance helpers (injectable in tests). */
export interface ComplianceTwilioClient {
  trusthub: {
    v1: {
      customerProfiles: {
        create: (p: Record<string, unknown>) => Promise<{ sid: string; status?: string }>;
        (sid: string): {
          customerProfilesEntityAssignments: {
            create: (p: { objectSid: string }) => Promise<unknown>;
          };
          customerProfilesEvaluations: {
            create: (p: { policySid: string }) => Promise<unknown>;
          };
          update: (p: { status: string }) => Promise<unknown>;
        };
      };
      endUsers: {
        create: (p: Record<string, unknown>) => Promise<{ sid: string }>;
      };
      supportingDocuments: {
        create: (p: Record<string, unknown>) => Promise<{ sid: string }>;
      };
      trustProducts: {
        create: (p: Record<string, unknown>) => Promise<{ sid: string; status?: string }>;
        (sid: string): {
          trustProductsEntityAssignments: {
            create: (p: { objectSid: string }) => Promise<unknown>;
          };
          trustProductsEvaluations: {
            create: (p: { policySid: string }) => Promise<unknown>;
          };
          update: (p: { status: string }) => Promise<unknown>;
        };
      };
    };
  };
  addresses: {
    create: (p: Record<string, unknown>) => Promise<{ sid: string }>;
  };
  messaging: {
    v1: {
      brandRegistrations: {
        create: (p: Record<string, unknown>) => Promise<{ sid: string; status?: string }>;
        (sid: string): { fetch: () => Promise<{ sid: string; status?: string }> };
      };
      services: (sid: string) => {
        usAppToPerson: {
          create: (p: Record<string, unknown>) => Promise<{ sid: string; campaignStatus?: string }>;
          (campaignSid: string): {
            fetch: () => Promise<{ sid: string; campaignStatus?: string }>;
          };
        };
      };
      tollfreeVerifications: {
        create: (p: Record<string, unknown>) => Promise<{
          sid: string;
          status?: string;
          rejectionReasons?: unknown;
        }>;
        (sid: string): {
          fetch: () => Promise<{
            sid: string;
            status?: string;
            rejectionReasons?: unknown;
          }>;
        };
      };
    };
  };
}

function getClient(deps?: { twilio?: ComplianceTwilioClient }): ComplianceTwilioClient {
  return deps?.twilio ?? (getTwilioClient() as unknown as ComplianceTwilioClient);
}

export function validateA2pBusinessInfo(raw: unknown): A2pBusinessInfo {
  if (!raw || typeof raw !== "object") {
    throw new SmsComplianceError("businessInfo is required");
  }
  const o = raw as Record<string, unknown>;
  const req = (key: keyof A2pBusinessInfo, label = key): string => {
    const v = o[key];
    if (typeof v !== "string" || !v.trim()) {
      throw new SmsComplianceError(`${String(label)} is required`);
    }
    return v.trim();
  };

  const info: A2pBusinessInfo = {
    businessName: req("businessName"),
    businessType: req("businessType"),
    businessIndustry: req("businessIndustry"),
    businessRegistrationIdentifier: req("businessRegistrationIdentifier"),
    businessRegistrationNumber: req("businessRegistrationNumber"),
    websiteUrl: req("websiteUrl"),
    street: req("street"),
    city: req("city"),
    region: req("region"),
    postalCode: req("postalCode"),
    isoCountry: req("isoCountry").toUpperCase(),
    authorizedRepFirstName: req("authorizedRepFirstName"),
    authorizedRepLastName: req("authorizedRepLastName"),
    authorizedRepEmail: req("authorizedRepEmail"),
    authorizedRepPhone: req("authorizedRepPhone"),
    authorizedRepTitle: req("authorizedRepTitle"),
    companyType: req("companyType"),
    brandContactEmail: req("brandContactEmail"),
    campaignDescription: req("campaignDescription"),
    messageFlow: req("messageFlow"),
    messageSample1: req("messageSample1"),
    messageSample2: req("messageSample2"),
    usAppToPersonUsecase: req("usAppToPersonUsecase"),
    privacyPolicyUrl: req("privacyPolicyUrl"),
    termsAndConditionsUrl: req("termsAndConditionsUrl"),
    hasEmbeddedLinks: o.hasEmbeddedLinks !== false,
    hasEmbeddedPhone: o.hasEmbeddedPhone === true,
  };

  if (!["US", "CA"].includes(info.isoCountry)) {
    throw new SmsComplianceError("isoCountry must be US or CA");
  }
  if (!/^https?:\/\//i.test(info.websiteUrl)) {
    throw new SmsComplianceError("websiteUrl must be an http(s) URL");
  }
  if (!/^https?:\/\//i.test(info.privacyPolicyUrl)) {
    throw new SmsComplianceError("privacyPolicyUrl must be an http(s) URL");
  }
  if (!/^https?:\/\//i.test(info.termsAndConditionsUrl)) {
    throw new SmsComplianceError("termsAndConditionsUrl must be an http(s) URL");
  }
  if (info.companyType.toLowerCase() === "public") {
    info.stockExchange =
      typeof o.stockExchange === "string" ? o.stockExchange.trim() : undefined;
    info.stockTicker =
      typeof o.stockTicker === "string" ? o.stockTicker.trim() : undefined;
    if (!info.stockExchange || !info.stockTicker) {
      throw new SmsComplianceError(
        "stockExchange and stockTicker are required for public companies"
      );
    }
  }

  return info;
}

/** Persist non-sensitive business fields only — never store EIN/registration number. */
export function businessInfoForStorage(info: A2pBusinessInfo): Record<string, unknown> {
  return {
    businessName: info.businessName,
    businessType: info.businessType,
    businessIndustry: info.businessIndustry,
    businessRegistrationIdentifier: info.businessRegistrationIdentifier,
    businessRegistrationNumberProvided: true,
    websiteUrl: info.websiteUrl,
    street: info.street,
    city: info.city,
    region: info.region,
    postalCode: info.postalCode,
    isoCountry: info.isoCountry,
    authorizedRepFirstName: info.authorizedRepFirstName,
    authorizedRepLastName: info.authorizedRepLastName,
    authorizedRepEmail: info.authorizedRepEmail,
    authorizedRepPhone: info.authorizedRepPhone,
    authorizedRepTitle: info.authorizedRepTitle,
    companyType: info.companyType,
    brandContactEmail: info.brandContactEmail,
    campaignDescription: info.campaignDescription,
    messageFlow: info.messageFlow,
    messageSample1: info.messageSample1,
    messageSample2: info.messageSample2,
    usAppToPersonUsecase: info.usAppToPersonUsecase,
    privacyPolicyUrl: info.privacyPolicyUrl,
    termsAndConditionsUrl: info.termsAndConditionsUrl,
    hasEmbeddedLinks: info.hasEmbeddedLinks ?? true,
    hasEmbeddedPhone: info.hasEmbeddedPhone ?? false,
    ...(info.stockExchange ? { stockExchange: info.stockExchange } : {}),
    ...(info.stockTicker ? { stockTicker: info.stockTicker } : {}),
  };
}

export async function getSmsProfile(
  workspaceId: string
): Promise<WorkspaceSmsProfile | null> {
  const { data, error } = await insforge.database
    .from("workspace_sms_profiles")
    .select("*")
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as WorkspaceSmsProfile | undefined) ?? null;
}

async function upsertSmsProfile(
  workspaceId: string,
  organizationId: string | null,
  patch: Partial<WorkspaceSmsProfile> & { business_info?: Record<string, unknown> },
  createdBy?: string
): Promise<WorkspaceSmsProfile> {
  const existing = await getSmsProfile(workspaceId);
  if (existing) {
    const { data, error } = await insforge.database
      .from("workspace_sms_profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw error;
    return data as WorkspaceSmsProfile;
  }

  const { data, error } = await insforge.database
    .from("workspace_sms_profiles")
    .insert({
      workspace_id: workspaceId,
      ...(organizationId ? { organization_id: organizationId } : {}),
      business_info: patch.business_info ?? {},
      customer_profile_sid: patch.customer_profile_sid ?? null,
      trust_product_sid: patch.trust_product_sid ?? null,
      brand_sid: patch.brand_sid ?? null,
      campaign_sid: patch.campaign_sid ?? null,
      brand_status: patch.brand_status ?? "draft",
      campaign_status: patch.campaign_status ?? "draft",
      status_callback_url: patch.status_callback_url ?? null,
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkspaceSmsProfile;
}

function mapBrandStatus(raw: string | undefined): ComplianceStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("fail") || s.includes("reject")) return "rejected";
  if (s.includes("approv") || s === "registered") return "approved";
  if (s.includes("pending") || s.includes("in_review") || s.includes("self_declared")) {
    return "pending";
  }
  return "pending";
}

function mapCampaignStatus(raw: string | undefined): ComplianceStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("fail") || s.includes("reject")) return "rejected";
  if (s.includes("approv") || s === "verified") return "approved";
  return "pending";
}

function mapTollfreeStatus(raw: string | undefined): TollfreeStatus {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("APPROV")) return "TWILIO_APPROVED";
  if (s.includes("REJECT")) return "TWILIO_REJECTED";
  return "PENDING_REVIEW";
}

/**
 * Submit A2P 10DLC Secondary Customer Profile + Trust Product + Brand.
 * Campaign is created once the brand is approved (via refreshA2pStatus).
 */
export async function submitA2pRegistration(input: {
  workspaceId: string;
  organizationId: string | null;
  businessInfo: unknown;
  createdBy?: string;
  twilio?: ComplianceTwilioClient;
}): Promise<WorkspaceSmsProfile> {
  const info = validateA2pBusinessInfo(input.businessInfo);
  const existing = await getSmsProfile(input.workspaceId);
  if (existing?.brand_sid && existing.brand_status === "pending") {
    throw new SmsComplianceError(
      "A2P registration is already pending review",
      "conflict"
    );
  }
  if (existing?.brand_status === "approved" && existing.campaign_status === "approved") {
    throw new SmsComplianceError("A2P registration is already approved", "conflict");
  }

  const client = getClient(input);
  const base = messagingPublicBaseUrl();
  const statusCallback = base ? `${base}/api/webhooks/twilio/trusthub` : undefined;

  try {
    const profile = await client.trusthub.v1.customerProfiles.create({
      friendlyName: `${info.businessName} Secondary Customer Profile`,
      email: info.brandContactEmail,
      policySid: SECONDARY_CUSTOMER_PROFILE_POLICY,
      ...(statusCallback ? { statusCallback } : {}),
    });

    const businessEndUser = await client.trusthub.v1.endUsers.create({
      friendlyName: `${info.businessName} Business Info`,
      type: "customer_profile_business_information",
      attributes: {
        business_name: info.businessName,
        website_url: info.websiteUrl,
        business_regions_of_operation: "USA_AND_CANADA",
        business_type: info.businessType,
        business_registration_identifier: info.businessRegistrationIdentifier,
        business_identity: "direct_customer",
        business_industry: info.businessIndustry,
        business_registration_number: info.businessRegistrationNumber,
      },
    });

    const repEndUser = await client.trusthub.v1.endUsers.create({
      friendlyName: `${info.businessName} Authorized Rep`,
      type: "authorized_representative_1",
      attributes: {
        first_name: info.authorizedRepFirstName,
        last_name: info.authorizedRepLastName,
        email: info.authorizedRepEmail,
        phone_number: info.authorizedRepPhone,
        business_title: info.authorizedRepTitle,
        job_position: info.authorizedRepTitle,
      },
    });

    const address = await client.addresses.create({
      customerName: info.businessName,
      street: info.street,
      city: info.city,
      region: info.region,
      postalCode: info.postalCode,
      isoCountry: info.isoCountry,
    });

    const supportingDoc = await client.trusthub.v1.supportingDocuments.create({
      friendlyName: `${info.businessName} Address`,
      type: "customer_profile_address",
      attributes: { address_sids: [address.sid] },
    });

    const profileApi = client.trusthub.v1.customerProfiles(profile.sid);
    await profileApi.customerProfilesEntityAssignments.create({
      objectSid: businessEndUser.sid,
    });
    await profileApi.customerProfilesEntityAssignments.create({
      objectSid: repEndUser.sid,
    });
    await profileApi.customerProfilesEntityAssignments.create({
      objectSid: supportingDoc.sid,
    });
    await profileApi.customerProfilesEvaluations.create({
      policySid: SECONDARY_CUSTOMER_PROFILE_POLICY,
    });
    await profileApi.update({ status: "pending-review" });

    const trustProduct = await client.trusthub.v1.trustProducts.create({
      friendlyName: `${info.businessName} A2P Trust Product`,
      email: info.brandContactEmail,
      policySid: A2P_TRUST_PRODUCT_POLICY,
      ...(statusCallback ? { statusCallback } : {}),
    });

    const a2pEndUserAttrs: Record<string, string> = {
      company_type: info.companyType,
      brand_contact_email: info.brandContactEmail,
    };
    if (info.stockExchange) a2pEndUserAttrs.stock_exchange = info.stockExchange;
    if (info.stockTicker) a2pEndUserAttrs.stock_ticker = info.stockTicker;

    const a2pEndUser = await client.trusthub.v1.endUsers.create({
      friendlyName: `${info.businessName} A2P Messaging Profile`,
      type: "us_a2p_messaging_profile_information",
      attributes: a2pEndUserAttrs,
    });

    const trustApi = client.trusthub.v1.trustProducts(trustProduct.sid);
    await trustApi.trustProductsEntityAssignments.create({
      objectSid: a2pEndUser.sid,
    });
    await trustApi.trustProductsEntityAssignments.create({
      objectSid: profile.sid,
    });
    await trustApi.trustProductsEvaluations.create({
      policySid: A2P_TRUST_PRODUCT_POLICY,
    });
    await trustApi.update({ status: "pending-review" });

    const brand = await client.messaging.v1.brandRegistrations.create({
      customerProfileBundleSid: profile.sid,
      a2PProfileBundleSid: trustProduct.sid,
    });

    return upsertSmsProfile(
      input.workspaceId,
      input.organizationId,
      {
        business_info: businessInfoForStorage(info),
        customer_profile_sid: profile.sid,
        trust_product_sid: trustProduct.sid,
        brand_sid: brand.sid,
        brand_status: mapBrandStatus(brand.status),
        campaign_status: "draft",
        status_callback_url: statusCallback ?? null,
      },
      input.createdBy
    );
  } catch (err) {
    if (err instanceof SmsComplianceError) throw err;
    throw new SmsComplianceError(
      err instanceof Error ? err.message : "Twilio A2P submission failed",
      "provider"
    );
  }
}

/**
 * Poll Twilio for brand/campaign status. When brand becomes approved and no
 * campaign exists yet, register the campaign on TWILIO_MESSAGING_SERVICE_SID.
 */
export async function refreshA2pStatus(input: {
  workspaceId: string;
  twilio?: ComplianceTwilioClient;
}): Promise<WorkspaceSmsProfile> {
  const profile = await getSmsProfile(input.workspaceId);
  if (!profile) throw new SmsComplianceError("No SMS compliance profile", "not_found");

  const client = getClient(input);
  const patch: Partial<WorkspaceSmsProfile> = {};

  try {
    if (profile.brand_sid) {
      const brand = await client.messaging.v1.brandRegistrations(profile.brand_sid).fetch();
      patch.brand_status = mapBrandStatus(brand.status);
    }

    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const brandApproved =
      (patch.brand_status ?? profile.brand_status) === "approved";

    if (brandApproved && !profile.campaign_sid && messagingServiceSid) {
      const info = profile.business_info;
      const campaign = await client.messaging.v1
        .services(messagingServiceSid)
        .usAppToPerson.create({
          brandRegistrationSid: profile.brand_sid,
          description: String(info.campaignDescription ?? "CRM follow-up messaging"),
          messageFlow: String(info.messageFlow ?? "Users opt in via website forms."),
          messageSamples: [
            String(info.messageSample1 ?? "Hi, this is a follow-up from our team."),
            String(info.messageSample2 ?? "Reply STOP to unsubscribe."),
          ],
          usAppToPersonUsecase: String(info.usAppToPersonUsecase ?? "MIXED"),
          hasEmbeddedLinks: info.hasEmbeddedLinks !== false,
          hasEmbeddedPhone: info.hasEmbeddedPhone === true,
          privacyPolicyUrl: String(info.privacyPolicyUrl ?? ""),
          termsAndConditionsUrl: String(info.termsAndConditionsUrl ?? ""),
        });
      patch.campaign_sid = campaign.sid;
      patch.campaign_status = mapCampaignStatus(campaign.campaignStatus);
    } else if (profile.campaign_sid && messagingServiceSid) {
      const campaign = await client.messaging.v1
        .services(messagingServiceSid)
        .usAppToPerson(profile.campaign_sid)
        .fetch();
      patch.campaign_status = mapCampaignStatus(campaign.campaignStatus);
    }

    return upsertSmsProfile(input.workspaceId, profile.organization_id, patch);
  } catch (err) {
    throw new SmsComplianceError(
      err instanceof Error ? err.message : "Failed to refresh A2P status",
      "provider"
    );
  }
}

export async function listTollfreeVerifications(
  workspaceId: string
): Promise<WorkspaceTollfreeVerification[]> {
  const { data, error } = await insforge.database
    .from("workspace_tollfree_verifications")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkspaceTollfreeVerification[];
}

export function validateTollfreeInput(raw: unknown): TollfreeVerificationInput {
  if (!raw || typeof raw !== "object") {
    throw new SmsComplianceError("verification payload is required");
  }
  const o = raw as Record<string, unknown>;
  const str = (key: string): string => {
    const v = o[key];
    if (typeof v !== "string" || !v.trim()) {
      throw new SmsComplianceError(`${key} is required`);
    }
    return v.trim();
  };

  const categories = o.useCaseCategories;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new SmsComplianceError("useCaseCategories is required");
  }
  const optInImageUrls = o.optInImageUrls;
  if (!Array.isArray(optInImageUrls) || optInImageUrls.length === 0) {
    throw new SmsComplianceError("optInImageUrls is required");
  }

  return {
    phoneNumberId: str("phoneNumberId"),
    businessName: str("businessName"),
    businessWebsite: str("businessWebsite"),
    notificationEmail: str("notificationEmail"),
    useCaseCategories: categories.map(String),
    useCaseSummary: str("useCaseSummary"),
    productionMessageSample: str("productionMessageSample"),
    optInType: str("optInType"),
    optInImageUrls: optInImageUrls.map(String),
    messageVolume: str("messageVolume"),
    additionalInformation:
      typeof o.additionalInformation === "string"
        ? o.additionalInformation.trim()
        : undefined,
  };
}

export async function submitTollfreeVerification(input: {
  workspaceId: string;
  organizationId: string | null;
  payload: unknown;
  createdBy?: string;
  twilio?: ComplianceTwilioClient;
}): Promise<WorkspaceTollfreeVerification> {
  const payload = validateTollfreeInput(input.payload);
  const number = await getWorkspacePhoneNumberById(
    input.workspaceId,
    payload.phoneNumberId
  );
  if (!number || number.status !== "active") {
    throw new SmsComplianceError("Phone number not found", "not_found");
  }
  if (number.number_type !== "tollfree") {
    throw new SmsComplianceError("Only toll-free numbers can be verified this way");
  }

  const profile = await getSmsProfile(input.workspaceId);
  if (!profile?.customer_profile_sid) {
    throw new SmsComplianceError(
      "Submit A2P business info first so a customer profile SID exists"
    );
  }

  const existing = await listTollfreeVerifications(input.workspaceId);
  if (
    existing.some(
      (v) =>
        v.phone_number_id === number.id &&
        (v.status === "PENDING_REVIEW" || v.status === "TWILIO_APPROVED")
    )
  ) {
    throw new SmsComplianceError(
      "A toll-free verification is already pending or approved for this number",
      "conflict"
    );
  }

  const client = getClient(input);
  try {
    const tfv = await client.messaging.v1.tollfreeVerifications.create({
      tollfreePhoneNumberSid: number.twilio_sid,
      customerProfileSid: profile.customer_profile_sid,
      businessName: payload.businessName,
      businessWebsite: payload.businessWebsite,
      notificationEmail: payload.notificationEmail,
      useCaseCategories: payload.useCaseCategories,
      useCaseSummary: payload.useCaseSummary,
      productionMessageSample: payload.productionMessageSample,
      optInType: payload.optInType,
      optInImageUrls: payload.optInImageUrls,
      messageVolume: payload.messageVolume,
      ...(payload.additionalInformation
        ? { additionalInformation: payload.additionalInformation }
        : {}),
      externalReferenceId: `${input.workspaceId}:${number.id}`,
    });

    const { data, error } = await insforge.database
      .from("workspace_tollfree_verifications")
      .insert({
        workspace_id: input.workspaceId,
        ...(input.organizationId ? { organization_id: input.organizationId } : {}),
        phone_number_id: number.id,
        tfv_sid: tfv.sid,
        status: mapTollfreeStatus(tfv.status),
        business_details: {
          businessName: payload.businessName,
          businessWebsite: payload.businessWebsite,
          notificationEmail: payload.notificationEmail,
          useCaseCategories: payload.useCaseCategories,
          useCaseSummary: payload.useCaseSummary,
          productionMessageSample: payload.productionMessageSample,
          optInType: payload.optInType,
          optInImageUrls: payload.optInImageUrls,
          messageVolume: payload.messageVolume,
        },
        rejection_reasons: tfv.rejectionReasons ?? null,
        ...(input.createdBy ? { created_by: input.createdBy } : {}),
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as WorkspaceTollfreeVerification;
  } catch (err) {
    if (err instanceof SmsComplianceError) throw err;
    throw new SmsComplianceError(
      err instanceof Error ? err.message : "Toll-free verification failed",
      "provider"
    );
  }
}

export async function refreshTollfreeVerification(input: {
  workspaceId: string;
  id: string;
  twilio?: ComplianceTwilioClient;
}): Promise<WorkspaceTollfreeVerification> {
  const { data: rows, error } = await insforge.database
    .from("workspace_tollfree_verifications")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.id)
    .limit(1);
  if (error) throw error;
  const row = rows?.[0] as WorkspaceTollfreeVerification | undefined;
  if (!row) throw new SmsComplianceError("Verification not found", "not_found");

  const client = getClient(input);
  try {
    const tfv = await client.messaging.v1.tollfreeVerifications(row.tfv_sid).fetch();
    const { data, error: updateError } = await insforge.database
      .from("workspace_tollfree_verifications")
      .update({
        status: mapTollfreeStatus(tfv.status),
        rejection_reasons: tfv.rejectionReasons ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("workspace_id", input.workspaceId)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return data as WorkspaceTollfreeVerification;
  } catch (err) {
    if (err instanceof SmsComplianceError) throw err;
    throw new SmsComplianceError(
      err instanceof Error ? err.message : "Failed to refresh TFV status",
      "provider"
    );
  }
}

/** Apply TrustHub / brand status callback into the matching workspace profile. */
export async function applyTrusthubStatusUpdate(input: {
  bundleSid: string;
  status: string;
}): Promise<void> {
  const status = mapBrandStatus(input.status);

  type ProfileLookup = {
    workspace_id: string;
    customer_profile_sid: string | null;
    trust_product_sid: string | null;
    brand_sid: string | null;
  };

  async function findBy(column: "customer_profile_sid" | "trust_product_sid" | "brand_sid") {
    const { data } = await insforge.database
      .from("workspace_sms_profiles")
      .select("workspace_id, customer_profile_sid, trust_product_sid, brand_sid")
      .eq(column, input.bundleSid)
      .limit(1);
    return (data?.[0] as ProfileLookup | undefined) ?? null;
  }

  const row =
    (await findBy("brand_sid")) ??
    (await findBy("customer_profile_sid")) ??
    (await findBy("trust_product_sid"));
  if (!row) return;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (row.brand_sid === input.bundleSid) {
    patch.brand_status = status;
  } else if (status === "approved" || status === "rejected" || status === "pending") {
    // Profile/trust-product callbacks — keep brand_status pending until brand fetch.
    if (!row.brand_sid) patch.brand_status = status;
  }

  await insforge.database
    .from("workspace_sms_profiles")
    .update(patch)
    .eq("workspace_id", row.workspace_id);

  if (row.brand_sid === input.bundleSid && status === "approved") {
    try {
      await refreshA2pStatus({ workspaceId: row.workspace_id });
    } catch (err) {
      console.warn("[sms-compliance] campaign create after brand approval failed", err);
    }
  }
}

export type { WorkspacePhoneNumber };
