"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@insforge/nextjs";
import { useServerUser } from "@/components/auth/server-auth-context";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import { Camera, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { user: serverUser } = useServerUser();

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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      router.refresh();
    } catch (err) {
      console.error("[Settings] Avatar upload error:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
