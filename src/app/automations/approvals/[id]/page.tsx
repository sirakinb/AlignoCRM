"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  XCircle,
  PenLine,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { ApprovalStatus, ApprovalContentType } from "@/types/approval";
import type { ApprovalRequest } from "@/types/approval";
import {
  getApprovalRequest,
  approveRequest,
  rejectRequest,
  editAndApproveRequest,
} from "@/lib/data/approvals";

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

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getReviewTitle(request: ApprovalRequest): string {
  switch (request.content_type) {
    case ApprovalContentType.EmailDraft:
      return "Review AI Outreach Email";
    case ApprovalContentType.SmsDraft:
      return "Review AI SMS Message";
    case ApprovalContentType.AiAnalysis:
      return "Review AI Analysis";
    case ApprovalContentType.AiRoute:
      return "Review AI Route Decision";
    default:
      return "Review Request";
  }
}

export default function ApprovalReviewPage() {
  const params = useParams();
  const router = useRouter();
  const approvalId = params.id as string;

  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState("");
  const [editedSubject, setEditedSubject] = useState("");

  // Reject state
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchApproval() {
      try {
        setLoading(true);
        setError(null);
        const data = await getApprovalRequest(approvalId);
        if (!cancelled) {
          setRequest(data);
          setEditedBody((data.content.body as string) ?? "");
          setEditedSubject((data.content.subject as string) ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load approval"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchApproval();
    return () => {
      cancelled = true;
    };
  }, [approvalId]);

  const handleCopy = async () => {
    if (!request) return;
    const body = (request.content.body as string) ?? (request.content.message as string) ?? "";
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = async () => {
    if (!request) return;
    try {
      setActionLoading("approve");
      await approveRequest(request.id, "user");
      router.push("/automations/approvals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    try {
      setActionLoading("reject");
      await rejectRequest(request.id, "user", rejectComment || undefined);
      router.push("/automations/approvals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
      setActionLoading(null);
    }
  };

  const handleEditAndApprove = async () => {
    if (!request) return;
    try {
      setActionLoading("edit");
      const editedContent = {
        ...request.content,
        body: editedBody,
        subject: editedSubject,
      };
      await editAndApproveRequest(request.id, "user", editedContent);
      router.push("/automations/approvals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edits");
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">
          Loading approval request...
        </span>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="p-6">
        <nav className="mb-4 text-sm text-gray-500">
          <Link href="/automations" className="hover:text-gray-700">
            Automations
          </Link>
          <span className="mx-2">/</span>
          <Link href="/automations/approvals" className="hover:text-gray-700">
            Approvals
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Review</span>
        </nav>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle size={24} className="mx-auto text-red-400" />
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Link
            href="/automations/approvals"
            className="mt-3 inline-block text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Back to approvals
          </Link>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-6">
        <nav className="mb-4 text-sm text-gray-500">
          <Link href="/automations" className="hover:text-gray-700">
            Automations
          </Link>
          <span className="mx-2">/</span>
          <Link href="/automations/approvals" className="hover:text-gray-700">
            Approvals
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Review</span>
        </nav>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <AlertCircle size={24} className="mx-auto text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">
            Approval request not found.
          </p>
          <Link
            href="/automations/approvals"
            className="mt-3 inline-block text-sm font-medium text-[#6C2BD9] underline hover:text-[#5b24b8]"
          >
            Back to approvals
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[request.status];
  const StatusIcon = status.icon;
  const isPending = request.status === ApprovalStatus.Pending;

  const sourceData = request.context.source_data as
    | Record<string, unknown>
    | undefined;
  const contact = sourceData?.contact as Record<string, string> | undefined;
  const company = sourceData?.company as Record<string, string> | undefined;
  const aiPrompt = request.context.ai_prompt as string | undefined;

  const isEmailOrSms =
    request.content_type === ApprovalContentType.EmailDraft ||
    request.content_type === ApprovalContentType.SmsDraft;

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/automations" className="hover:text-gray-700">
          Automations
        </Link>
        <span className="mx-2">/</span>
        <Link href="/automations/approvals" className="hover:text-gray-700">
          Approvals
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Review</span>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              <StatusIcon size={12} />
              {status.label}
            </span>
            <span className="text-sm text-gray-500">
              {formatTimestamp(request.created_at)}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getReviewTitle(request)}
          </h1>
        </div>

        {/* Action buttons -- only show for pending requests */}
        {isPending && (
          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedBody((request.content.body as string) ?? "");
                    setEditedSubject((request.content.subject as string) ?? "");
                  }}
                  disabled={!!actionLoading}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel Edit
                </button>
                <button
                  onClick={handleEditAndApprove}
                  disabled={!!actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading === "edit" && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  Save & Approve
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={!!actionLoading}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Edit
                </button>
                {showRejectInput ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                    <button
                      onClick={handleReject}
                      disabled={!!actionLoading}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {actionLoading === "reject" && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectInput(false);
                        setRejectComment("");
                      }}
                      disabled={!!actionLoading}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRejectInput(true)}
                    disabled={!!actionLoading}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                <button
                  onClick={handleApprove}
                  disabled={!!actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading === "approve" && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  Approve &amp; Send
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content card */}
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-gray-200 bg-white">
          {/* Email/SMS header fields */}
          {isEmailOrSms && (
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-medium text-gray-500">To:</span>
                <span className="text-sm text-gray-900">
                  {(request.content.to as string) ?? ""}
                </span>
              </div>
              {request.content_type === ApprovalContentType.EmailDraft && (
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    Subject:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-gray-900">
                      {request.content.subject as string}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Body / Content */}
          <div className="px-6 py-5">
            <div className="rounded-lg bg-gray-50 p-5">
              {isEditing ? (
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-gray-300 bg-white p-4 text-sm leading-relaxed text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {(request.content.body as string) ??
                    (request.content.message as string) ??
                    (request.content.analysis as string) ??
                    JSON.stringify(request.content, null, 2)}
                </p>
              )}
            </div>

            {/* AI Analysis recommendation */}
            {request.content_type === ApprovalContentType.AiAnalysis &&
              !!request.content.recommendation && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Recommendation
                  </span>
                  <p className="mt-1 text-sm text-blue-800">
                    {request.content.recommendation as string}
                  </p>
                </div>
              )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
            <button className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6C2BD9] hover:text-[#5b24b8]">
              <RotateCcw size={14} />
              Regenerate Draft
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy to Clipboard
                </>
              )}
            </button>
          </div>
        </div>

        {/* Context section */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white">
          <button
            onClick={() => setContextOpen(!contextOpen)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <span className="text-sm font-semibold text-gray-900">
              Context
            </span>
            {contextOpen ? (
              <ChevronDown size={16} className="text-gray-400" />
            ) : (
              <ChevronRight size={16} className="text-gray-400" />
            )}
          </button>

          {contextOpen && (
            <div className="space-y-4 border-t border-gray-100 px-6 py-4">
              {/* Trigger event */}
              {!!request.context.trigger_details && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Trigger Event
                  </h4>
                  <p className="text-sm text-gray-700">
                    {request.context.trigger_details as string}
                  </p>
                </div>
              )}

              {/* Source data */}
              {contact && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Contact
                  </h4>
                  <p className="text-sm text-gray-700">
                    {contact.name}
                    {contact.title ? ` - ${contact.title}` : ""}
                  </p>
                </div>
              )}

              {company && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Company
                  </h4>
                  <p className="text-sm text-gray-700">
                    {company.name}
                    {company.industry || company.size
                      ? ` (${[company.industry, company.size].filter(Boolean).join(", ")})`
                      : ""}
                  </p>
                </div>
              )}

              {/* AI Prompt */}
              {aiPrompt && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    AI Prompt Used
                  </h4>
                  <p className="text-sm italic text-gray-600">{aiPrompt}</p>
                </div>
              )}

              {/* Fallback: show raw context if no structured data */}
              {!request.context.trigger_details &&
                !contact &&
                !company &&
                !aiPrompt &&
                Object.keys(request.context).length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Raw Context
                    </h4>
                    <pre className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                      {JSON.stringify(request.context, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
