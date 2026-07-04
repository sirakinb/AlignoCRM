"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  MessageSquareQuote,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { Contact, Testimonial, TestimonialRequest } from "@/types/crm";

const NUDGE_AFTER_DAYS = 4;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function contactDisplayName(contact: Contact) {
  const last = contact.last_name === "-" ? "" : contact.last_name ?? "";
  return `${contact.first_name ?? ""} ${last}`.trim() || "Unnamed Contact";
}

function requestLink(token: string) {
  return `${window.location.origin}/t/${token}`;
}

function smsTextFor(request: TestimonialRequest) {
  return `Hey ${firstNameOf(request.client_name)}! Quick favor — could you share a few words about our work together? It's 3 quick questions, takes about 2 minutes: ${requestLink(request.token)}`;
}

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [requests, setRequests] = useState<TestimonialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"wall" | "requests">("wall");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "approved" | "hidden">("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request modal state
  const [showModal, setShowModal] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<TestimonialRequest | null>(null);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/testimonials", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load testimonials");
      }

      setTestimonials((payload.testimonials as Testimonial[]) ?? []);
      setRequests((payload.requests as TestimonialRequest[]) ?? []);
    } catch (err) {
      console.error("Failed to fetch testimonials:", err);
      setError("Failed to load testimonials. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        contactDropdownRef.current &&
        !contactDropdownRef.current.contains(e.target as Node)
      ) {
        setShowContactDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function copyToClipboard(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedKey(null), 1600);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  async function openModal() {
    setShowModal(true);
    setCreateError(null);
    setCreatedRequest(null);
    setSelectedContact(null);
    setContactSearch("");
    setManualName("");
    setManualCompany("");

    if (!contactsLoaded) {
      try {
        const response = await fetch("/api/contacts", { cache: "no-store" });
        const payload = await response.json();
        if (response.ok) {
          setContacts(
            ((payload.contacts as Contact[]) ?? []).filter(
              (c) => c.status === "active"
            )
          );
          setContactsLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load contacts:", err);
      }
    }
  }

  async function handleCreateRequest() {
    const clientName = selectedContact
      ? contactDisplayName(selectedContact)
      : manualName.trim();

    if (!clientName) {
      setCreateError("Pick a contact or enter a name.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/testimonial-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedContact
            ? { contactId: selectedContact.id }
            : { clientName, clientCompany: manualCompany.trim() }
        ),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create request");
      }

      const newRequest = payload.request as TestimonialRequest;
      setRequests((prev) => [newRequest, ...prev]);
      setCreatedRequest(newRequest);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create request"
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleTestimonialStatus(
    testimonial: Testimonial,
    status: Testimonial["status"]
  ) {
    setUpdatingId(testimonial.id);
    try {
      const response = await fetch(`/api/testimonials/${testimonial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to update testimonial");
      }
      setTestimonials((prev) =>
        prev.map((t) => (t.id === testimonial.id ? { ...t, status } : t))
      );
    } catch (err) {
      console.error("Failed to update testimonial:", err);
      alert("Failed to update testimonial. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteTestimonial(testimonial: Testimonial) {
    if (!confirm(`Delete this testimonial from ${testimonial.name}? This cannot be undone.`))
      return;

    setUpdatingId(testimonial.id);
    try {
      const response = await fetch(`/api/testimonials/${testimonial.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to delete testimonial");
      }
      setTestimonials((prev) => prev.filter((t) => t.id !== testimonial.id));
    } catch (err) {
      console.error("Failed to delete testimonial:", err);
      alert("Failed to delete testimonial. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteRequest(request: TestimonialRequest) {
    if (
      !confirm(
        `Delete the request for ${request.client_name}? The link will stop working.`
      )
    )
      return;

    setUpdatingId(request.id);
    try {
      const response = await fetch(`/api/testimonial-requests/${request.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to delete request");
      }
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (err) {
      console.error("Failed to delete request:", err);
      alert("Failed to delete request. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredTestimonials = testimonials.filter(
    (t) => statusFilter === "all" || t.status === statusFilter
  );

  const activeRequests = requests.filter((r) => r.status !== "archived");
  const awaitingCount = activeRequests.filter((r) => r.status === "pending").length;

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase().trim();
    if (!q) return contacts.slice(0, 8);
    return contacts
      .filter(
        (c) =>
          contactDisplayName(c).toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [contacts, contactSearch]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f7f8] p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} strokeWidth={1.8} className="animate-spin text-[#6c2bd9]" />
          <p className="text-[13px] text-zinc-500">Loading testimonials...</p>
        </div>
      </div>
    );
  }

  if (error && testimonials.length === 0 && requests.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f7f8] p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={22} strokeWidth={1.8} className="text-red-500" />
          </div>
          <p className="text-[13px] text-zinc-600">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="mt-2 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f7f7f8] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">
            Testimonials
          </h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            {testimonials.length} collected
            {awaitingCount > 0 && (
              <span className="ml-1 text-zinc-400">
                &middot; {awaitingCount} awaiting reply
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
        >
          <Plus size={15} strokeWidth={1.8} />
          Request Testimonial
        </button>
      </div>

      {/* View toggle + filters */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {(
            [
              { key: "wall", label: `Collected (${testimonials.length})` },
              { key: "requests", label: `Requests (${activeRequests.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === tab.key
                  ? "border border-transparent bg-[#efe7fb] text-[#5b21b6]"
                  : "border border-[#e7e7ea] bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === "wall" && testimonials.length > 0 && (
          <div className="flex gap-1">
            {(["all", "new", "approved", "hidden"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? "border border-transparent bg-[#efe7fb] text-[#5b21b6]"
                    : "border border-[#e7e7ea] bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Wall view */}
      {view === "wall" &&
        (filteredTestimonials.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#dcdce1] bg-white px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4eefc]">
              <MessageSquareQuote size={22} strokeWidth={1.8} className="text-[#6c2bd9]" />
            </div>
            <h2 className="mt-4 text-[15px] font-semibold text-zinc-900">
              {testimonials.length === 0
                ? "No testimonials yet"
                : "Nothing matches this filter"}
            </h2>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-zinc-500">
              {testimonials.length === 0
                ? "Send a personal link to a client you've worked with — their answers land here automatically."
                : "Try a different status filter."}
            </p>
            {testimonials.length === 0 && (
              <button
                onClick={openModal}
                className="mt-5 flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
              >
                <Plus size={15} strokeWidth={1.8} />
                Request Testimonial
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTestimonials.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(17,17,26,0.05)] transition-opacity ${
                  t.status === "hidden"
                    ? "border-[#e7e7ea] opacity-60"
                    : "border-[#e7e7ea]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      t.status === "approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : t.status === "hidden"
                          ? "bg-zinc-100 text-zinc-500"
                          : "bg-[#f4eefc] text-[#5b21b6]"
                    }`}
                  >
                    {t.status}
                  </span>
                  <span className="text-[11.5px] text-zinc-400">
                    {formatDate(t.created_at)}
                  </span>
                </div>

                <blockquote className="mt-3 flex-1 text-[14px] leading-relaxed text-zinc-800">
                  &ldquo;{t.result}&rdquo;
                </blockquote>

                <details className="mt-3 group">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-zinc-400 transition-colors hover:text-zinc-600 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      size={13}
                      className="transition-transform group-open:rotate-180"
                    />
                    Full answers
                  </summary>
                  <div className="mt-2 space-y-2.5 rounded-lg bg-[#fafafa] p-3 text-[12.5px] leading-relaxed text-zinc-600">
                    <div>
                      <p className="font-medium text-zinc-500">What we helped with</p>
                      <p className="mt-0.5">{t.problem}</p>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-500">Working together</p>
                      <p className="mt-0.5">{t.solution}</p>
                    </div>
                  </div>
                </details>

                <div className="mt-4 border-t border-[#f0f0f2] pt-3">
                  <p className="text-[13px] font-semibold text-zinc-900">{t.name}</p>
                  <p className="text-[12px] text-zinc-500">
                    {[t.role, t.company].filter(Boolean).join(" · ") || "—"}
                    {!t.permission && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700">
                        keep anonymous
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-1">
                  {t.status !== "approved" ? (
                    <button
                      onClick={() => handleTestimonialStatus(t, "approved")}
                      disabled={updatingId === t.id}
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <Check size={13} strokeWidth={2} />
                      Approve
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTestimonialStatus(t, "new")}
                      disabled={updatingId === t.id}
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] disabled:opacity-50"
                    >
                      <X size={13} strokeWidth={2} />
                      Unapprove
                    </button>
                  )}
                  {t.status !== "hidden" ? (
                    <button
                      onClick={() => handleTestimonialStatus(t, "hidden")}
                      disabled={updatingId === t.id}
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] disabled:opacity-50"
                    >
                      <EyeOff size={13} strokeWidth={1.8} />
                      Hide
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTestimonialStatus(t, "new")}
                      disabled={updatingId === t.id}
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] disabled:opacity-50"
                    >
                      <Eye size={13} strokeWidth={1.8} />
                      Unhide
                    </button>
                  )}
                  <button
                    onClick={() => copyToClipboard(`quote-${t.id}`, `"${t.result}" — ${t.name}${t.company ? `, ${t.company}` : ""}`)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045]"
                  >
                    {copiedKey === `quote-${t.id}` ? (
                      <>
                        <Check size={13} strokeWidth={2} className="text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={13} strokeWidth={1.8} />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteTestimonial(t)}
                    disabled={updatingId === t.id}
                    className="ml-auto flex items-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Delete testimonial"
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Requests view */}
      {view === "requests" &&
        (activeRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#dcdce1] bg-white px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4eefc]">
              <Send size={20} strokeWidth={1.8} className="text-[#6c2bd9]" />
            </div>
            <h2 className="mt-4 text-[15px] font-semibold text-zinc-900">
              No requests yet
            </h2>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-zinc-500">
              Create a personal link for a client, then text or email it to them.
            </p>
            <button
              onClick={openModal}
              className="mt-5 flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
            >
              <Plus size={15} strokeWidth={1.8} />
              Request Testimonial
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e7e7ea] bg-white shadow-[0_1px_2px_rgba(17,17,26,0.05)]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#e7e7ea] bg-[#fafafa]">
                  <th className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
                    Client
                  </th>
                  <th className="hidden px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500 sm:table-cell">
                    Sent
                  </th>
                  <th className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeRequests.map((r) => {
                  const needsNudge =
                    r.status === "pending" && daysSince(r.created_at) >= NUDGE_AFTER_DAYS;

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[#f0f0f2] last:border-b-0 hover:bg-[#fafafa]"
                    >
                      <td className="px-4 py-3">
                        <p className="text-[13.5px] font-medium text-zinc-900">
                          {r.client_name}
                        </p>
                        {r.client_company && (
                          <p className="text-[12px] text-zinc-500">{r.client_company}</p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-[12.5px] text-zinc-500 sm:table-cell">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              r.status === "completed"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-[#f4eefc] text-[#5b21b6]"
                            }`}
                          >
                            {r.status === "completed" ? "Received" : "Awaiting"}
                          </span>
                          {needsNudge && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              Nudge?
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyToClipboard(`link-${r.id}`, requestLink(r.token))}
                            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] hover:text-zinc-800"
                          >
                            {copiedKey === `link-${r.id}` ? (
                              <>
                                <Check size={13} strokeWidth={2} className="text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Link2 size={13} strokeWidth={1.8} />
                                Copy link
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(`sms-${r.id}`, smsTextFor(r))}
                            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] hover:text-zinc-800"
                          >
                            {copiedKey === `sms-${r.id}` ? (
                              <>
                                <Check size={13} strokeWidth={2} className="text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy size={13} strokeWidth={1.8} />
                                Copy message
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteRequest(r)}
                            disabled={updatingId === r.id}
                            className="flex items-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            aria-label="Delete request"
                          >
                            <Trash2 size={13} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {/* Request modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#e7e7ea] bg-white p-6 shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-zinc-900">
                  {createdRequest ? "Link ready to send" : "Request a testimonial"}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">
                  {createdRequest
                    ? "Copy it into a text or email — the form is pre-filled for them."
                    : "Create a personal link for a client."}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-black/[0.045] hover:text-zinc-700"
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>

            {!createdRequest ? (
              <div className="mt-5 space-y-4">
                <div ref={contactDropdownRef} className="relative">
                  <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                    Contact
                  </label>
                  {selectedContact ? (
                    <div className="flex items-center justify-between rounded-lg border border-[#e3d5f8] bg-[#f4eefc] px-3 py-2">
                      <div>
                        <p className="text-[13.5px] font-medium text-zinc-900">
                          {contactDisplayName(selectedContact)}
                        </p>
                        {selectedContact.company && (
                          <p className="text-[12px] text-zinc-500">
                            {selectedContact.company}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedContact(null)}
                        className="rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700"
                        aria-label="Clear contact"
                      >
                        <X size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search
                          size={14}
                          strokeWidth={1.8}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                        />
                        <input
                          value={contactSearch}
                          onChange={(e) => {
                            setContactSearch(e.target.value);
                            setShowContactDropdown(true);
                          }}
                          onFocus={() => setShowContactDropdown(true)}
                          placeholder={
                            contactsLoaded && contacts.length === 0
                              ? "No contacts yet — enter a name below"
                              : "Search contacts…"
                          }
                          className="w-full rounded-lg border border-[#e7e7ea] bg-white py-2 pl-9 pr-3 text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:outline-none"
                        />
                      </div>
                      {showContactDropdown && filteredContacts.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#e7e7ea] bg-white shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)]">
                          {filteredContacts.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedContact(c);
                                setShowContactDropdown(false);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[#fafafa]"
                            >
                              <span className="text-[13px] font-medium text-zinc-800">
                                {contactDisplayName(c)}
                              </span>
                              {c.company && (
                                <span className="text-[11.5px] text-zinc-400">
                                  {c.company}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {!selectedContact && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-[#ececef]" />
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                        or enter manually
                      </span>
                      <div className="h-px flex-1 bg-[#ececef]" />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                          Client name
                        </label>
                        <input
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder="Jane Smith"
                          className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                          Company <span className="text-zinc-400">(optional)</span>
                        </label>
                        <input
                          value={manualCompany}
                          onChange={(e) => setManualCompany(e.target.value)}
                          placeholder="Acme Inc."
                          className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {createError && (
                  <p className="text-[12.5px] text-red-600">{createError}</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowModal(false)}
                    className="rounded-lg border border-[#e7e7ea] bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateRequest}
                    disabled={creating}
                    className="flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:opacity-60"
                  >
                    {creating && <Loader2 size={14} className="animate-spin" />}
                    Create link
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                    Personal link for {createdRequest.client_name}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={requestLink(createdRequest.token)}
                      onFocus={(e) => e.target.select()}
                      className="w-full rounded-lg border border-[#e7e7ea] bg-[#fafafa] px-3 py-2 text-[12.5px] text-zinc-700 focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        copyToClipboard("modal-link", requestLink(createdRequest.token))
                      }
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
                    >
                      {copiedKey === "modal-link" ? (
                        <Check size={13} strokeWidth={2} />
                      ) : (
                        <Link2 size={13} strokeWidth={1.8} />
                      )}
                      {copiedKey === "modal-link" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                    Ready-to-send message
                  </label>
                  <div className="rounded-lg border border-[#e7e7ea] bg-[#fafafa] p-3 text-[13px] leading-relaxed text-zinc-700">
                    {smsTextFor(createdRequest)}
                  </div>
                  <button
                    onClick={() => copyToClipboard("modal-sms", smsTextFor(createdRequest))}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[12.5px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    {copiedKey === "modal-sms" ? (
                      <>
                        <Check size={13} strokeWidth={2} className="text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={13} strokeWidth={1.8} />
                        Copy message
                      </>
                    )}
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => setShowModal(false)}
                    className="rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
