import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EnrollmentList } from "@/components/logs/enrollment-list";
import { EnrollmentStatus } from "@/types/enrollment";
import type { WorkflowEnrollment } from "@/types/enrollment";

afterEach(cleanup);

const mockEnrollments: WorkflowEnrollment[] = [
  {
    id: "enr-1",
    workspace_id: "ws-1",
    workflow_id: "wf-1",
    workflow_version_id: "wfv-1",
    record_id: "contact-1",
    record_type: "contact",
    current_node_id: null,
    status: EnrollmentStatus.Completed,
    resume_at: null,
    started_at: "2026-03-12T10:24:00Z",
    completed_at: "2026-03-12T10:28:00Z",
    created_at: "2026-03-12T10:24:00Z",
    updated_at: "2026-03-12T10:28:00Z",
  },
  {
    id: "enr-2",
    workspace_id: "ws-1",
    workflow_id: "wf-1",
    workflow_version_id: "wfv-1",
    record_id: "contact-2",
    record_type: "contact",
    current_node_id: "node-4",
    status: EnrollmentStatus.Failed,
    resume_at: null,
    started_at: "2026-03-12T11:00:00Z",
    completed_at: null,
    created_at: "2026-03-12T11:00:00Z",
    updated_at: "2026-03-12T11:02:00Z",
  },
];

const workflowNames = { "wf-1": "New Lead Follow-Up" };
const contactNames = {
  "contact-1": "Sarah Jenkins",
  "contact-2": "Michael Chen",
};

describe("EnrollmentList", () => {
  it("renders enrollment items", () => {
    render(
      <EnrollmentList
        enrollments={mockEnrollments}
        workflowNames={workflowNames}
        contactNames={contactNames}
      />
    );
    expect(screen.getByText("Sarah Jenkins")).toBeInTheDocument();
    expect(screen.getByText("Michael Chen")).toBeInTheDocument();
  });

  it("renders status badges", () => {
    render(
      <EnrollmentList
        enrollments={mockEnrollments}
        workflowNames={workflowNames}
        contactNames={contactNames}
      />
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders workflow names", () => {
    render(
      <EnrollmentList
        enrollments={mockEnrollments}
        workflowNames={workflowNames}
        contactNames={contactNames}
      />
    );
    const workflowLabels = screen.getAllByText("New Lead Follow-Up");
    expect(workflowLabels.length).toBe(2);
  });

  it("renders links to enrollment detail", () => {
    render(
      <EnrollmentList
        enrollments={mockEnrollments}
        workflowNames={workflowNames}
        contactNames={contactNames}
      />
    );
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/automations/logs/enr-1");
    expect(links[1]).toHaveAttribute("href", "/automations/logs/enr-2");
  });

  it("renders empty state", () => {
    render(
      <EnrollmentList
        enrollments={[]}
        workflowNames={{}}
        contactNames={{}}
      />
    );
    expect(screen.getByText("No enrollments found.")).toBeInTheDocument();
  });
});
