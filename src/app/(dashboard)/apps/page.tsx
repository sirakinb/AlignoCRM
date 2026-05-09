"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getPurpleScaleColor,
  withAlpha,
} from "@/lib/design/aligno-theme";
import {
  Plus,
  X,
  Loader2,
  AlertCircle,
  Blocks,
  ExternalLink,
  Globe,
  Pencil,
  Trash2,
  ArrowLeft,
  DollarSign,
  Users,
  TrendingUp,
  UserPlus,
  UserMinus,
  Search,
  Mail,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { App } from "@/types/crm";

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
  updated_at: string;
}

interface SubscriberStats {
  total: number;
  active: number;
  mrr: number;
  monthly_count: number;
  yearly_count: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchApps(): Promise<App[]> {
  const res = await fetch("/api/apps");
  if (!res.ok) throw new Error("Failed to load apps");
  const json = await res.json();
  return json.apps;
}

async function apiCreateApp(input: {
  name: string;
  slug: string;
  description?: string;
  url?: string;
  icon_url?: string;
}): Promise<App> {
  const res = await fetch("/api/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to create app");
  const json = await res.json();
  return json.app;
}

async function apiUpdateApp(
  id: string,
  fields: Record<string, unknown>
): Promise<App> {
  const res = await fetch("/api/apps", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...fields }),
  });
  if (!res.ok) throw new Error("Failed to update app");
  const json = await res.json();
  return json.app;
}

