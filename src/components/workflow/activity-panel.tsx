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
import type { Contact } from "@/types/crm";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";

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
  { bg: string; text: string; dot: string; label: string }
> = {
  [EnrollmentStatus.Active]: {
    bg: withAlpha(getPurpleScaleColor(2), 0.12),
    text: getPurpleScaleColor(4),
    dot: getPurpleScaleColor(2),
    label: "Active",
  },
  [EnrollmentStatus.Completed]: {
    bg: withAlpha(getPurpleScaleColor(5), 0.12),
    text: getPurpleScaleColor(5),
    dot: getPurpleScaleColor(5),
    label: "Completed",
  },
  [EnrollmentStatus.Failed]: {
    bg: "rgba(239, 68, 68, 0.12)",
    text: "#b91c1c",
    dot: "#ef4444",
    label: "Failed",
  },
  [EnrollmentStatus.Paused]: {
    bg: withAlpha(getPurpleScaleColor(1), 0.12),
    text: getPurpleScaleColor(2),
    dot: getPurpleScaleColor(1),
    label: "Paused",
  },
  [EnrollmentStatus.Canceled]: {
    bg: withAlpha(getPurpleScaleColor(0), 0.1),
    text: "#685b83",
    dot: "#8c7ea8",
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
          const response = await fetch(`/api/contacts/${id}`, {
            cache: "no-store",
          });
          const payload = await response.json();
          return [id, response.ok ? (payload.contact as Contact) : null] as const;
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
      className="aligno-panel-soft flex h-full w-[340px] flex-col border-l"
      style={{
        borderColor: withAlpha(getPurpleScaleColor(4), 0.18),
      }}
      data-testid="activity-panel"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-5 py-4"
        style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.12) }}
      >
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: getPurpleScaleColor(4) }} />
          <span className="text-sm font-semibold text-gray-900">Activity</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1"
          style={{ color: getPurpleScaleColor(1) }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Summary bar */}
      <div
        className="flex gap-3 border-b px-5 py-3"
        style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.12) }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColors[EnrollmentStatus.Active].dot }}
          />
          <span className="text-xs text-gray-600">
            {counts.active} Active
          </span>
        </div>
        {counts.paused > 0 && (
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: statusColors[EnrollmentStatus.Paused].dot }}
            />
            <span className="text-xs text-gray-600">
              {counts.paused} Paused
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColors[EnrollmentStatus.Completed].dot }}
          />
          <span className="text-xs text-gray-600">
            {counts.completed} Completed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColors[EnrollmentStatus.Failed].dot }}
          />
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
                  className="flex w-full items-center gap-1.5 border-b px-4 py-2.5 text-xs"
                  style={{
                    borderColor: withAlpha(getPurpleScaleColor(4), 0.12),
                    color: "#6f6488",
                  }}
                >
                  <ChevronLeft size={14} />
                  Back to list
                </button>

                <div
                  className="border-b px-5 py-3"
                  style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.12) }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ backgroundColor: withAlpha(getPurpleScaleColor(1), 0.12) }}
                      >
                        <User size={14} style={{ color: getPurpleScaleColor(3) }} />
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
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: sc.bg, color: sc.text }}
                    >
                      {sc.label}
                    </span>
                  </div>
                </div>

                {/* Execution steps */}
                <div className="px-5 py-3">
                  <div
                    className="mb-2 text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: withAlpha(getPurpleScaleColor(5), 0.56) }}
                  >
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
                              className="flex items-start gap-2 rounded-lg px-3 py-2"
                              style={{
                                backgroundColor: isFailed
                                  ? "rgba(239, 68, 68, 0.08)"
                                  : withAlpha(getPurpleScaleColor(0), 0.08),
                              }}
                            >
                              <div className="mt-0.5">
                                {isCompleted && (
                                  <CheckCircle2
                                    size={14}
                                    style={{ color: getPurpleScaleColor(5) }}
                                  />
                                )}
                                {isFailed && (
                                  <XCircle
                                    size={14}
                                    style={{ color: "#ef4444" }}
                                  />
                                )}
                                {isWaiting && (
                                  <Clock
                                    size={14}
                                    style={{ color: getPurpleScaleColor(2) }}
                                  />
                                )}
                                {isCanceled && (
                                  <MinusCircle
                                    size={14}
                                    style={{ color: "#9b8fb5" }}
                                  />
                                )}
                                {!isCompleted &&
                                  !isFailed &&
                                  !isWaiting &&
                                  !isCanceled && (
                                    <MinusCircle
                                      size={14}
                                      style={{ color: withAlpha(getPurpleScaleColor(1), 0.4) }}
                                    />
                                  )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-900">
                                    {stepNodeName}
                                  </span>
                                  <span
                                    className="text-[10px] font-medium"
                                    style={{
                                      color: isFailed
                                        ? "#b91c1c"
                                        : isCompleted
                                          ? getPurpleScaleColor(5)
                                          : "#6f6488",
                                    }}
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
                              <div
                                className="ml-5 mt-1 rounded-lg border px-3 py-1.5"
                                style={{
                                  backgroundColor: withAlpha(getPurpleScaleColor(0), 0.08),
                                  borderColor: withAlpha(getPurpleScaleColor(4), 0.08),
                                }}
                              >
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
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: withAlpha(getPurpleScaleColor(0), 0.1) }}
            >
              <Activity size={20} style={{ color: getPurpleScaleColor(2) }} />
            </div>
            <p className="text-sm font-medium text-gray-700">
              No activity yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              This workflow hasn&apos;t been triggered.
            </p>
          </div>
        ) : (
          <div
            className="divide-y"
            style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.08) }}
          >
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
                  className="w-full px-5 py-3 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? withAlpha(getPurpleScaleColor(1), 0.1)
                      : "transparent",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={{ backgroundColor: withAlpha(getPurpleScaleColor(0), 0.1) }}
                      >
                        <User size={14} style={{ color: getPurpleScaleColor(3) }} />
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
                            <div
                              className="text-[11px]"
                              style={{ color: getPurpleScaleColor(2) }}
                            >
                              Waiting at:{" "}
                              <span className="font-medium">
                                {currentNodeName}
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: sc.bg, color: sc.text }}
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
