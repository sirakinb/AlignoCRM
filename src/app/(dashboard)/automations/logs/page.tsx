"use client";

import { useState, useEffect } from "react";
import { EnrollmentStatus } from "@/types/enrollment";
import type { WorkflowEnrollment } from "@/types/enrollment";
import { EnrollmentList } from "@/components/logs/enrollment-list";
import { Loader2, FileText } from "lucide-react";

const statusFilters = [
  { label: "All", value: "all" },
  { label: "Active", value: EnrollmentStatus.Active },
  { label: "Completed", value: EnrollmentStatus.Completed },
  { label: "Failed", value: EnrollmentStatus.Failed },
  { label: "Canceled", value: EnrollmentStatus.Canceled },
] as const;

export default function EnrollmentLogsPage() {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [enrollments, setEnrollments] = useState<WorkflowEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEnrollments() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/enrollments", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load enrollments");
        }
        const data = (payload.enrollments ?? []) as WorkflowEnrollment[];
        if (!cancelled) {
          setEnrollments(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load enrollments"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEnrollments();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    activeFilter === "all"
      ? enrollments
      : enrollments.filter((e) => e.status === activeFilter);

  // Build lookup maps from actual enrollment data.
  // The EnrollmentList component expects workflowNames and contactNames maps.
  // With real data, these IDs are raw -- we pass them through as-is.
  const workflowNames: Record<string, string> = {};
  const contactNames: Record<string, string> = {};
  for (const e of enrollments) {
    if (!workflowNames[e.workflow_id]) {
      workflowNames[e.workflow_id] = e.workflow_id;
    }
    if (!contactNames[e.record_id]) {
      contactNames[e.record_id] = e.record_id;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">
          Loading execution logs...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <nav className="mb-4 text-sm text-gray-500">
          <span className="hover:text-gray-700">Automations</span>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Execution Logs</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">Execution Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          View enrollment history and step-level execution details.
        </p>
      </div>

      {/* Status filters */}
      <div className="mb-4 flex gap-2">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === filter.value
                ? "bg-[#6C2BD9] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {enrollments.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <FileText size={40} className="mx-auto text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            No execution logs yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            When contacts are enrolled in workflows, their execution logs will
            appear here.
          </p>
        </div>
      ) : (
        <EnrollmentList
          enrollments={filtered}
          workflowNames={workflowNames}
          contactNames={contactNames}
        />
      )}
    </div>
  );
}
