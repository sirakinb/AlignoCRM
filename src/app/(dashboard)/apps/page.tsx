"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import type { App } from "@/types/crm";

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
// Add / Edit App Modal
// ---------------------------------------------------------------------------

interface AppModalProps {
  app: App | null; // null = create mode
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
    if (!name.trim()) {
      setError("App name is required");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const saved = isEdit
        ? await apiUpdateApp(app.id, {
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || null,
            url: url.trim() || null,
            icon_url: iconUrl.trim() || null,
          })
        : await apiCreateApp({
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            url: url.trim() || undefined,
            icon_url: iconUrl.trim() || undefined,
          });
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
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit App" : "Add App"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              App Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. DropCard"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setAutoSlug(false);
              }}
              placeholder="e.g. dropcard"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the app"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              App URL
            </label>
            <div className="relative">
              <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://myapp.com"
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Icon URL
            </label>
            <input
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/icon.png"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5b24b8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                "Save Changes"
              ) : (
                <>
                  <Plus size={16} />
                  Add App
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Card
// ---------------------------------------------------------------------------

function AppCard({
  app,
  index,
  onEdit,
  onDelete,
  onSelect,
}: {
  app: App;
  index: number;
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
            <img
              src={app.icon_url}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold"
              style={{
                backgroundColor: withAlpha(accent, 0.14),
                color: accent,
              }}
            >
              {app.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-[#21173A]">{app.name}</h3>
            {app.description && (
              <p className="mt-0.5 text-xs text-[#6B6481] line-clamp-1">
                {app.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(app);
            }}
            className="rounded p-1.5 hover:bg-white/70"
            style={{ color: withAlpha(accent, 0.6) }}
            title="Edit app"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${app.name}"?`)) onDelete(app.id);
            }}
            className="rounded p-1.5 hover:bg-white/70"
            style={{ color: withAlpha(accent, 0.6) }}
            title="Delete app"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
            style={{ color: accent }}
          >
            <ExternalLink size={12} />
            Visit
          </a>
        )}
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: withAlpha(
              app.status === "active" ? "#22c55e" : "#9ca3af",
              0.14
            ),
            color: app.status === "active" ? "#16a34a" : "#6b7280",
          }}
        >
          {app.status}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Detail View
// ---------------------------------------------------------------------------

function AppDetail({
  app,
  onBack,
}: {
  app: App;
  onBack: () => void;
}) {
  const accent = getPurpleScaleColor(2);

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-[#6B6481] hover:text-[#21173A] transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Apps
      </button>

      <div className="aligno-panel rounded-xl p-6">
        <div className="flex items-center gap-4">
          {app.icon_url ? (
            <img
              src={app.icon_url}
              alt=""
              className="h-14 w-14 rounded-xl object-cover"
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold"
              style={{
                backgroundColor: withAlpha(accent, 0.14),
                color: accent,
              }}
            >
              {app.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-[#21173A]">{app.name}</h2>
            {app.description && (
              <p className="mt-1 text-sm text-[#6B6481]">{app.description}</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="aligno-panel-soft rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#7B7590]">
              Status
            </p>
            <p className="mt-1 text-sm font-semibold text-[#21173A] capitalize">
              {app.status}
            </p>
          </div>
          <div className="aligno-panel-soft rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#7B7590]">
              Slug
            </p>
            <p className="mt-1 text-sm font-semibold text-[#21173A]">
              {app.slug}
            </p>
          </div>
          <div className="aligno-panel-soft rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#7B7590]">
              URL
            </p>
            {app.url ? (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-sm font-semibold transition-colors hover:underline"
                style={{ color: accent }}
              >
                {new URL(app.url).hostname}
                <ExternalLink size={12} />
              </a>
            ) : (
              <p className="mt-1 text-sm text-[#8D88A0]">Not set</p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[#7B7590]">
            Added
          </p>
          <p className="mt-1 text-sm text-[#6B6481]">
            {new Date(app.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
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

  useEffect(() => {
    fetchApps()
      .then(setApps)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load apps")
      )
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
        <div className="rounded-full bg-red-50 p-3">
          <AlertCircle size={24} className="text-red-500" />
        </div>
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="aligno-page-surface min-h-full p-6">
      {selectedApp ? (
        <AppDetail
          app={selectedApp}
          onBack={() => setSelectedApp(null)}
        />
      ) : (
        <>
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#21173A]">Apps</h1>
              <p className="mt-1 text-sm text-[#6B6481]">
                Manage your Pentridge Labs apps
              </p>
            </div>
            <button
              onClick={() => {
                setEditingApp(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(5)})`,
              }}
            >
              <Plus size={16} />
              Add App
            </button>
          </div>

          {/* Apps Grid */}
          {apps.length === 0 ? (
            <div className="aligno-panel rounded-xl border-dashed p-12">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-[#F1E8FF] p-4">
                  <Blocks className="h-8 w-8 text-[#8A5DDE]" />
                </div>
                <h2 className="text-lg font-semibold text-[#21173A]">
                  No apps yet
                </h2>
                <p className="mt-2 max-w-sm text-sm text-[#6B6481]">
                  Add your Pentridge Labs apps to manage them from one place.
                </p>
                <button
                  onClick={() => {
                    setEditingApp(null);
                    setModalOpen(true);
                  }}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"
                >
                  <Plus size={16} />
                  Add Your First App
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app, i) => (
                <AppCard
                  key={app.id}
                  app={app}
                  index={i}
                  onEdit={(a) => {
                    setEditingApp(a);
                    setModalOpen(true);
                  }}
                  onDelete={handleDelete}
                  onSelect={setSelectedApp}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AppModal
        app={editingApp}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingApp(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}
