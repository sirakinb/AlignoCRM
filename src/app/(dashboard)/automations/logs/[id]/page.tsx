"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StepLog } from "@/components/logs/step-log";
import { EnrollmentStatus } from "@/types/enrollment";
import type { WorkflowEnrollment, ExecutionStep } from "@/types/enrollment";
import { Loader2, AlertCircle } from "lucide-react";

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

export default function EnrollmentDetailPage() {
  const params = useParams();
  const enrollmentId = params.id as string;

  const [enrollment, setEnrollment] = useState<WorkflowEnrollment | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/enrollments/${enrollmentId}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load enrollment");
        }
        const enrollmentData = payload.enrollment as WorkflowEnrollment;
        const stepsData = (payload.steps ?? []) as ExecutionStep[];

        if (!cancelled) {
          setEnrollment(enrollmentData);
          setSteps(stepsData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load enrollment"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [enrollmentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">
          Loading enrollment details...
        </span>
      </div>
    );
  }

  if (error && !enrollment) {
    return (
      <div className="p-6">
        <nav className="mb-4 text-sm text-gray-500">
          <Link href="/automations" className="hover:text-gray-700">
            Automations
          </Link>
          <span className="mx-2">/</span>
          <Link href="/automations/logs" className="hover:text-gray-700">
            Execution Logs
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Detail</span>
        </nav>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle size={24} className="mx-auto text-red-400" />
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Link
            href="/automations/logs"
            className="mt-3 inline-block text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Back to execution logs
          </Link>
        </div>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="p-6">
        <nav className="mb-4 text-sm text-gray-500">
          <Link href="/automations" className="hover:text-gray-700">
            Automations
          </Link>
          <span className="mx-2">/</span>
          <Link href="/automations/logs" className="hover:text-gray-700">
            Execution Logs
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Detail</span>
        </nav>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <AlertCircle size={24} className="mx-auto text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">Enrollment not found.</p>
          <Link
            href="/automations/logs"
            className="mt-3 inline-block text-sm font-medium text-[#6C2BD9] underline hover:text-[#5b24b8]"
          >
            Back to execution logs
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[enrollment.status];
  const displayName = enrollment.record_id;
  const workflowName = enrollment.workflow_id;

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/automations" className="hover:text-gray-700">
          Automations
        </Link>
        <span className="mx-2">/</span>
        <Link href="/automations/logs" className="hover:text-gray-700">
          Execution Logs
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{displayName}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{workflowName}</p>
        </div>
      </div>

      {/* Meta info */}
      <div className="mb-6 grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <p className="text-xs font-medium text-gray-400">Started</p>
          <p className="mt-0.5 text-sm text-gray-900">
            {new Date(enrollment.started_at).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400">Completed</p>
          <p className="mt-0.5 text-sm text-gray-900">
            {enrollment.completed_at
              ? new Date(enrollment.completed_at).toLocaleString()
              : "\u2014"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400">Steps</p>
          <p className="mt-0.5 text-sm text-gray-900">{steps.length}</p>
        </div>
      </div>

      {/* Step log */}
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        Execution Timeline
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <StepLog steps={steps} />
      </div>
    </div>
  );
}
