import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApprovalReviewPage from "@/app/(dashboard)/automations/approvals/[id]/page";
import { ApprovalStatus, ApprovalContentType } from "@/types/approval";
import type { ApprovalRequest } from "@/types/approval";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "apr-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// ---------------------------------------------------------------------------
// The page now loads the approval from /api/approvals/[id], so we mock fetch.
// ---------------------------------------------------------------------------

const sampleApproval: ApprovalRequest = {
  id: "apr-1",
  workspace_id: "ws-1",
  enrollment_id: null,
  node_id: null,
  content_type: ApprovalContentType.EmailDraft,
  content: {
    to: "sarah@acmecorp.com",
    subject: "Following up on our conversation about the Enterprise Plan",
    body: "Hi Sarah,\n\nI wanted to follow up on our call last week about the Enterprise Plan.\n\nBest,\nAki",
  },
  context: {
    trigger_details: "Deal moved from 'Discovery' to 'Proposal Sent'",
    source_data: {
      contact: { name: "Sarah Chen", title: "VP of Operations" },
      company: { name: "Acme Corp", industry: "Technology", size: "200-500" },
    },
    ai_prompt:
      "Write a follow-up email referencing the last call and the Enterprise Plan.",
  },
  status: ApprovalStatus.Pending,
  assigned_to: null,
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-01T10:00:00Z",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ approval: sampleApproval }),
      } as Response)
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders the page and waits for the async fetch/loading state to resolve. */
async function renderPage() {
  render(<ApprovalReviewPage />);
  await screen.findByText("Review AI Outreach Email");
}

describe("ApprovalReviewPage", () => {
  it("renders the review title", async () => {
    await renderPage();
    expect(screen.getByText("Review AI Outreach Email")).toBeInTheDocument();
  });

  it("renders the Needs Review status badge", async () => {
    await renderPage();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
  });

  it("renders the email To field", async () => {
    await renderPage();
    expect(screen.getByText("sarah@acmecorp.com")).toBeInTheDocument();
  });

  it("renders the email Subject field", async () => {
    await renderPage();
    expect(
      screen.getByText(
        "Following up on our conversation about the Enterprise Plan"
      )
    ).toBeInTheDocument();
  });

  it("renders the email body", async () => {
    await renderPage();
    expect(
      screen.getByText(/I wanted to follow up on our call last week/)
    ).toBeInTheDocument();
  });

  it("renders action buttons", async () => {
    await renderPage();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText(/Approve/)).toBeInTheDocument();
  });

  it("renders Regenerate Draft and Copy to Clipboard buttons", async () => {
    await renderPage();
    expect(screen.getByText("Regenerate Draft")).toBeInTheDocument();
    expect(screen.getByText("Copy to Clipboard")).toBeInTheDocument();
  });

  it("renders context section collapsed by default", async () => {
    await renderPage();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.queryByText("Trigger Event")).not.toBeInTheDocument();
  });

  it("expands context section on click", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Context"));
    expect(screen.getByText("Trigger Event")).toBeInTheDocument();
    expect(
      screen.getByText(/Deal moved from 'Discovery' to 'Proposal Sent'/)
    ).toBeInTheDocument();
  });

  it("shows contact and company info when context is expanded", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Context"));
    expect(
      screen.getByText(/Sarah Chen - VP of Operations/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp \(Technology/)).toBeInTheDocument();
  });

  it("shows the AI prompt when context is expanded", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Context"));
    expect(screen.getByText("AI Prompt Used")).toBeInTheDocument();
    expect(screen.getByText(/Write a follow-up email/)).toBeInTheDocument();
  });

  it("renders breadcrumb navigation", async () => {
    await renderPage();
    expect(
      screen.getByRole("link", { name: "Automations" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Approvals" })
    ).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });
});
