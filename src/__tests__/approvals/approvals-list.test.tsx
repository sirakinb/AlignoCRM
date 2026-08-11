import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApprovalsListPage from "@/app/(dashboard)/automations/approvals/page";
import { ApprovalStatus, ApprovalContentType } from "@/types/approval";
import type { ApprovalRequest } from "@/types/approval";

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
// The page now loads approvals from /api/approvals, so we mock fetch.
// ---------------------------------------------------------------------------

const makeApproval = (
  overrides: Partial<ApprovalRequest> & { id: string }
): ApprovalRequest => ({
  workspace_id: "ws-1",
  enrollment_id: null,
  node_id: null,
  content_type: ApprovalContentType.EmailDraft,
  content: {},
  context: {},
  status: ApprovalStatus.Pending,
  assigned_to: null,
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-01T10:00:00Z",
  ...overrides,
});

const sampleApprovals: ApprovalRequest[] = [
  makeApproval({
    id: "apr-1",
    content_type: ApprovalContentType.EmailDraft,
    status: ApprovalStatus.Pending,
    context: { contact: "Sarah Chen", company: "Northwind Traders" },
  }),
  makeApproval({
    id: "apr-2",
    content_type: ApprovalContentType.SmsDraft,
    status: ApprovalStatus.Pending,
    context: { contact: "James Wilson", company: "Contoso" },
  }),
  makeApproval({
    id: "apr-3",
    content_type: ApprovalContentType.EmailDraft,
    status: ApprovalStatus.Approved,
    context: { contact: "Mike Reynolds", company: "Fabrikam" },
  }),
  makeApproval({
    id: "apr-4",
    content_type: ApprovalContentType.AiAnalysis,
    status: ApprovalStatus.Rejected,
    context: { contact: "Lisa Park", company: "Adventure Works" },
  }),
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ approvals: sampleApprovals }),
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
  render(<ApprovalsListPage />);
  await screen.findByRole("heading", { name: "Approvals" });
}

describe("ApprovalsListPage", () => {
  it("renders the page heading", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "Approvals" })
    ).toBeInTheDocument();
  });

  it("shows pending count", async () => {
    await renderPage();
    expect(screen.getByText(/2 pending review/)).toBeInTheDocument();
  });

  it("renders all sample approval cards", async () => {
    await renderPage();
    expect(screen.getByText("Outreach to Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Outreach to James Wilson")).toBeInTheDocument();
    expect(screen.getByText("Outreach to Mike Reynolds")).toBeInTheDocument();
    expect(screen.getByText("Analysis: Lisa Park")).toBeInTheDocument();
  });

  it("renders status badges", async () => {
    await renderPage();
    const needsReview = screen.getAllByText("Needs Review");
    expect(needsReview).toHaveLength(2);
  });

  it("renders filter tabs", async () => {
    await renderPage();
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Rejected" })).toBeInTheDocument();
  });

  it("filters by Pending status", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));

    expect(screen.getByText("Outreach to Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Outreach to James Wilson")).toBeInTheDocument();
    expect(
      screen.queryByText("Outreach to Mike Reynolds")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Analysis: Lisa Park")).not.toBeInTheDocument();
  });

  it("filters by Approved status", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Approved" }));

    expect(screen.getByText("Outreach to Mike Reynolds")).toBeInTheDocument();
    expect(
      screen.queryByText("Outreach to Sarah Chen")
    ).not.toBeInTheDocument();
  });

  it("filters by Rejected status", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Rejected" }));

    expect(screen.getByText("Analysis: Lisa Park")).toBeInTheDocument();
    expect(
      screen.queryByText("Outreach to Sarah Chen")
    ).not.toBeInTheDocument();
  });

  it("switches back to All tab showing all items", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Outreach to Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Analysis: Lisa Park")).toBeInTheDocument();
  });

  it("renders content type labels", async () => {
    await renderPage();
    const emailLabels = screen.getAllByText(/Email Draft/);
    expect(emailLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/SMS Draft/)).toBeInTheDocument();
    expect(screen.getByText(/AI Analysis/)).toBeInTheDocument();
  });

  it("renders links to individual review pages", async () => {
    await renderPage();
    const links = screen.getAllByRole("link");
    const approvalLinks = links.filter((l) =>
      l.getAttribute("href")?.startsWith("/automations/approvals/apr-")
    );
    expect(approvalLinks).toHaveLength(4);
  });

  it("renders breadcrumb with Automations link", async () => {
    await renderPage();
    const link = screen.getByRole("link", { name: "Automations" });
    expect(link).toHaveAttribute("href", "/automations");
  });
});