async function apiDeleteApp(id: string): Promise<void> {
  const res = await fetch(`/api/apps?id=${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete app");
}

async function fetchSubscribers(
  search?: string
): Promise<{ subscribers: Subscriber[]; stats: SubscriberStats }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const res = await fetch(`/api/subscribers?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load subscribers");
  return res.json();
}

async function apiManageSubscription(body: {
  action: "comp" | "revoke";
  email: string;
  tier?: string;
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
// Slug helper
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Add / Edit App Modal (unchanged)
// ---------------------------------------------------------------------------

interface AppModalProps {
  app: App | null;
  open: boolean;
  onClose: () => void;
  onSaved: (app: App) => void;
}

function AppModal({ app, open, onClose, onSaved }: AppModalProps) {
  const isEdit = !!app;
  const [name, setName] = useState(app?.name ?? "");
  const [slug, setSlug] = useState(app?.slug ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [url, setUrl] = useState(app?.url ?? "");
  const [iconUrl, setIconUrl] = useState(app?.icon_url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSlug, setAutoSlug] = useState(!isEdit);

  useEffect(() => {
    if (app) {
      setName(app.name);
      setSlug(app.slug);
      setDescription(app.description ?? "");
      setUrl(app.url ?? "");
      setIconUrl(app.icon_url ?? "");
      setAutoSlug(false);
    } else {
      setName("");
      setSlug("");
      setDescription("");
      setUrl("");
      setIconUrl("");
      setAutoSlug(true);
    }
    setError(null);
  }, [app, open]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) setSlug(toSlug(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("App name is required"); return; }
    if (!slug.trim()) { setError("Slug is required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit
        ? await apiUpdateApp(app.id, { name: name.trim(), slug: slug.trim(), description: description.trim() || null, url: url.trim() || null, icon_url: iconUrl.trim() || null })
        : await apiCreateApp({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined, url: url.trim() || undefined, icon_url: iconUrl.trim() || undefined });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save app");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? "Edit App" : "Add App"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle size={16} className="shrink-0" />{error}</div>}
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">App Name <span className="text-red-500">*</span></label><input type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. DropCard" className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors" autoFocus /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Slug <span className="text-red-500">*</span></label><input type="text" value={slug} onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }} placeholder="e.g. dropcard" className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">App URL</label><div className="relative"><Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://myapp.com" className="w-full rounded-lg border border-gray-300 pl-9 pr-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors" /></div></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Icon URL</label><input type="url" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} placeholder="https://example.com/icon.png" className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors" /></div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5b24b8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {submitting ? (<><Loader2 size={16} className="animate-spin" />Saving...</>) : isEdit ? "Save Changes" : (<><Plus size={16} />Add App</>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comp Access Modal
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
            <p className="mt-1.5 text-xs text-[#8D88A0]">Grants complimentary Pentridge Labs access (standard tier).</p>
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
// App Card (with subscriber count)
// ---------------------------------------------------------------------------

function AppCard({
  app,
  index,
  subscriberCount,
  onEdit,
  onDelete,
  onSelect,
}: {
  app: App;
  index: number;
  subscriberCount: number;
  onEdit: (app: App) => void;
  onDelete: (id: string) => void;
  onSelect: (app: App) => void;
}) {
  const accent = getPurpleScaleColor(index % 6);

  return (
    <div
      className="aligno-panel group cursor-pointer rounded-xl p-5 transition-shadow hover:shadow-lg"
      style={{ borderColor: withAlpha(accent, 0.2) }}
      onClick={() => onSelect(app)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {app.icon_url ? (
            <img src={app.icon_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold" style={{ backgroundColor: withAlpha(accent, 0.14), color: accent }}>
              {app.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-[#21173A]">{app.name}</h3>
            {app.description && <p className="mt-0.5 text-xs text-[#6B6481] line-clamp-1">{app.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); onEdit(app); }} className="rounded p-1.5 hover:bg-white/70" style={{ color: withAlpha(accent, 0.6) }} title="Edit app"><Pencil size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${app.name}"?`)) onDelete(app.id); }} className="rounded p-1.5 hover:bg-white/70" style={{ color: withAlpha(accent, 0.6) }} title="Delete app"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {app.url && (
            <a href={app.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs font-medium transition-colors hover:underline" style={{ color: accent }}>
              <ExternalLink size={12} />Visit
            </a>
          )}
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: withAlpha(app.status === "active" ? "#22c55e" : "#9ca3af", 0.14), color: app.status === "active" ? "#16a34a" : "#6b7280" }}>
            {app.status}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-[#6B6481]">
          <Users size={12} />
          <span className="font-medium">{subscriberCount}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Detail View (with revenue, users, actions)
// ---------------------------------------------------------------------------

function AppDetail({
  app,
  onBack,
}: {
  app: App;
  onBack: () => void;
}) {
  const accent = getPurpleScaleColor(2);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<SubscriberStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [compOpen, setCompOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadSubscribers = useCallback(async () => {
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
    setLoading(true);
    const timer = setTimeout(loadSubscribers, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadSubscribers, search]);

  const handleRevoke = async (email: string) => {
    if (!window.confirm(`Revoke access for ${email}?`)) return;
    setActionLoading(email);
    try {
      await apiManageSubscription({ action: "revoke", email });
      await loadSubscribers();
    } catch (err) {
      console.error("Failed to revoke:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleComp = async (email: string) => {
    setActionLoading(email);
    try {
      await apiManageSubscription({ action: "comp", email });
      await loadSubscribers();
    } catch (err) {
      console.error("Failed to reactivate:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const kpiCards = [
    { label: "Active Subscribers", value: stats?.active ?? 0, icon: Users, accent: getPurpleScaleColor(4) },
    { label: "MRR", value: `$${stats?.mrr?.toFixed(0) ?? 0}`, icon: DollarSign, accent: getPurpleScaleColor(5) },
    { label: "Monthly", value: stats?.monthly_count ?? 0, icon: TrendingUp, accent: getPurpleScaleColor(3) },
    { label: "Yearly", value: stats?.yearly_count ?? 0, icon: TrendingUp, accent: getPurpleScaleColor(1) },
  ];

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-[#6B6481] hover:text-[#21173A] transition-colors">
        <ArrowLeft size={16} />Back to Apps
      </button>

      {/* App header */}
      <div className="aligno-panel rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {app.icon_url ? (
              <img src={app.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold" style={{ backgroundColor: withAlpha(accent, 0.14), color: accent }}>
                {app.name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-[#21173A]">{app.name}</h2>
              {app.description && <p className="mt-1 text-sm text-[#6B6481]">{app.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {app.url && (
              <a href={app.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-[#E6DCF9] px-3 py-2 text-sm font-medium text-[#6B6481] hover:bg-[#F5EEFF] transition-colors">
                <ExternalLink size={14} />Visit App
              </a>
            )}
            <button onClick={() => setCompOpen(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors" style={{ background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(5)})` }}>
              <UserPlus size={14} />Grant Access
            </button>
          </div>
        </div>
      </div>

      {/* Revenue KPIs */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {kpiCards.map((card) => {
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

      {/* Subscribers table */}
      <div className="aligno-panel rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#3B2E56]">Subscribers</h3>
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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#8A5DDE]" />
          </div>
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
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        {sub.status === "active" ? (
                          <button
                            onClick={() => handleRevoke(sub.email)}
                            disabled={actionLoading === sub.email}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Revoke access"
                          >
                            {actionLoading === sub.email ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                            Revoke
                          </button>
                        ) : (
                          <button
                            onClick={() => handleComp(sub.email)}
                            disabled={actionLoading === sub.email}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-[#F5EEFF] transition-colors disabled:opacity-50"
                            style={{ color: accent }}
                            title="Reactivate access"
                          >
                            {actionLoading === sub.email ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CompModal open={compOpen} onClose={() => setCompOpen(false)} onDone={loadSubscribers} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apps Page
// ---------------------------------------------------------------------------

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [subscriberStats, setSubscriberStats] = useState<SubscriberStats | null>(null);

  useEffect(() => {
    Promise.all([fetchApps(), fetchSubscribers()])
      .then(([appList, subData]) => {
        setApps(appList);
        setSubscriberStats(subData.stats);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = useCallback((saved: App) => {
    setApps((prev) => {
      const exists = prev.find((a) => a.id === saved.id);
      if (exists) return prev.map((a) => (a.id === saved.id ? saved : a));
      return [saved, ...prev];
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await apiDeleteApp(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
      setSelectedApp((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      console.error("Failed to delete app:", err);
    }
  }, []);

  if (loading) {
    return (
      <div className="aligno-page-surface flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#8A5DDE]" />
          <p className="text-sm text-[#6B6481]">Loading apps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aligno-page-surface flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-red-50 p-3"><AlertCircle size={24} className="text-red-500" /></div>
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]">Retry</button>
      </div>
    );
  }

  return (
    <div className="aligno-page-surface min-h-full p-6">
      {selectedApp ? (
        <AppDetail app={selectedApp} onBack={() => setSelectedApp(null)} />
      ) : (
        <>
          {/* Header with global stats */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#21173A]">Apps</h1>
              <p className="mt-1 text-sm text-[#6B6481]">
                {subscriberStats
                  ? `${subscriberStats.active} active subscriber${subscriberStats.active !== 1 ? "s" : ""} · $${subscriberStats.mrr?.toFixed(0)} MRR`
                  : "Manage your Pentridge Labs apps"}
              </p>
            </div>
            <button
              onClick={() => { setEditingApp(null); setModalOpen(true); }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
              style={{ background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(5)})` }}
            >
              <Plus size={16} />Add App
            </button>
          </div>

          {apps.length === 0 ? (
            <div className="aligno-panel rounded-xl border-dashed p-12">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-[#F1E8FF] p-4"><Blocks className="h-8 w-8 text-[#8A5DDE]" /></div>
                <h2 className="text-lg font-semibold text-[#21173A]">No apps yet</h2>
                <p className="mt-2 max-w-sm text-sm text-[#6B6481]">Add your Pentridge Labs apps to manage them from one place.</p>
                <button onClick={() => { setEditingApp(null); setModalOpen(true); }} className="mt-4 flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"><Plus size={16} />Add Your First App</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app, i) => (
                <AppCard
                  key={app.id}
                  app={app}
                  index={i}
                  subscriberCount={subscriberStats?.active ?? 0}
                  onEdit={(a) => { setEditingApp(a); setModalOpen(true); }}
                  onDelete={handleDelete}
                  onSelect={setSelectedApp}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AppModal app={editingApp} open={modalOpen} onClose={() => { setModalOpen(false); setEditingApp(null); }} onSaved={handleSaved} />
    </div>
  );
}
