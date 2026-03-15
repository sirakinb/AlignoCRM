import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepLog } from "@/components/logs/step-log";
import { StepOutcome } from "@/types/enrollment";
import type { ExecutionStep } from "@/types/enrollment";

afterEach(cleanup);

const mockSteps: ExecutionStep[] = [
  {
    id: "step-1",
    enrollment_id: "enr-1",
    node_id: "node-1",
    node_type: "trigger",
    outcome: StepOutcome.Completed,
    started_at: "2026-03-12T10:24:00Z",
    completed_at: "2026-03-12T10:24:01Z",
    error_message: null,
    provider_response: null,
    metadata: null,
    created_at: "2026-03-12T10:24:00Z",
  },
  {
    id: "step-2",
    enrollment_id: "enr-1",
    node_id: "node-2",
    node_type: "send_email",
    outcome: StepOutcome.Failed,
    started_at: "2026-03-12T10:24:02Z",
    completed_at: "2026-03-12T10:24:05Z",
    error_message: "SMTP connection refused",
    provider_response: { status: 500 },
    metadata: null,
    created_at: "2026-03-12T10:24:02Z",
  },
  {
    id: "step-3",
    enrollment_id: "enr-1",
    node_id: "node-3",
    node_type: "wait",
    outcome: StepOutcome.Waiting,
    started_at: "2026-03-12T10:24:06Z",
    completed_at: null,
    error_message: null,
    provider_response: null,
    metadata: null,
    created_at: "2026-03-12T10:24:06Z",
  },
];

describe("StepLog", () => {
  it("renders steps with outcome labels", () => {
    render(<StepLog steps={mockSteps} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("renders node type labels from config", () => {
    render(<StepLog steps={mockSteps} />);
    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.getByText("Send Email")).toBeInTheDocument();
    expect(screen.getByText("Wait")).toBeInTheDocument();
  });

  it("renders error messages for failed steps", () => {
    render(<StepLog steps={mockSteps} />);
    expect(screen.getByText("SMTP connection refused")).toBeInTheDocument();
  });

  it("renders provider response snippet", () => {
    render(<StepLog steps={mockSteps} />);
    expect(screen.getByText(/Provider:/)).toBeInTheDocument();
  });

  it("shows 'In progress' for steps without completed_at", () => {
    render(<StepLog steps={mockSteps} />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<StepLog steps={[]} />);
    expect(
      screen.getByText("No execution steps recorded.")
    ).toBeInTheDocument();
  });

  it("renders the step-log test id", () => {
    render(<StepLog steps={mockSteps} />);
    expect(screen.getByTestId("step-log")).toBeInTheDocument();
  });
});
