"use client";

import { useState, useEffect } from "react";
import {
  X,
  Activity,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  ChevronLeft,
  AlertTriangle,
} from "lucide-react";
import type {
  WorkflowEnrollment,
  ExecutionStep,
} from "@/types/enrollment";
import { EnrollmentStatus } from "@/types/enrollment";
import { getContact } from "@/lib/data/contacts";
import type { Contact } from "@/types/crm";

export interface EnrichedEnrollment extends WorkflowEnrollment {
  steps: ExecutionStep[];
}

interface ActivityPanelProps {
  enrollments: EnrichedEnrollment[];
  selectedEnrollmentId: string | null;
  onSelectEnrollment: (id: string | null) => void;
  onClose: () => void;
  nodeNames: Record<string, string>; // nodeId -> display name
}

const statusColors: Record<
  EnrollmentStatus,
  { bg: string; text: string; label: string }
> = {
  [EnrollmentStatus.Active]: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    label: "Active",
  },
  [EnrollmentStatus.Completed]: {
    bg: "bg-green-100",
    text: "text-green-700",
    label: "Completed",
  },
  [EnrollmentStatus.Failed]: {
    bg: "bg-red-100",
    text: "text-red-700",
    label: "Failed",
  },
  [EnrollmentStatus.Paused]: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    label: "Paused",
  },
  [EnrollmentStatus.Canceled]: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: "Canceled",
  },
};

function formatStepDetails(pr: Record<string, unknown>): string {
  switch (pr.action) {
    case "add_tag":
      return `Tag: ${pr.tagName || pr.tagId}`;
    case "remove_tag":
      return `Tag: ${pr.tagName || pr.tagId}`;
    case "move_deal_stage":
      return `Deal: ${pr.dealName || pr.dealId} → ${pr.stageName || pr.stageId}`;
    case "wait":
      return `Duration: ${pr.duration} ${pr.unit}`;
    case "send_sms":
      return `To: ${pr.to || "unknown"}`;
    default:
      // For email steps (no explicit action field)
      if (pr.to && pr.subject) {
        return `To: ${pr.to} | Subject: ${pr.subject}`;
      }
      return "";
  }
}

