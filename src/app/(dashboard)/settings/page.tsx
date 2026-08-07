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
  Mail,
  Phone,
  RefreshCw,
  Search,
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

interface EmailConnection {
  id: string;
  provider: "google" | "microsoft" | "smtp";
  email: string;
  display_name: string | null;
  signature: string | null;
  status: "active" | "expired" | "revoked";
  is_default: boolean;
  expires_at: string | null;
  created_at: string;
}

interface WorkspacePhoneNumber {
  id: string;
  phone_number: string;
  number_type: "local" | "tollfree" | "mobile";
  status: "active" | "released";
  is_default: boolean;
  twilio_friendly_name: string | null;
}

interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  numberType: "local" | "tollfree" | "mobile";
}

interface SmsComplianceProfile {
  id: string;
  brand_status: "draft" | "pending" | "approved" | "rejected" | null;
  campaign_status: "draft" | "pending" | "approved" | "rejected" | null;
  brand_sid: string | null;
  campaign_sid: string | null;
  business_info: Record<string, unknown>;
}

interface TollfreeVerification {
  id: string;
  phone_number_id: string;
  tfv_sid: string;
  status: "PENDING_REVIEW" | "TWILIO_APPROVED" | "TWILIO_REJECTED";
  rejection_reasons: unknown;
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

  const [emailConnections, setEmailConnections] = useState<EmailConnection[]>([]);
  const [emailConnectionsLoading, setEmailConnectionsLoading] = useState(true);
  const [emailConnectionsWorking, setEmailConnectionsWorking] = useState<string | null>(null);
  const [editingSignatureId, setEditingSignatureId] = useState<string | null>(null);
  const [signatureDraft, setSignatureDraft] = useState("");

