"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Mail,
  MessageSquare,
  BrainCircuit,
  GitFork,
  Clock,
  CheckCircle2,
  XCircle,
  PenLine,
  Loader2,
  Inbox,
} from "lucide-react";
import { ApprovalStatus, ApprovalContentType } from "@/types/approval";
import type { ApprovalRequest } from "@/types/approval";

const contentTypeIcons: Record<ApprovalContentType, typeof Mail> = {
  [ApprovalContentType.EmailDraft]: Mail,
  [ApprovalContentType.SmsDraft]: MessageSquare,
  [ApprovalContentType.AiAnalysis]: BrainCircuit,
  [ApprovalContentType.AiRoute]: GitFork,
};

const contentTypeLabels: Record<ApprovalContentType, string> = {
  [ApprovalContentType.EmailDraft]: "Email Draft",
  [ApprovalContentType.SmsDraft]: "SMS Draft",
  [ApprovalContentType.AiAnalysis]: "AI Analysis",
  [ApprovalContentType.AiRoute]: "AI Route",
};

const statusConfig: Record<
  ApprovalStatus,
  { label: string; className: string; icon: typeof Clock }
> = {
  [ApprovalStatus.Pending]: {
    label: "Needs Review",
    className: "bg-amber-100 text-amber-700",
    icon: Clock,
  },
  [ApprovalStatus.Approved]: {
    label: "Approved",
    className: "bg-green-100 text-green-700",
    icon: CheckCircle2,
  },
  [ApprovalStatus.Rejected]: {
    label: "Rejected",
    className: "bg-red-100 text-red-700",
    icon: XCircle,
  },
  [ApprovalStatus.Edited]: {
    label: "Edited & Approved",
    className: "bg-blue-100 text-blue-700",
    icon: PenLine,
  },
};

type FilterTab = "all" | ApprovalStatus;

const tabs: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: ApprovalStatus.Pending, label: "Pending" },
  { key: ApprovalStatus.Approved, label: "Approved" },
  { key: ApprovalStatus.Rejected, label: "Rejected" },
];

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTitle(request: ApprovalRequest): string {
  if (
    request.content_type === ApprovalContentType.EmailDraft ||
    request.content_type === ApprovalContentType.SmsDraft
  ) {
    const contact = request.context.contact as string | undefined;
    return contact
      ? `Outreach to ${contact}`
      : `${contentTypeLabels[request.content_type]}`;
  }
  if (request.content_type === ApprovalContentType.AiAnalysis) {
    const contact = request.context.contact as string | undefined;
    return contact ? `Analysis: ${contact}` : "AI Analysis";
  }
  return "AI Route Decision";
}

export default function ApprovalsListPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchApprovals() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/approvals", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load approvals");
        }
        const data = (payload.approvals ?? []) as ApprovalRequest[];
        if (!cancelled) {
          setApprovals(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load approvals"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchApprovals();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    activeTab === "all"
      ? approvals
      : approvals.filter((a) => a.status === activeTab);

  const pendingCount = approvals.filter(
    (a) => a.status === ApprovalStatus.Pending
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading approvals...</span>
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
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/automations" className="hover:text-gray-700">
          Automations
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Approvals</span>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <span className="text-sm text-gray-500">
          {pendingCount} pending review
        </span>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {approvals.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Inbox size={40} className="mx-auto text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            No approval requests yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            When workflows generate content that needs review, approval requests
            will appear here.
          </p>
        </div>
      ) : (
        /* List */
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-500">
              No approval requests match the current filter.
            </p>
          )}
          {filtered.map((request) => {
            const Icon = contentTypeIcons[request.content_type];
            const status = statusConfig[request.status];
            const StatusIcon = status.icon;

            return (
              <Link
                key={request.id}
                href={`/automations/approvals/${request.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <Icon size={20} className="text-gray-600" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-gray-900">
                        {getTitle(request)}
                      </h3>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        <StatusIcon size={12} />
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {contentTypeLabels[request.content_type]}
                      {request.context.company
                        ? ` - ${request.context.company}`
                        : ""}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <span className="shrink-0 text-sm text-gray-400">
                    {formatTimestamp(request.created_at)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
