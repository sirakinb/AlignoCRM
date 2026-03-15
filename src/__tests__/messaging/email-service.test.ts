import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  single: mockSingle,
});

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockUpdate.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

import { insforge } from "@/lib/insforge/client";
import {
  sendEmail,
  setEmailProvider,
  type EmailProvider,
} from "@/lib/messaging/email-service";

describe("sendEmail", () => {
  let mockProvider: EmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());

    mockProvider = {
      send: vi.fn().mockResolvedValue({ id: "provider-123", success: true }),
    };
    setEmailProvider(mockProvider);
  });

  it("creates a log entry, sends via provider, and updates status", async () => {
    const pendingLog = {
      id: "log-1",
      workspace_id: "ws-1",
      contact_id: "c-1",
      channel: "email",
      to_address: "alice@example.com",
      subject: "Hello",
      body: "Hi there",
      status: "pending",
    };
    const sentLog = { ...pendingLog, status: "sent", provider_id: "provider-123" };

    // First single() call: insert returns pending log
    mockSingle.mockResolvedValueOnce({ data: pendingLog, error: null });
    // Second single() call: update returns sent log
    mockSingle.mockResolvedValueOnce({ data: sentLog, error: null });

    const result = await sendEmail("ws-1", {
      to: "alice@example.com",
      subject: "Hello",
      body: "Hi there",
      contactId: "c-1",
    });

    expect(insforge.database.from).toHaveBeenCalledWith("message_logs");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        contact_id: "c-1",
        channel: "email",
        to_address: "alice@example.com",
        subject: "Hello",
        body: "Hi there",
        status: "pending",
      })
    );
    expect(mockProvider.send).toHaveBeenCalledWith({
      to: "alice@example.com",
      subject: "Hello",
      body: "Hi there",
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        provider_id: "provider-123",
      })
    );
    expect(result).toEqual(sentLog);
  });

  it("marks as failed when provider throws", async () => {
    const pendingLog = {
      id: "log-2",
      workspace_id: "ws-1",
      contact_id: "c-1",
      status: "pending",
    };
    const failedLog = { ...pendingLog, status: "failed" };

    mockSingle.mockResolvedValueOnce({ data: pendingLog, error: null });
    (mockProvider.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("SMTP error")
    );
    mockSingle.mockResolvedValueOnce({ data: failedLog, error: null });

    const result = await sendEmail("ws-1", {
      to: "alice@example.com",
      subject: "Hello",
      body: "Hi there",
      contactId: "c-1",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        provider_response: { error: "SMTP error" },
      })
    );
    expect(result).toEqual(failedLog);
  });

  it("throws when initial log insert fails", async () => {
    const dbError = new Error("Insert failed");
    mockSingle.mockResolvedValueOnce({ data: null, error: dbError });

    await expect(
      sendEmail("ws-1", {
        to: "alice@example.com",
        subject: "Hello",
        body: "Hi",
        contactId: "c-1",
      })
    ).rejects.toThrow("Insert failed");
  });

  it("passes optional templateId and enrollmentId", async () => {
    const pendingLog = { id: "log-3", status: "pending" };
    const sentLog = { id: "log-3", status: "sent" };

    mockSingle.mockResolvedValueOnce({ data: pendingLog, error: null });
    mockSingle.mockResolvedValueOnce({ data: sentLog, error: null });

    await sendEmail("ws-1", {
      to: "bob@example.com",
      subject: "Campaign",
      body: "Hello",
      contactId: "c-2",
      templateId: "tmpl-1",
      enrollmentId: "enroll-1",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: "tmpl-1",
        enrollment_id: "enroll-1",
      })
    );
  });
});