  const [phoneNumbers, setPhoneNumbers] = useState<WorkspacePhoneNumber[]>([]);
  const [phoneNumbersLoading, setPhoneNumbersLoading] = useState(true);
  const [phoneNumbersWorking, setPhoneNumbersWorking] = useState<string | null>(null);
  const [phoneSearchAreaCode, setPhoneSearchAreaCode] = useState("");
  const [phoneSearchType, setPhoneSearchType] = useState<"local" | "tollfree">("local");
  const [phoneSearchResults, setPhoneSearchResults] = useState<AvailablePhoneNumber[]>([]);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [smsProfile, setSmsProfile] = useState<SmsComplianceProfile | null>(null);
  const [smsProfileLoading, setSmsProfileLoading] = useState(true);
  const [smsComplianceWorking, setSmsComplianceWorking] = useState(false);
  const [showA2pForm, setShowA2pForm] = useState(false);
  const [a2pForm, setA2pForm] = useState({
    businessName: "",
    businessType: "Corporation",
    businessIndustry: "TECHNOLOGY",
    businessRegistrationIdentifier: "EIN",
    businessRegistrationNumber: "",
    websiteUrl: "",
    street: "",
    city: "",
    region: "",
    postalCode: "",
    isoCountry: "US",
    authorizedRepFirstName: "",
    authorizedRepLastName: "",
    authorizedRepEmail: "",
    authorizedRepPhone: "",
    authorizedRepTitle: "CEO",
    companyType: "private",
    brandContactEmail: "",
    campaignDescription: "",
    messageFlow: "",
    messageSample1: "",
    messageSample2: "",
    usAppToPersonUsecase: "MIXED",
    privacyPolicyUrl: "",
    termsAndConditionsUrl: "",
  });
  const [tollfreeVerifications, setTollfreeVerifications] = useState<TollfreeVerification[]>([]);
  const [tfvNumberId, setTfvNumberId] = useState<string | null>(null);
  const [tfvForm, setTfvForm] = useState({
    businessName: "",
    businessWebsite: "",
    notificationEmail: "",
    useCaseSummary: "",
    productionMessageSample: "",
    optInType: "WEB_FORM",
    optInImageUrls: "",
    messageVolume: "10",
  });
  const [tfvWorking, setTfvWorking] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadSettingsData() {
      try {
        const [
          apiKeyResponse,
          organizationResponse,
          emailConnectionsResponse,
          phoneNumbersResponse,
          smsComplianceResponse,
          tollfreeResponse,
        ] = await Promise.all([
          fetch("/api/settings/api-key", { cache: "no-store" }),
          fetch("/api/organizations/current", { cache: "no-store" }),
          fetch("/api/messaging/email/connections", { cache: "no-store" }),
          fetch("/api/messaging/phone-numbers", { cache: "no-store" }),
          fetch("/api/messaging/sms-compliance", { cache: "no-store" }),
          fetch("/api/messaging/sms-compliance/tollfree", { cache: "no-store" }),
        ]);
        const apiKeyData = await apiKeyResponse.json();
        const organizationData = await organizationResponse.json();
        const emailConnectionsData = await emailConnectionsResponse.json();
        const phoneNumbersData = await phoneNumbersResponse.json();
        const smsComplianceData = await smsComplianceResponse.json();
        const tollfreeData = await tollfreeResponse.json();

        if (!ignore && apiKeyResponse.ok) {
          setApiKey(apiKeyData.apiKey ?? null);
        }
        if (!ignore && organizationResponse.ok) {
          const payload = organizationData as OrganizationPayload;
          setOrganization(payload);
          setBusinessName(payload.organization?.name ?? "");
        }
        if (!ignore && emailConnectionsResponse.ok) {
          setEmailConnections((emailConnectionsData.connections ?? []) as EmailConnection[]);
        }
        if (!ignore && phoneNumbersResponse.ok) {
          setPhoneNumbers((phoneNumbersData.numbers ?? []) as WorkspacePhoneNumber[]);
        }
        if (!ignore && smsComplianceResponse.ok) {
          setSmsProfile((smsComplianceData.profile ?? null) as SmsComplianceProfile | null);
        }
        if (!ignore && tollfreeResponse.ok) {
          setTollfreeVerifications(
            (tollfreeData.verifications ?? []) as TollfreeVerification[]
          );
        }
      } catch (err) {
        console.error("[Settings] Failed to load settings data:", err);
      } finally {
        if (!ignore) {
          setApiKeyLoading(false);
          setOrganizationLoading(false);
          setEmailConnectionsLoading(false);
          setPhoneNumbersLoading(false);
          setSmsProfileLoading(false);
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

  const canManageEmail = ["owner", "admin"].includes(organization?.role ?? "");
  const canManageSms = canManageEmail;

  async function handleConnectGoogle() {
    setEmailConnectionsWorking("connect-google");
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/email/oauth/google/start");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start Google OAuth");
      }
      // The route returns a redirect; follow it.
      const location = response.headers.get("location") || response.url;
      if (location) window.location.href = location;
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to start Google OAuth",
      });
    } finally {
      setEmailConnectionsWorking(null);
    }
  }

  async function handleConnectMicrosoft() {
    setEmailConnectionsWorking("connect-microsoft");
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/email/oauth/microsoft/start");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start Microsoft OAuth");
      }
      const location = response.headers.get("location") || response.url;
      if (location) window.location.href = location;
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to start Microsoft OAuth",
      });
    } finally {
      setEmailConnectionsWorking(null);
    }
  }

  async function handleSetDefaultConnection(id: string) {
    if (!canManageEmail) return;
    setEmailConnectionsWorking(id);
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/email/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_default: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update connection");
      setEmailConnections((prev) =>
        prev.map((c) => ({ ...c, is_default: c.id === id }))
      );
      setMessage({ type: "success", text: "Default account updated" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update connection",
      });
    } finally {
      setEmailConnectionsWorking(null);
    }
  }

  async function handleDisconnectConnection(id: string) {
    if (!canManageEmail) return;
    if (!confirm("Disconnect this email account?")) return;
    setEmailConnectionsWorking(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/messaging/email/connections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to disconnect account");
      setEmailConnections((prev) => prev.filter((c) => c.id !== id));
      setMessage({ type: "success", text: "Account disconnected" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to disconnect account",
      });
    } finally {
      setEmailConnectionsWorking(null);
    }
  }

  async function handleSaveSignature(id: string) {
    if (!canManageEmail) return;
    setEmailConnectionsWorking(id);
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/email/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, signature: signatureDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save signature");
      setEmailConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, signature: signatureDraft } : c))
      );
      setEditingSignatureId(null);
      setSignatureDraft("");
      setMessage({ type: "success", text: "Signature saved" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save signature",
      });
    } finally {
      setEmailConnectionsWorking(null);
    }
  }

  function startEditingSignature(connection: EmailConnection) {
    setEditingSignatureId(connection.id);
    setSignatureDraft(connection.signature ?? "");
  }

  async function handleSearchPhoneNumbers() {
    if (!canManageSms) return;
    setPhoneSearching(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        country: "US",
        type: phoneSearchType,
      });
      if (phoneSearchAreaCode.trim()) {
        params.set("areaCode", phoneSearchAreaCode.trim());
      }
      const response = await fetch(`/api/messaging/phone-numbers/search?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setPhoneSearchResults((data.numbers ?? []) as AvailablePhoneNumber[]);
      if ((data.numbers ?? []).length === 0) {
        setMessage({ type: "error", text: "No numbers found for that search" });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Search failed",
      });
    } finally {
      setPhoneSearching(false);
    }
  }

  async function handlePurchasePhoneNumber(phoneNumber: string, numberType: AvailablePhoneNumber["numberType"]) {
    if (!canManageSms) return;
    setPhoneNumbersWorking(`buy:${phoneNumber}`);
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, numberType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Purchase failed");
      setPhoneNumbers((prev) => [data.number as WorkspacePhoneNumber, ...prev]);
      setPhoneSearchResults((prev) => prev.filter((n) => n.phoneNumber !== phoneNumber));
      setMessage({ type: "success", text: `Purchased ${phoneNumber}` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Purchase failed",
      });
    } finally {
      setPhoneNumbersWorking(null);
    }
  }

  async function handleSetDefaultPhoneNumber(id: string) {
    if (!canManageSms) return;
    setPhoneNumbersWorking(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/messaging/phone-numbers/${id}/default`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to set default");
      setPhoneNumbers((prev) =>
        prev.map((n) => ({ ...n, is_default: n.id === id }))
      );
      setMessage({ type: "success", text: "Default SMS number updated" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to set default",
      });
    } finally {
      setPhoneNumbersWorking(null);
    }
  }

  async function handleReleasePhoneNumber(id: string, phoneNumber: string) {
    if (!canManageSms) return;
    if (!confirm(`Release ${phoneNumber}? This cannot be undone.`)) return;
    setPhoneNumbersWorking(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/messaging/phone-numbers/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to release number");
      setPhoneNumbers((prev) => prev.filter((n) => n.id !== id));
      setMessage({ type: "success", text: "Number released" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to release number",
      });
    } finally {
      setPhoneNumbersWorking(null);
    }
  }

  async function handleSubmitA2p() {
    if (!canManageSms) return;
    setSmsComplianceWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/sms-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessInfo: a2pForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "A2P submission failed");
      setSmsProfile(data.profile as SmsComplianceProfile);
      setShowA2pForm(false);
      setMessage({ type: "success", text: "A2P registration submitted" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "A2P submission failed",
      });
    } finally {
      setSmsComplianceWorking(false);
    }
  }

  async function handleRefreshA2p() {
    if (!canManageSms) return;
    setSmsComplianceWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/messaging/sms-compliance/status", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to refresh status");
      setSmsProfile(data.profile as SmsComplianceProfile);
      setMessage({ type: "success", text: "Compliance status refreshed" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to refresh status",
      });
    } finally {
      setSmsComplianceWorking(false);
    }
  }

  async function handleSubmitTollfree(phoneNumberId: string) {
    if (!canManageSms) return;
    setTfvWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/messaging/phone-numbers/${phoneNumberId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...tfvForm,
          useCaseCategories: ["CUSTOMER_CARE"],
          optInImageUrls: tfvForm.optInImageUrls
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Toll-free verification failed");
      setTollfreeVerifications((prev) => [data.verification as TollfreeVerification, ...prev]);
      setTfvNumberId(null);
      setMessage({ type: "success", text: "Toll-free verification submitted" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Toll-free verification failed",
      });
    } finally {
      setTfvWorking(false);
    }
  }

  async function handleRefreshTollfree(phoneNumberId: string, verificationId: string) {
    if (!canManageSms) return;
    setTfvWorking(true);
    try {
      const response = await fetch(`/api/messaging/phone-numbers/${phoneNumberId}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to refresh verification");
      setTollfreeVerifications((prev) =>
        prev.map((v) => (v.id === verificationId ? (data.verification as TollfreeVerification) : v))
      );
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to refresh verification",
      });
    } finally {
      setTfvWorking(false);
    }
  }

  function complianceBadge(status: string | null | undefined) {
    const s = status ?? "draft";
    const styles =
      s === "approved" || s === "TWILIO_APPROVED"
        ? "bg-green-50 text-green-700 border-green-200"
        : s === "rejected" || s === "TWILIO_REJECTED"
          ? "bg-red-50 text-red-700 border-red-200"
          : s === "pending" || s === "PENDING_REVIEW"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-zinc-50 text-zinc-600 border-zinc-200";
    return (
      <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize ${styles}`}>
        {s.replace(/_/g, " ").toLowerCase()}
      </span>
    );
  }

  function providerLabel(provider: EmailConnection["provider"]) {
    switch (provider) {
      case "google":
        return "Gmail";
      case "microsoft":
        return "Outlook";
      case "smtp":
        return "SMTP";
    }
  }

  function statusBadge(status: EmailConnection["status"]) {
    const styles =
      status === "active"
        ? "bg-green-50 text-green-700 border-green-200"
        : status === "expired"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-zinc-50 text-zinc-600 border-zinc-200";
    return (
      <span
        className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize ${styles}`}
      >
        {status}
      </span>
    );
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
              How your business appears to clients.
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

        {/* SMS setup */}
        <section className="crisp-card overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">SMS setup</h2>
              <p className="mt-0.5 text-[13px] text-zinc-500">
                Search, buy, and manage Twilio numbers used as your SMS sender.
              </p>
            </div>
          </div>

          <div className="border-t border-[#f0f0f2] px-5 py-4 space-y-5">
            {canManageSms && (
              <div className="space-y-3">
                <p className="text-[12px] font-medium uppercase tracking-wide text-zinc-500">
                  Find a number
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[12px] text-zinc-500">Type</span>
                    <select
                      value={phoneSearchType}
                      onChange={(e) =>
                        setPhoneSearchType(e.target.value as "local" | "tollfree")
                      }
                      className="rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900"
                    >
                      <option value="local">Local</option>
                      <option value="tollfree">Toll-free</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] text-zinc-500">Area code</span>
                    <input
                      value={phoneSearchAreaCode}
                      onChange={(e) => setPhoneSearchAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                      placeholder="415"
                      className="w-24 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSearchPhoneNumbers}
                    disabled={phoneSearching || phoneNumbersWorking !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
                  >
                    {phoneSearching ? (
                      <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
                    ) : (
                      <Search size={15} strokeWidth={1.8} />
                    )}
                    Search
                  </button>
                </div>

                {phoneSearchResults.length > 0 && (
                  <div className="space-y-2">
                    {phoneSearchResults.map((result) => (
                      <div
                        key={result.phoneNumber}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#e7e7ea] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900">{result.phoneNumber}</p>
                          <p className="text-[12px] text-zinc-500">
                            {[result.locality, result.region].filter(Boolean).join(", ") ||
                              result.numberType}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handlePurchasePhoneNumber(result.phoneNumber, result.numberType)
                          }
                          disabled={phoneNumbersWorking !== null}
                          className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {phoneNumbersWorking === `buy:${result.phoneNumber}` ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            "Buy"
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-zinc-500">
                Your numbers
              </p>
              {phoneNumbersLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                  <Loader2 size={15} strokeWidth={1.8} className="animate-spin text-zinc-500" />
                  Loading numbers...
                </div>
              ) : phoneNumbers.length === 0 ? (
                <p className="text-[13px] text-zinc-500">
                  No purchased numbers yet. Without one, SMS falls back to the account Messaging
                  Service.
                </p>
              ) : (
                <div className="space-y-3">
                  {phoneNumbers.map((number) => {
                    const tfv = tollfreeVerifications.find(
                      (v) => v.phone_number_id === number.id
                    );
                    return (
                      <div
                        key={number.id}
                        className="rounded-lg border border-[#e7e7ea] p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Phone size={14} strokeWidth={1.8} className="text-zinc-400" />
                              <span className="truncate text-sm font-medium text-zinc-900">
                                {number.phone_number}
                              </span>
                              {number.is_default && (
                                <span className="rounded-md bg-[#efe7fb] px-1.5 py-0.5 text-[11px] font-medium text-[#5b21b6]">
                                  Default
                                </span>
                              )}
                              {number.number_type === "tollfree" &&
                                tfv &&
                                complianceBadge(tfv.status)}
                            </div>
                            <p className="mt-0.5 text-[12px] text-zinc-500 capitalize">
                              {number.number_type}
                            </p>
                          </div>
                          {canManageSms && (
                            <div className="flex shrink-0 items-center gap-1">
                              {number.number_type === "tollfree" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTfvNumberId(
                                      tfvNumberId === number.id ? null : number.id
                                    );
                                    setTfvForm((prev) => ({
                                      ...prev,
                                      businessName:
                                        prev.businessName ||
                                        String(smsProfile?.business_info?.businessName ?? ""),
                                      businessWebsite:
                                        prev.businessWebsite ||
                                        String(smsProfile?.business_info?.websiteUrl ?? ""),
                                    }));
                                  }}
                                  disabled={tfvWorking}
                                  className="rounded-md px-2 py-1 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                                >
                                  {tfv ? "TFV" : "Verify TF"}
                                </button>
                              )}
                              {tfv && (
                                <button
                                  type="button"
                                  onClick={() => handleRefreshTollfree(number.id, tfv.id)}
                                  disabled={tfvWorking}
                                  className="rounded-md px-2 py-1 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                                >
                                  Refresh
                                </button>
                              )}
                              {!number.is_default && (
                                <button
                                  type="button"
                                  onClick={() => handleSetDefaultPhoneNumber(number.id)}
                                  disabled={phoneNumbersWorking === number.id}
                                  className="rounded-md px-2 py-1 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                                >
                                  Set default
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handleReleasePhoneNumber(number.id, number.phone_number)
                                }
                                disabled={phoneNumbersWorking === number.id}
                                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="Release number"
                              >
                                {phoneNumbersWorking === number.id ? (
                                  <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
                                ) : (
                                  <Trash2 size={15} strokeWidth={1.8} />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                        {tfv?.status === "TWILIO_REJECTED" && tfv.rejection_reasons != null && (
                          <p className="text-[12px] text-red-600">
                            Rejection: {JSON.stringify(tfv.rejection_reasons)}
                          </p>
                        )}
                        {tfvNumberId === number.id && canManageSms && !tfv && (
                          <div className="grid gap-2 border-t border-[#f0f0f2] pt-3 sm:grid-cols-2">
                            {(
                              [
                                ["businessName", "Business name"],
                                ["businessWebsite", "Website"],
                                ["notificationEmail", "Notification email"],
                                ["messageVolume", "Monthly volume"],
                                ["optInType", "Opt-in type"],
                                ["useCaseSummary", "Use-case summary"],
                                ["productionMessageSample", "Message sample"],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key} className="block sm:col-span-1">
                                <span className="mb-1 block text-[12px] text-zinc-500">{label}</span>
                                <input
                                  value={tfvForm[key]}
                                  onChange={(e) =>
                                    setTfvForm((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
                                />
                              </label>
                            ))}
                            <label className="block sm:col-span-2">
                              <span className="mb-1 block text-[12px] text-zinc-500">
                                Opt-in screenshot URLs (one per line)
                              </span>
                              <textarea
                                value={tfvForm.optInImageUrls}
                                onChange={(e) =>
                                  setTfvForm((prev) => ({
                                    ...prev,
                                    optInImageUrls: e.target.value,
                                  }))
                                }
                                rows={2}
                                className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
                              />
                            </label>
                            <div className="sm:col-span-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setTfvNumberId(null)}
                                className="rounded-lg border border-[#e7e7ea] px-3 py-1.5 text-[12px] font-medium text-zinc-700"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitTollfree(number.id)}
                                disabled={tfvWorking}
                                className="rounded-lg bg-[#6c2bd9] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                              >
                                {tfvWorking ? "Submitting…" : "Submit verification"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[#f0f0f2] pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-wide text-zinc-500">
                    A2P 10DLC compliance
                  </p>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    Register your brand and campaign so local numbers can send A2P traffic.
                  </p>
                </div>
                {canManageSms && (
                  <div className="flex shrink-0 gap-2">
                    {smsProfile && (
                      <button
                        type="button"
                        onClick={handleRefreshA2p}
                        disabled={smsComplianceWorking}
                        className="rounded-lg border border-[#e7e7ea] px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Refresh status
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowA2pForm((v) => !v)}
                      disabled={smsComplianceWorking}
                      className="rounded-lg bg-[#6c2bd9] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
                    >
                      {showA2pForm ? "Hide form" : smsProfile ? "Resubmit" : "Submit brand info"}
                    </button>
                  </div>
                )}
              </div>

              {smsProfileLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                  <Loader2 size={15} className="animate-spin" /> Loading compliance…
                </div>
              ) : smsProfile ? (
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-zinc-700">
                  <span className="inline-flex items-center gap-1.5">
                    Brand {complianceBadge(smsProfile.brand_status)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    Campaign {complianceBadge(smsProfile.campaign_status)}
                  </span>
                  {typeof smsProfile.business_info?.businessName === "string" && (
                    <span className="text-zinc-500">
                      {smsProfile.business_info.businessName}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-zinc-500">
                  No A2P registration yet. Submit business details to start brand review.
                </p>
              )}

              {showA2pForm && canManageSms && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["businessName", "Business name"],
                      ["businessRegistrationNumber", "EIN / registration #"],
                      ["websiteUrl", "Website"],
                      ["brandContactEmail", "Brand contact email"],
                      ["street", "Street"],
                      ["city", "City"],
                      ["region", "State / region"],
                      ["postalCode", "Postal code"],
                      ["authorizedRepFirstName", "Rep first name"],
                      ["authorizedRepLastName", "Rep last name"],
                      ["authorizedRepEmail", "Rep email"],
                      ["authorizedRepPhone", "Rep phone"],
                      ["privacyPolicyUrl", "Privacy policy URL"],
                      ["termsAndConditionsUrl", "Terms URL"],
                      ["campaignDescription", "Campaign description"],
                      ["messageFlow", "Opt-in / message flow"],
                      ["messageSample1", "Sample message 1"],
                      ["messageSample2", "Sample message 2"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[12px] text-zinc-500">{label}</span>
                      <input
                        value={a2pForm[key]}
                        onChange={(e) =>
                          setA2pForm((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
                      />
                    </label>
                  ))}
                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSubmitA2p}
                      disabled={smsComplianceWorking}
                      className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-50"
                    >
                      {smsComplianceWorking ? "Submitting…" : "Submit to Twilio"}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
