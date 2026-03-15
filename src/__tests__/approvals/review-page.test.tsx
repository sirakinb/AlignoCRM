import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApprovalReviewPage from "@/app/automations/approvals/[id]/page";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "apr-1" }),
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

describe("ApprovalReviewPage", () => {
  it("renders the review title", () => {
    render(<ApprovalReviewPage />);
    expect(screen.getByText("Review AI Outreach Email")).toBeInTheDocument();
  });

  it("renders the Needs Review status badge", () => {
    render(<ApprovalReviewPage />);
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
  });

  it("renders the email To field", () => {
    render(<ApprovalReviewPage />);
    expect(screen.getByText("sarah@acmecorp.com")).toBeInTheDocument();
  });

  it("renders the email Subject field", () => {
    render(<ApprovalReviewPage />);
    expect(
      screen.getByText(
        "Following up on our conversation about the Enterprise Plan"
      )
    ).toBeInTheDocument();
  });

  it("renders the email body", () => {
    render(<ApprovalReviewPage />);
    expect(
      screen.getByText(/I wanted to follow up on our call last week/)
    ).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(<ApprovalReviewPage />);
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText(/Approve/)).toBeInTheDocument();
  });

  it("renders Regenerate Draft and Copy to Clipboard buttons", () => {
    render(<ApprovalReviewPage />);
    expect(screen.getByText("Regenerate Draft")).toBeInTheDocument();
    expect(screen.getByText("Copy to Clipboard")).toBeInTheDocument();
  });

  it("renders context section collapsed by default", () => {
    render(<ApprovalReviewPage />);
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.queryByText("Trigger Event")).not.toBeInTheDocument();
  });

  it("expands context section on click", () => {
    render(<ApprovalReviewPage />);
    fireEvent.click(screen.getByText("Context"));
    expect(screen.getByText("Trigger Event")).toBeInTheDocument();
    expect(
      screen.getByText(/Deal moved from 'Discovery' to 'Proposal Sent'/)
    ).toBeInTheDocument();
  });

  it("shows contact and company info when context is expanded", () => {
    render(<ApprovalReviewPage />);
    fireEvent.click(screen.getByText("Context"));
    expect(screen.getByText(/Sarah Chen - VP of Operations/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp \(Technology/)).toBeInTheDocument();
  });

  it("shows the AI prompt when context is expanded", () => {
    render(<ApprovalReviewPage />);
    fireEvent.click(screen.getByText("Context"));
    expect(screen.getByText("AI Prompt Used")).toBeInTheDocument();
    expect(screen.getByText(/Write a follow-up email/)).toBeInTheDocument();
  });

  it("renders breadcrumb navigation", () => {
    render(<ApprovalReviewPage />);
    expect(
      screen.getByRole("link", { name: "Automations" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Approvals" })
    ).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });
});
