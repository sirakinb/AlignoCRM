"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@insforge/nextjs";
import { useServerUser } from "@/components/auth/server-auth-context";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteWorking, setInviteWorking] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
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
          setOrganization(organizationData as OrganizationPayload);
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
          <div className="h-8 w-32 rounded bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="mt-8 h-16 w-16 rounded-full bg-gray-200" />
          <div className="h-10 w-full rounded bg-gray-200" />
          <div className="h-10 w-full rounded bg-gray-200" />
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
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your profile</p>

      <div className="mt-8 space-y-8">
        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Profile Photo
          </label>
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarSrc && !avatarError ? (
                <img
                  src={avatarSrc}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-medium"
                  style={{
                    backgroundColor: withAlpha(getPurpleScaleColor(1), 0.16),
                    color: getPurpleScaleColor(5),
                  }}
                >
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border bg-white shadow-sm disabled:opacity-50"
                style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
              >
                {uploading ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                    style={{ color: getPurpleScaleColor(3) }}
                  />
                ) : (
                  <Camera size={14} style={{ color: getPurpleScaleColor(3) }} />
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
            <div className="text-sm text-gray-500">
              <p>Click the camera icon to upload a photo.</p>
              <p>JPG, PNG, or GIF. Max 5MB.</p>
            </div>
          </div>
        </div>

        {/* Name */}
        <form onSubmit={handleSaveName}>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Display Name
          </label>
          <div className="flex gap-3">
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="flex-1 rounded-md border px-3 py-2 text-sm shadow-sm outline-none"
              style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
            />
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(3)})`,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={userEmail}
            disabled
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>

        {/* API Key */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                API Key
              </label>
              <p className="mt-1 text-sm text-gray-500">
                Use this key to connect external tools to AlignoCRM.
              </p>
            </div>
            <div className="flex gap-2">
              {apiKey && (
                <button
                  type="button"
                  onClick={handleRevokeApiKey}
                  disabled={apiKeyWorking}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Revoke
                </button>
              )}
              <button
                type="button"
                onClick={handleCreateApiKey}
                disabled={apiKeyLoading || apiKeyWorking}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(3)})`,
                }}
              >
                {apiKeyWorking ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : apiKey ? (
                  <RefreshCw size={14} />
                ) : (
                  <KeyRound size={14} />
                )}
                {apiKey ? "Regenerate" : "Create Key"}
              </button>
            </div>
          </div>

          <div
            className="rounded-lg border bg-white p-3"
            style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
          >
            {apiKeyLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Loading key...
              </div>
            ) : apiKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {apiKey.key ?? apiKey.maskedKey}
                  </code>
                  {apiKey.key && (
                    <button
                      type="button"
                      onClick={handleCopyApiKey}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm"
                    >
                      {apiKeyCopied ? <Check size={14} /> : <Copy size={14} />}
                      {apiKeyCopied ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {apiKey.key
                    ? "This is the only time the full key will be shown."
                    : `Created ${new Date(apiKey.createdAt).toLocaleDateString()}`}
                  {apiKey.lastUsedAt
                    ? ` · Last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No API key has been created for this user.
              </p>
            )}
          </div>
        </div>

        {/* Organization */}
        <div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Organization
            </label>
            <p className="mt-1 text-sm text-gray-500">
              Invite teammates into this workspace. Data is scoped to this organization.
            </p>
          </div>

          <div
            className="rounded-lg border bg-white p-4"
            style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
          >
            {organizationLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Loading organization...
              </div>
            ) : organization ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {organization.organization?.name ?? "Workspace"}
                  </p>
                  <p className="text-xs text-gray-500">
                    Your role: {organization.role ?? "member"}
                  </p>
                </div>

                <div className="space-y-2">
                  {organization.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="truncate text-gray-700">{member.email}</span>
                      <span className="rounded-full bg-[#F3EAFD] px-2 py-0.5 text-xs font-medium text-[#6C2BD9]">
                        {member.role}
                      </span>
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
                        className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm shadow-sm outline-none"
                        style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value === "admin" ? "admin" : "member")
                        }
                        className="rounded-md border px-3 py-2 text-sm shadow-sm outline-none"
                        style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={inviteWorking || !inviteEmail.trim()}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                      style={{
                        background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(3)})`,
                      }}
                    >
                      {inviteWorking ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <UserPlus size={14} />
                      )}
                      Invite teammate
                    </button>
                  </form>
                )}

                {inviteUrl && (
                  <div className="rounded-md bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500">Invite link</p>
                    <code className="mt-1 block break-all text-xs text-gray-700">
                      {inviteUrl}
                    </code>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No organization loaded.</p>
            )}
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`rounded-md p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
