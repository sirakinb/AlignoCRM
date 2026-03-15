import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApprovalsListPage from "@/app/automations/approvals/page";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("ApprovalsListPage", () => {
  it("renders the page heading", () => {
    render(<ApprovalsListPage />);
    expect(
      screen.getByRole("heading", { name: "Approvals" })
    ).toBeInTheDocument();
  });

  it("shows pending count", () => {
    render(<ApprovalsListPage />);
    expect(screen.getByText(/2 pending review/)).toBeInTheDocument();
  });

  it("renders all sample approval cards", () => {
    render(<ApprovalsListPage />);
    expect(screen.getByText("Outreach to Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Outreach to James Wilson")).toBeInTheDocument();
    expect(screen.getByText("Outreach to Mike Reynolds")).toBeInTheDocument();
    expect(screen.getByText("Analysis: Lisa Park")).toBeInTheDocument();
  });

  it("renders status badges", () => {
    render(<ApprovalsListPage />);
    const needsReview = screen.getAllByText("Needs Review");
    expect(needsReview).toHaveLength(2);
  });

  it("renders filter tabs", () => {
    render(<ApprovalsListPage />);
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Rejected" })).toBeInTheDocument();
  });

  it("filters by Pending status", () => {
    render(<ApprovalsListPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));

    expect(screen.getByText("Outreach to Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Outreach to James Wilson")).toBeInTheDocument();
    expect(
      screen.queryByText("Outreach to Mike Reynolds")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Analysis: Lisa Park")).not.toBeInTheDocument();
  });

  it("filters by Approved status", () => {
    render(<ApprovalsListPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Approved" }));

    expect(screen.getByText("Outreach to Mike Reynolds")).toBeInTheDocument();
    expect(
      screen.queryByText("Outreach to Sarah Chen")
    ).not.toBeInTheDocument();
  });

  it("filters by Rejected status", () => {
    render(<ApprovalsListPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Rejected" }));

    expect(screen.getByText("Analysis: Lisa Park")).toBeInTheDocument();
    expect(
      screen.queryByText("Outreach to Sarah Chen")
    ).not.toBeInTheDocument();
  });

  it("switches back to All tab showing all items", () => {
    render(<ApprovalsListPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Outreach to Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Analysis: Lisa Park")).toBeInTheDocument();
  });

  it("renders content type labels", () => {
    render(<ApprovalsListPage />);
    const emailLabels = screen.getAllByText(/Email Draft/);
    expect(emailLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/SMS Draft/)).toBeInTheDocument();
    expect(screen.getByText(/AI Analysis/)).toBeInTheDocument();
  });

  it("renders links to individual review pages", () => {
    render(<ApprovalsListPage />);
    const links = screen.getAllByRole("link");
    const approvalLinks = links.filter((l) =>
      l.getAttribute("href")?.startsWith("/automations/approvals/apr-")
    );
    expect(approvalLinks).toHaveLength(4);
  });

  it("renders breadcrumb with Automations link", () => {
    render(<ApprovalsListPage />);
    const link = screen.getByRole("link", { name: "Automations" });
    expect(link).toHaveAttribute("href", "/automations");
  });
});
