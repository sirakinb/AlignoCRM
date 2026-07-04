"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@insforge/nextjs";
import { useServerUser } from "@/components/auth/server-auth-context";
import {
  Camera,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";

interface UserApiKey {
  id: string;
  name: string;
  maskedKey: string;
  key?: string;
  createdAt: string;
  lastUsedAt: string | null;
}

// Team invites are still in progress — hide the Organization section from
// clients for now. Flip to true to restore it.
const SHOW_ORGANIZATION_SECTION = false;

interface OrganizationMember {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "removed";
}

interface OrganizationPayload {
  organization: { id: string; name: string } | null;
  members: OrganizationMember[];
  role: "owner" | "admin" | "member" | null;
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      console.warn("[Settings] Clipboard API copy failed:", error);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch (error) {
    console.warn("[Settings] Fallback copy failed:", error);
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { user: serverUser, refreshUser } = useServerUser();

  const mergedProfile = {
    ...(((user?.profile as Record<string, unknown> | null) ?? {})),
    ...(((serverUser?.profile as Record<string, unknown> | null) ?? {})),
  };
  const effectiveUser = serverUser || user;
  const userEmail = effectiveUser?.email || "";
  const userProfile = mergedProfile;

  const [name, setName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarInitialized, setAvatarInitialized] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [apiKey, setApiKey] = useState<UserApiKey | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [apiKeyWorking, setApiKeyWorking] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [organization, setOrganization] = useState<OrganizationPayload | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [savingBusinessName, setSavingBusinessName] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteWorking, setInviteWorking] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;

    async function loadSettingsData() {
      try {
        const [apiKeyResponse, organizationResponse] = await Promise.all([
          fetch("/api/settings/api-key", { cache: "no-store" }),
          fetch("/api/organizations/current", { cache: "no-store" }),
        ]);
        const apiKeyData = await apiKeyResponse.json();
        const organizationData = await organizationResponse.json();

        if (!ignore && apiKeyResponse.ok) {
          setApiKey(apiKeyData.apiKey ?? null);
        }
        if (!ignore && organizationResponse.ok) {
          const payload = organizationData as OrganizationPayload;
          setOrganization(payload);
          setBusinessName(payload.organization?.name ?? "");
        }
      } catch (err) {
        console.error("[Settings] Failed to load settings data:", err);
      } finally {
        if (!ignore) {
          setApiKeyLoading(false);
          setOrganizationLoading(false);
        }
      }
    }

    loadSettingsData();

    return () => {
      ignore = true;
    };
  }, []);

  if (!isLoaded && !serverUser) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 rounded bg-zinc-200" />
          <div className="h-4 w-48 rounded bg-zinc-200" />
          <div className="mt-8 h-16 w-16 rounded-full bg-zinc-200" />
          <div className="h-10 w-full rounded bg-zinc-200" />
          <div className="h-10 w-full rounded bg-zinc-200" />
        </div>
      </div>
    );
  }

  // Initialize from profile once loaded
  if (effectiveUser && !nameInitialized) {
    setName((userProfile?.name as string) || "");
    setNameInitialized(true);
  }
  if (effectiveUser && !avatarInitialized) {
    setAvatarUrl((userProfile?.avatar_url as string) || null);
    setAvatarInitialized(true);
  }

  const displayName = (userProfile?.name as string) || userEmail || "User";
  const avatarSrc = avatarUrl
    ? `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}ui=settings`
    : null;
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { ...userProfile, name: name.trim() },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = "Failed to update profile";
        try {
          const data = JSON.parse(text);
          errorMsg = data.error || errorMsg;
        } catch {
          if (text) errorMsg = text;
        }
        throw new Error(errorMsg);
      }

      setMessage({ type: "success", text: "Profile updated" });
      await refreshUser();
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update profile" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select an image file" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image must be under 5MB" });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setAvatarUrl(data.avatarUrl as string);
      setAvatarError(false);
      setMessage({ type: "success", text: "Avatar updated" });
      await refreshUser();
      router.refresh();
    } catch (err) {
      console.error("[Settings] Avatar upload error:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCreateApiKey() {
    setApiKeyWorking(true);
    setApiKeyCopied(false);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Default API key" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create API key");
      }

      setApiKey(data.apiKey);
      setMessage({ type: "success", text: "API key created" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create API key" });
    } finally {
      setApiKeyWorking(false);
    }
  }

  async function handleRevokeApiKey() {
    if (!confirm("Revoke this API key? Connected apps using it will stop working.")) return;

    setApiKeyWorking(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/api-key", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke API key");
      }

      setApiKey(null);
      setApiKeyCopied(false);
      setMessage({ type: "success", text: "API key revoked" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to revoke API key" });
    } finally {
      setApiKeyWorking(false);
    }
  }

  async function handleCopyApiKey() {
    const value = apiKey?.key;
    if (!value) return;

    const copied = await copyTextToClipboard(value);

    if (!copied) {
      setMessage({
        type: "error",
        text: "Clipboard access was denied. Select the visible API key and copy it manually.",
      });
      return;
    }

    setApiKeyCopied(true);
    setMessage({ type: "success", text: "API key copied" });
    window.setTimeout(() => setApiKeyCopied(false), 1800);
  }

  async function handleSaveBusinessName(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) return;

    setSavingBusinessName(true);
    setMessage(null);

    try {
      const response = await fetch("/api/organizations/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: businessName.trim() }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update business name");
      }

      setOrganization((prev) =>
        prev
          ? {
              ...prev,
              organization: payload.organization
                ? { id: payload.organization.id, name: payload.organization.name }
                : prev.organization,
            }
          : prev
      );
      setMessage({ type: "success", text: "Business name updated" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update business name",
      });
    } finally {
      setSavingBusinessName(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberEmail: string) {
    if (!confirm(`Remove ${memberEmail} from the organization? They will lose access to all workspace data.`)) return;

    setRemovingMemberId(memberId);
    setMessage(null);

    try {
      const response = await fetch(`/api/organizations/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }

      setOrganization((prev) =>
        prev
          ? { ...prev, members: prev.members.filter((m) => m.id !== memberId) }
          : prev
      );
      setMessage({ type: "success", text: `${memberEmail} has been removed` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove member",
      });
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleInviteTeammate(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviteWorking(true);
    setInviteUrl(null);
    setMessage(null);

    try {
      const response = await fetch("/api/organizations/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create invite");
      }

      setInviteEmail("");
      setInviteUrl(data.inviteUrl ?? null);
      setMessage({ type: "success", text: "Invite created" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create invite",
      });
    } finally {
      setInviteWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">Settings</h1>
      <p className="mt-1 text-[13px] text-zinc-500">Manage your profile and workspace</p>

      <div className="mt-8 space-y-6">
        {/* Profile */}
        <section className="crisp-card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Profile</h2>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              Your name and photo, visible to teammates.
            </p>
          </div>

          {/* Avatar */}
          <div className="border-t border-[#f0f0f2] px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarSrc && !avatarError ? (
                  <img
                    src={avatarSrc}
                    alt="Avatar"
                    className="h-16 w-16 rounded-full border border-[#e7e7ea] object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#efe7fb] text-lg font-medium text-[#5b21b6]">
                    {initials}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[#e7e7ea] bg-white shadow-[0_1px_2px_rgba(17,17,26,0.05)] hover:bg-zinc-50 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={14} strokeWidth={1.8} className="animate-spin text-zinc-500" />
                  ) : (
                    <Camera size={14} strokeWidth={1.8} className="text-zinc-500" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <div className="text-[13px] text-zinc-500">
                <p>Click the camera icon to upload a photo.</p>
                <p>JPG, PNG, or GIF. Max 5MB.</p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="border-t border-[#f0f0f2] px-5 py-4">
            <form onSubmit={handleSaveName}>
              <label htmlFor="name" className="mb-1.5 block text-xs text-zinc-500">
                Display name
              </label>
              <div className="flex gap-2">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="flex-1 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>

          {/* Email (read-only) */}
          <div className="border-t border-[#f0f0f2] px-5 py-4">
            <label className="mb-1.5 block text-xs text-zinc-500">Email</label>
            <input
              type="email"
              value={userEmail}
              disabled
              className="w-full rounded-lg border border-[#e7e7ea] bg-[#fafafa] px-3 py-2 text-sm text-zinc-500"
            />
          </div>
        </section>

        {/* Business */}
        <section className="crisp-card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Business</h2>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              How your business appears to clients — on testimonial requests and
              anywhere else they see you.
            </p>
          </div>

          <div className="border-t border-[#f0f0f2] px-5 py-4">
            {organizationLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                <Loader2 size={15} strokeWidth={1.8} className="animate-spin text-zinc-500" />
                Loading...
              </div>
            ) : (
              <form onSubmit={handleSaveBusinessName}>
                <label htmlFor="business-name" className="mb-1.5 block text-xs text-zinc-500">
                  Business name
                </label>
                <div className="flex gap-2">
                  <input
                    id="business-name"
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Pentridge Media"
                    disabled={!["owner", "admin"].includes(organization?.role ?? "")}
                    className="flex-1 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:bg-[#fafafa] disabled:text-zinc-500"
                  />
                  {["owner", "admin"].includes(organization?.role ?? "") && (
                    <button
                      type="submit"
                      disabled={savingBusinessName || !businessName.trim()}
                      className="rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
                    >
                      {savingBusinessName ? "Saving..." : "Save"}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-zinc-400">
                  Clients see this on testimonial forms, e.g. &ldquo;What did{" "}
                  {businessName.trim() || "your business"} help you with?&rdquo;
                </p>
              </form>
            )}
          </div>
        </section>

        {/* API Key */}
        <section className="crisp-card overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">API key</h2>
              <p className="mt-0.5 text-[13px] text-zinc-500">
                Use this key to connect external tools to AlignoCRM.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {apiKey && (
                <button
                  type="button"
                  onClick={handleRevokeApiKey}
                  disabled={apiKeyWorking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={15} strokeWidth={1.8} />
                  Revoke
                </button>
              )}
              <button
                type="button"
                onClick={handleCreateApiKey}
                disabled={apiKeyLoading || apiKeyWorking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
              >
                {apiKeyWorking ? (
                  <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
                ) : apiKey ? (
                  <RefreshCw size={15} strokeWidth={1.8} />
                ) : (
                  <KeyRound size={15} strokeWidth={1.8} />
                )}
                {apiKey ? "Regenerate" : "Create Key"}
              </button>
            </div>
          </div>

          <div className="border-t border-[#f0f0f2] px-5 py-4">
            {apiKeyLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                <Loader2 size={15} strokeWidth={1.8} className="animate-spin text-zinc-500" />
                Loading key...
              </div>
            ) : apiKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-[#e7e7ea] bg-[#fafafa] px-3 py-2 text-sm text-zinc-700">
                    {apiKey.key ?? apiKey.maskedKey}
                  </code>
                  {apiKey.key && (
                    <button
                      type="button"
                      onClick={handleCopyApiKey}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {apiKeyCopied ? (
                        <Check size={15} strokeWidth={1.8} className="text-zinc-500" />
                      ) : (
                        <Copy size={15} strokeWidth={1.8} className="text-zinc-500" />
                      )}
                      {apiKeyCopied ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {apiKey.key
                    ? "This is the only time the full key will be shown."
                    : `Created ${new Date(apiKey.createdAt).toLocaleDateString()}`}
                  {apiKey.lastUsedAt
                    ? ` · Last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-zinc-500">
                No API key has been created for this user.
              </p>
            )}
          </div>
        </section>

        {/* Organization — temporarily hidden while team invites are finished.
            Flip SHOW_ORGANIZATION_SECTION to true to bring it back. */}
        {SHOW_ORGANIZATION_SECTION && (
        <section className="crisp-card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Organization</h2>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              Invite teammates into this workspace. Data is scoped to this organization.
            </p>
          </div>

          <div className="border-t border-[#f0f0f2] px-5 py-4">
            {organizationLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                <Loader2 size={15} strokeWidth={1.8} className="animate-spin text-zinc-500" />
                Loading organization...
              </div>
            ) : organization ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {organization.organization?.name ?? "Workspace"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Your role: {organization.role ?? "member"}
                  </p>
                </div>

                <div className="divide-y divide-[#f0f0f2] rounded-lg border border-[#e7e7ea]">
                  {organization.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between px-3 py-2.5 text-[13px] hover:bg-zinc-50/80"
                    >
                      <span className="truncate text-zinc-700">{member.email}</span>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#efe7fb] px-1.5 py-0.5 text-[11px] font-medium text-[#5b21b6]">
                          {member.role}
                        </span>
                        {["owner", "admin"].includes(organization.role ?? "") &&
                          member.role !== "owner" && (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.email)}
                            disabled={removingMemberId === member.id}
                            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title={`Remove ${member.email}`}
                          >
                            {removingMemberId === member.id ? (
                              <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} strokeWidth={1.8} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {["owner", "admin"].includes(organization.role ?? "") && (
                  <form onSubmit={handleInviteTeammate} className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="teammate@example.com"
                        className="min-w-0 flex-1 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value === "admin" ? "admin" : "member")
                        }
                        className="rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={inviteWorking || !inviteEmail.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
                    >
                      {inviteWorking ? (
                        <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
                      ) : (
                        <UserPlus size={15} strokeWidth={1.8} />
                      )}
                      Invite teammate
                    </button>
                  </form>
                )}

                {inviteUrl && (
                  <div className="rounded-lg border border-[#e7e7ea] bg-[#fafafa] p-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Invite link
                    </p>
                    <code className="mt-1 block break-all text-xs text-zinc-700">
                      {inviteUrl}
                    </code>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-zinc-500">No organization loaded.</p>
            )}
          </div>
        </section>
        )}

        {/* Status Message */}
        {message && (
          <div
            className={`rounded-lg border p-3 text-[13px] ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
