"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPurpleScaleColor,
  withAlpha,
} from "@/lib/design/aligno-theme";
import {
  Loader2,
  UserPlus,
  UserMinus,
  Users,
  DollarSign,
  Search,
  CheckCircle,
  XCircle,
  Mail,
  X,
  AlertCircle,
  Shield,
  Copy,
  Check,
} from "lucide-react";
import { useServerUser } from "@/components/auth/server-auth-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subscriber {
  id: string;
  email: string;
  tier: string;
  billing_period: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  active: number;
  mrr: number;
  monthly_count: number;
  yearly_count: number;
}

// ---------------------------------------------------------------------------
// Admin-only emails
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = new Set([
  "aki.b@pentridgemedia.com",
  "sirakinb@gmail.com",
]);

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchSubscribers(search?: string): Promise<{ subscribers: Subscriber[]; stats: Stats }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const res = await fetch(`/api/subscribers?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load subscribers");
  return res.json();
}

async function apiManageSubscription(body: {
  action: "comp" | "revoke";
  email: string;
}): Promise<{ success: boolean }> {
  const res = await fetch("/api/subscribers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed");
  return data;
}

// ---------------------------------------------------------------------------
// Comp Modal
// ---------------------------------------------------------------------------

function CompModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) { setEmail(""); setError(null); setSuccess(false); }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiManageSubscription({ action: "comp", email: email.trim() });
      setSuccess(true);
      setTimeout(() => { onDone(); onClose(); }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Grant Access</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle size={16} className="shrink-0" />{error}</div>}
          {success && <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"><CheckCircle size={16} className="shrink-0" />Access granted!</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className="w-full rounded-lg border border-gray-300 pl-9 pr-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors" autoFocus />
            </div>
            <p className="mt-1.5 text-xs text-[#8D88A0]">Grants complimentary Pentridge Labs access (standard tier). They can sign into any Pentridge Labs app immediately.</p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting || success} className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5b24b8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {submitting ? <><Loader2 size={16} className="animate-spin" />Granting...</> : <><UserPlus size={16} />Grant Access</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { user } = useServerUser();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [compOpen, setCompOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = user?.email && ADMIN_EMAILS.has(user.email.toLowerCase());

  const loadData = useCallback(async () => {
    try {
      const data = await fetchSubscribers(search || undefined);
      setSubscribers(data.subscribers);
      setStats(data.stats);
    } catch (err) {
      console.error("Failed to load subscribers:", err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(loadData, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadData, search, isAdmin]);

  const handleRevoke = async (email: string) => {
    if (!window.confirm(`Revoke access for ${email}?`)) return;
    setActionLoading(email);
    try {
      await apiManageSubscription({ action: "revoke", email });
      await loadData();
    } catch (err) {
      console.error("Failed to revoke:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (email: string) => {
    setActionLoading(email);
    try {
      await apiManageSubscription({ action: "comp", email });
      await loadData();
    } catch (err) {
      console.error("Failed to reactivate:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const copyPromoLink = () => {
    navigator.clipboard.writeText("https://pentridgemedia.com/labs — use code LAUNCH for free access");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const accent = getPurpleScaleColor(4);

  if (!isAdmin) {
    return (
      <div className="aligno-page-surface flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-red-50 p-3"><Shield size={24} className="text-red-500" /></div>
        <p className="text-sm font-medium text-[#21173A]">Admin access required</p>
        <p className="text-sm text-[#6B6481]">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="aligno-page-surface min-h-full p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#21173A]">Admin</h1>
          <p className="mt-1 text-sm text-[#6B6481]">Manage Pentridge Labs subscribers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyPromoLink}
            className="flex items-center gap-1.5 rounded-lg border border-[#E6DCF9] px-3 py-2 text-sm font-medium text-[#6B6481] hover:bg-[#F5EEFF] transition-colors"
          >
            {copied ? <><Check size={14} className="text-green-500" />Copied!</> : <><Copy size={14} />Promo Link</>}
          </button>
          <button
            onClick={() => setCompOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(5)})` }}
          >
            <UserPlus size={14} />Grant Access
          </button>
        </div>
      </div>

      {/* Promo code card */}
      <div className="mb-6 aligno-panel rounded-xl p-4" style={{ borderColor: withAlpha(accent, 0.2) }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#21173A]">Promo Code: <span className="font-mono font-bold" style={{ color: accent }}>LAUNCH</span></p>
            <p className="mt-0.5 text-xs text-[#6B6481]">100% off — free access via pentridgemedia.com/labs. Share with users who want to sign up themselves.</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: Users, accent: getPurpleScaleColor(4) },
            { label: "Active", value: stats.active, icon: CheckCircle, accent: getPurpleScaleColor(5) },
            { label: "MRR", value: `$${stats.mrr.toFixed(0)}`, icon: DollarSign, accent: getPurpleScaleColor(3) },
            { label: "Monthly / Yearly", value: `${stats.monthly_count} / ${stats.yearly_count}`, icon: Users, accent: getPurpleScaleColor(1) },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="aligno-panel rounded-xl p-4" style={{ borderColor: withAlpha(card.accent, 0.24) }}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: withAlpha(card.accent, 0.14) }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: card.accent }} />
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#7B7590]">{card.label}</p>
                </div>
                <p className="mt-2 text-xl font-bold" style={{ color: card.accent }}>{card.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Subscriber table */}
      <div className="aligno-panel rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#3B2E56]">All Subscribers</h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email..."
              className="w-64 rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#8A5DDE]" /></div>
        ) : subscribers.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Users className="mb-2 h-8 w-8 text-[#C4B5D9]" />
            <p className="text-sm text-[#8D88A0]">{search ? "No subscribers match your search" : "No subscribers yet"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6DCF9]">
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Email</th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Tier</th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Billing</th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Status</th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Renews</th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Joined</th>
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => (
                  <tr key={sub.id} className="border-b border-[#F3EDF9] last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium" style={{ backgroundColor: withAlpha(accent, 0.12), color: accent }}>
                          {sub.email[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-[#21173A]">{sub.email}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 capitalize text-[#6B6481]">{sub.tier}</td>
                    <td className="py-3 pr-4 capitalize text-[#6B6481]">{sub.billing_period}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: withAlpha(sub.status === "active" ? "#22c55e" : "#ef4444", 0.12), color: sub.status === "active" ? "#16a34a" : "#dc2626" }}>
                        {sub.status === "active" ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[#6B6481]">
                      {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#6B6481]">
                      {new Date(sub.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="py-3">
                      {sub.status === "active" ? (
                        <button
                          onClick={() => handleRevoke(sub.email)}
                          disabled={actionLoading === sub.email}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === sub.email ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                          Revoke
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(sub.email)}
                          disabled={actionLoading === sub.email}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-[#F5EEFF] transition-colors disabled:opacity-50"
                          style={{ color: accent }}
                        >
                          {actionLoading === sub.email ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CompModal open={compOpen} onClose={() => setCompOpen(false)} onDone={loadData} />
    </div>
  );
}
