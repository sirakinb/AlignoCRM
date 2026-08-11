import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFrom, mockSelect, mockInsert, mockUpdate, mockEq, mockLimit, mockSingle, mockOrder } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockEq: vi.fn(),
    mockLimit: vi.fn(),
    mockSingle: vi.fn(),
    mockOrder: vi.fn(),
  }));

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  limit: mockLimit,
  single: mockSingle,
  order: mockOrder,
});

vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: mockFrom } },
}));

vi.mock("@/lib/messaging/urls", () => ({
  messagingPublicBaseUrl: () => "https://app.example.com",
}));

vi.mock("@/lib/messaging/phone-numbers", () => ({
  getWorkspacePhoneNumberById: vi.fn(),
}));

import {
  validateA2pBusinessInfo,
  businessInfoForStorage,
  submitA2pRegistration,
  SmsComplianceError,
  type ComplianceTwilioClient,
} from "@/lib/messaging/sms-compliance";
import { getWorkspacePhoneNumberById } from "@/lib/messaging/phone-numbers";

const validInfo = {
  businessName: "Acme Inc",
  businessType: "Corporation",
  businessIndustry: "TECHNOLOGY",
  businessRegistrationIdentifier: "EIN",
  businessRegistrationNumber: "12-3456789",
  websiteUrl: "https://acme.example",
  street: "1 Main St",
  city: "Austin",
  region: "TX",
  postalCode: "78701",
  isoCountry: "US",
  authorizedRepFirstName: "Jane",
  authorizedRepLastName: "Doe",
  authorizedRepEmail: "jane@acme.example",
  authorizedRepPhone: "+15125551234",
  authorizedRepTitle: "CEO",
  companyType: "private",
  brandContactEmail: "compliance@acme.example",
  campaignDescription: "CRM follow-up messages for booked appointments",
  messageFlow: "Users opt in on the website contact form.",
  messageSample1: "Hi, this is Acme following up on your inquiry.",
  messageSample2: "Reply STOP to unsubscribe.",
  usAppToPersonUsecase: "MIXED",
  privacyPolicyUrl: "https://acme.example/privacy",
  termsAndConditionsUrl: "https://acme.example/terms",
};

function mockTwilio(): ComplianceTwilioClient {
  const entityCreate = vi.fn().mockResolvedValue({});
  const evalCreate = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockResolvedValue({});

  const customerProfiles = Object.assign(
    vi.fn().mockImplementation(() => ({
      customerProfilesEntityAssignments: { create: entityCreate },
      customerProfilesEvaluations: { create: evalCreate },
      update,
    })),
    {
      create: vi.fn().mockResolvedValue({ sid: "BU_PROFILE" }),
    }
  );

  const trustProducts = Object.assign(
    vi.fn().mockImplementation(() => ({
      trustProductsEntityAssignments: { create: entityCreate },
      trustProductsEvaluations: { create: evalCreate },
      update,
    })),
    {
      create: vi.fn().mockResolvedValue({ sid: "BU_TRUST" }),
    }
  );

  return {
    trusthub: {
      v1: {
        customerProfiles,
        endUsers: {
          create: vi
            .fn()
            .mockResolvedValueOnce({ sid: "IT_BIZ" })
            .mockResolvedValueOnce({ sid: "IT_REP" })
            .mockResolvedValueOnce({ sid: "IT_A2P" }),
        },
        supportingDocuments: {
          create: vi.fn().mockResolvedValue({ sid: "RD_ADDR" }),
        },
        trustProducts,
      },
    },
    addresses: {
      create: vi.fn().mockResolvedValue({ sid: "AD123" }),
    },
    messaging: {
      v1: {
        brandRegistrations: Object.assign(
          vi.fn().mockImplementation(() => ({
            fetch: vi.fn().mockResolvedValue({ sid: "BN123", status: "PENDING" }),
          })),
          {
            create: vi.fn().mockResolvedValue({ sid: "BN123", status: "PENDING" }),
          }
        ),
        services: vi.fn(),
        tollfreeVerifications: Object.assign(vi.fn(), {
          create: vi.fn(),
        }),
      },
    },
  };
}

describe("sms-compliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  it("validates required A2P business fields", () => {
    expect(() => validateA2pBusinessInfo({})).toThrow(SmsComplianceError);
    expect(validateA2pBusinessInfo(validInfo).businessName).toBe("Acme Inc");
  });

  it("never stores the EIN / registration number", () => {
    const stored = businessInfoForStorage(validateA2pBusinessInfo(validInfo));
    expect(stored.businessRegistrationNumber).toBeUndefined();
    expect(stored.businessRegistrationNumberProvided).toBe(true);
    expect(stored.businessName).toBe("Acme Inc");
  });

  it("submits TrustHub resources and stores SIDs", async () => {
    // getSmsProfile (conflict check) + getSmsProfile (upsert) → empty
    mockLimit
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    // upsert insert
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "prof-1",
        workspace_id: "ws-1",
        brand_sid: "BN123",
        brand_status: "pending",
        campaign_status: "draft",
        business_info: {},
      },
      error: null,
    });

    const twilio = mockTwilio();
    const profile = await submitA2pRegistration({
      workspaceId: "ws-1",
      organizationId: null,
      businessInfo: validInfo,
      twilio,
    });

    expect(profile.brand_sid).toBe("BN123");
    expect(twilio.trusthub.v1.customerProfiles.create).toHaveBeenCalled();
    expect(twilio.messaging.v1.brandRegistrations.create).toHaveBeenCalledWith({
      customerProfileBundleSid: "BU_PROFILE",
      a2PProfileBundleSid: "BU_TRUST",
    });
    // EIN must be passed to Twilio endUsers, but not asserted on DB insert shape here.
    expect(twilio.trusthub.v1.endUsers.create).toHaveBeenCalled();
  });

  it("rejects member-level conflicts when already pending", async () => {
    mockLimit.mockResolvedValueOnce({
      data: [{ brand_sid: "BN_OLD", brand_status: "pending" }],
    });

    await expect(
      submitA2pRegistration({
        workspaceId: "ws-1",
        organizationId: null,
        businessInfo: validInfo,
        twilio: mockTwilio(),
      })
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("getWorkspacePhoneNumberById mock wiring", () => {
  it("is mocked for TFV tests elsewhere", () => {
    expect(vi.isMockFunction(getWorkspacePhoneNumberById)).toBe(true);
  });
});
