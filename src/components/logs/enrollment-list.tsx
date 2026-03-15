"use client";

import Link from "next/link";
import { EnrollmentStatus } from "@/types/enrollment";
import type { WorkflowEnrollment } from "@/types/enrollment";

const statusConfig: Record<
  EnrollmentStatus,
  { label: string; className: string }
> = {
  [EnrollmentStatus.Active]: {
    label: "Active",
    className: "bg-blue-100 text-blue-700",
  },
  [EnrollmentStatus.Paused]: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-700",
  },
  [EnrollmentStatus.Completed]: {
    label: "Completed",
    className: "bg-green-100 text-green-700",
  },
  [EnrollmentStatus.Failed]: {
    label: "Failed",
    className: "bg-red-100 text-red-700",
  },
  [EnrollmentStatus.Canceled]: {
    label: "Canceled",
    className: "bg-gray-100 text-gray-600",
  },
};

interface EnrollmentListProps {
  enrollments: WorkflowEnrollment[];
  workflowNames: Record<string, string>;
  contactNames: Record<string, string>;
}

export function EnrollmentList({
  enrollments,
  workflowNames,
  contactNames,
}: EnrollmentListProps) {
  if (enrollments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No enrollments found.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="enrollment-list">
      {enrollments.map((enrollment) => {
        const status = statusConfig[enrollment.status];
        const workflowName =
          workflowNames[enrollment.workflow_id] ?? "Unknown Workflow";
        const contactName =
          contactNames[enrollment.record_id] ?? enrollment.record_id;
        const startedAt = new Date(enrollment.started_at).toLocaleString();

        return (
          <Link
            key={enrollment.id}
            href={`/automations/logs/${enrollment.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition-shadow hover:shadow-md"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {contactName}
                </span>
                <span className="text-xs text-gray-400">&middot;</span>
                <span className="text-xs text-gray-500">{workflowName}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                Started {startedAt}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