export function ActivityPanel({
  enrollments,
  selectedEnrollmentId,
  onSelectEnrollment,
  onClose,
  nodeNames,
}: ActivityPanelProps) {
  const [contactMap, setContactMap] = useState<Record<string, Contact>>({});

  // Load contact names for enrolled record_ids
  useEffect(() => {
    const recordIds = [...new Set(enrollments.map((e) => e.record_id))];
    const missing = recordIds.filter((id) => !contactMap[id]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (id) => {
        try {
          const contact = await getContact(id);
          return [id, contact] as const;
        } catch {
          return [id, null] as const;
        }
      })
    ).then((results) => {
      const newMap = { ...contactMap };
      for (const [id, contact] of results) {
        if (contact) newMap[id] = contact;
      }
      setContactMap(newMap);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollments]);

  const counts = {
    active: enrollments.filter(
      (e) => e.status === EnrollmentStatus.Active
    ).length,
    paused: enrollments.filter(
      (e) => e.status === EnrollmentStatus.Paused
    ).length,
    completed: enrollments.filter(
      (e) => e.status === EnrollmentStatus.Completed
    ).length,
    failed: enrollments.filter(
      (e) => e.status === EnrollmentStatus.Failed
    ).length,
  };

  return (
    <div
      className="flex h-full w-[340px] flex-col border-l border-gray-200 bg-white"
      data-testid="activity-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">Activity</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-xs text-gray-600">
            {counts.active} Active
          </span>
        </div>
        {counts.paused > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-xs text-gray-600">
              {counts.paused} Paused
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-600">
            {counts.completed} Completed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-xs text-gray-600">
            {counts.failed} Failed
          </span>
        </div>
      </div>

      {/* Enrollment list or detail view */}
      <div className="flex-1 overflow-y-auto">
        {selectedEnrollmentId ? (
          // --- Detail view for selected enrollment ---
          (() => {
            const enrollment = enrollments.find(
              (e) => e.id === selectedEnrollmentId
            );
            if (!enrollment) return null;
            const contact = contactMap[enrollment.record_id];
            const contactName = contact
              ? `${contact.first_name} ${contact.last_name}`.trim()
              : enrollment.record_id.slice(0, 8) + "...";
            const sc = statusColors[enrollment.status];

            return (
              <div>
                {/* Back button + contact header */}
                <button
                  onClick={() => onSelectEnrollment(null)}
                  className="flex w-full items-center gap-1.5 border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  <ChevronLeft size={14} />
                  Back to list
                </button>

                <div className="border-b border-gray-100 px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                        <User size={14} className="text-gray-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {contactName}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {new Date(
                            enrollment.created_at
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sc.bg} ${sc.text}`}
                    >
                      {sc.label}
                    </span>
                  </div>
                </div>

                {/* Execution steps */}
                <div className="px-5 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-2">
                    Execution Steps
                  </div>
                  {enrollment.steps.length === 0 ? (
                    <p className="text-xs text-gray-500">No steps recorded.</p>
                  ) : (
                    <div className="space-y-1">
                      {enrollment.steps.map((step, idx) => {
                        const stepNodeName =
                          nodeNames[step.node_id] ?? step.node_type;
                        const isFailed = step.outcome === "failed";
                        const isCompleted = step.outcome === "completed";
                        const isWaiting = step.outcome === "waiting";
                        const isCanceled = step.outcome === "canceled";

                        return (
                          <div key={step.id ?? idx}>
                            <div
                              className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
                                isFailed ? "bg-red-50" : "bg-gray-50"
                              }`}
                            >
                              <div className="mt-0.5">
                                {isCompleted && (
                                  <CheckCircle2
                                    size={14}
                                    className="text-green-500"
                                  />
                                )}
                                {isFailed && (
                                  <XCircle
                                    size={14}
                                    className="text-red-500"
                                  />
                                )}
                                {isWaiting && (
                                  <Clock
                                    size={14}
                                    className="text-yellow-500"
                                  />
                                )}
                                {isCanceled && (
                                  <MinusCircle
                                    size={14}
                                    className="text-gray-400"
                                  />
                                )}
                                {!isCompleted &&
                                  !isFailed &&
                                  !isWaiting &&
                                  !isCanceled && (
                                    <MinusCircle
                                      size={14}
                                      className="text-gray-300"
                                    />
                                  )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-900">
                                    {stepNodeName}
                                  </span>
                                  <span
                                    className={`text-[10px] font-medium ${
                                      isFailed
                                        ? "text-red-600"
                                        : isCompleted
                                          ? "text-green-600"
                                          : "text-gray-500"
                                    }`}
                                  >
                                    {step.outcome}
                                  </span>
                                </div>
                                {step.completed_at && (
                                  <div className="text-[10px] text-gray-400">
                                    {new Date(
                                      step.completed_at
                                    ).toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Step details from provider_response */}
                            {!isFailed && step.provider_response && (
                              <div className="ml-5 mt-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5">
                                <p className="text-[11px] text-gray-600">
                                  {formatStepDetails(step.provider_response)}
                                </p>
                              </div>
                            )}

                            {/* Error message */}
                            {isFailed && step.error_message && (
                              <div className="ml-5 mt-1 flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                                <AlertTriangle
                                  size={12}
                                  className="mt-0.5 flex-shrink-0 text-red-500"
                                />
                                <p className="text-[11px] text-red-700 break-all">
                                  {step.error_message}
                                </p>
                              </div>
                            )}

                            {/* Provider response for failed steps without error_message */}
                            {isFailed &&
                              !step.error_message &&
                              step.provider_response && (
                                <div className="ml-5 mt-1 flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                                  <AlertTriangle
                                    size={12}
                                    className="mt-0.5 flex-shrink-0 text-red-500"
                                  />
                                  <p className="text-[11px] text-red-700 break-all">
                                    {JSON.stringify(step.provider_response)}
                                  </p>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Activity size={20} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              No activity yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              This workflow hasn&apos;t been triggered.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {enrollments.map((enrollment) => {
              const contact = contactMap[enrollment.record_id];
              const contactName = contact
                ? `${contact.first_name} ${contact.last_name}`.trim()
                : enrollment.record_id.slice(0, 8) + "...";
              const sc = statusColors[enrollment.status];
              const isSelected = selectedEnrollmentId === enrollment.id;
              const currentNodeName = enrollment.current_node_id
                ? nodeNames[enrollment.current_node_id] ?? "Unknown node"
                : null;

              return (
                <button
                  key={enrollment.id}
                  onClick={() =>
                    onSelectEnrollment(
                      isSelected ? null : enrollment.id
                    )
                  }
                  className={`w-full px-5 py-3 text-left transition-colors hover:bg-gray-50 ${
                    isSelected ? "bg-purple-50 hover:bg-purple-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                        <User size={14} className="text-gray-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {contactName}
                        </div>
                        {enrollment.status === EnrollmentStatus.Active &&
                          currentNodeName && (
                            <div className="text-[11px] text-gray-500">
                              Currently at:{" "}
                              <span className="font-medium">
                                {currentNodeName}
                              </span>
                            </div>
                          )}
                        {enrollment.status === EnrollmentStatus.Paused &&
                          currentNodeName && (
                            <div className="text-[11px] text-yellow-600">
                              Waiting at:{" "}
                              <span className="font-medium">
                                {currentNodeName}
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sc.bg} ${sc.text}`}
                    >
                      {sc.label}
                    </span>
                  </div>
                  <div className="mt-1 pl-9 text-[11px] text-gray-400">
                    {new Date(enrollment.created_at).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
