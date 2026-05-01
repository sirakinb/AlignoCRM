import { createHash, randomBytes } from "crypto";
import { insforge } from "@/lib/insforge/client";
import type { AuthenticatedUser } from "@/lib/auth/session";

export const FALLBACK_WORKSPACE_ID = "default";

export interface Organization {
  id: string;
  name: string;
  default_workspace_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "removed";
  invited_by: string | null;
  joined_at: string;
  created_at: string;
}

export interface TenantContext {
  organizationId: string | null;
  workspaceId: string;
  role: OrganizationMember["role"] | null;
  organization: Organization | null;
}

export interface InviteRecord {
  id: string;
  organization_id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

function isSchemaMissing(error: unknown) {
  const err = error as { code?: string; message?: string };
  return (
    err?.code === "42P01" ||
    err?.code === "42703" ||
    /relation .* does not exist|column .* does not exist/i.test(err?.message ?? "")
  );
}

function displayNameForWorkspace(user: AuthenticatedUser) {
  const profile = {
    ...(user.metadata ?? {}),
    ...(user.profile ?? {}),
  };
  const name =
    (profile.name as string | undefined) ||
    (profile.full_name as string | undefined) ||
    user.email.split("@")[0];

  return `${name}'s Workspace`;
}

function newWorkspaceId() {
  return `org_${randomBytes(10).toString("hex")}`;
}

async function getOrganization(id: string) {
  const { data, error } = await insforge.database
    .from("organizations")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function getTenantContextForOrganizationId(
  organizationId: string
): Promise<TenantContext> {
  const organization = await getOrganization(organizationId);

  return {
    organizationId: organization.id,
    workspaceId: organization.default_workspace_id,
    role: null,
    organization,
  };
}

export async function getTenantContextForUser(
  user: AuthenticatedUser
): Promise<TenantContext> {
  try {
    const { data: member, error: memberError } = await insforge.database
      .from("organization_members")
      .select()
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (memberError) {
      const code = (memberError as { code?: string }).code;
      if (code !== "PGRST116") throw memberError;
    }

    if (member) {
      if ((member as OrganizationMember).email !== user.email) {
        await insforge.database
          .from("organization_members")
          .update({ email: user.email })
          .eq("id", (member as OrganizationMember).id);
      }

      const organization = await getOrganization(
        (member as OrganizationMember).organization_id
      );

      return {
        organizationId: organization.id,
        workspaceId: organization.default_workspace_id,
        role: (member as OrganizationMember).role,
        organization,
      };
    }

    return createOrganizationForUser(user);
  } catch (error) {
    if (isSchemaMissing(error)) {
      return {
        organizationId: null,
        workspaceId: FALLBACK_WORKSPACE_ID,
        role: null,
        organization: null,
      };
    }
    throw error;
  }
}

export async function createOrganizationForUser(
  user: AuthenticatedUser
): Promise<TenantContext> {
  const { data: org, error: orgError } = await insforge.database
    .from("organizations")
    .insert({
      name: displayNameForWorkspace(user),
      default_workspace_id: newWorkspaceId(),
      created_by: user.id,
    })
    .select()
    .single();

  if (orgError) throw orgError;

  const organization = org as Organization;
  const { data: member, error: memberError } = await insforge.database
    .from("organization_members")
    .insert({
      organization_id: organization.id,
      user_id: user.id,
      email: user.email,
      role: "owner",
      status: "active",
    })
    .select()
    .single();

  if (memberError) throw memberError;

  return {
    organizationId: organization.id,
    workspaceId: organization.default_workspace_id,
    role: (member as OrganizationMember).role,
    organization,
  };
}

export async function getOrganizationMembers(organizationId: string) {
  const { data, error } = await insforge.database
    .from("organization_members")
    .select()
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as OrganizationMember[];
}

export async function createOrganizationInvite({
  organizationId,
  email,
  role,
  invitedBy,
}: {
  organizationId: string;
  email: string;
  role: "admin" | "member";
  invitedBy: string;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data, error } = await insforge.database
    .from("organization_invites")
    .insert({
      organization_id: organizationId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: invitedBy,
    })
    .select()
    .single();

  if (error) throw error;
  return { invite: data as InviteRecord, token };
}

export async function acceptOrganizationInvite({
  token,
  user,
}: {
  token: string;
  user: AuthenticatedUser;
}) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: inviteData, error: inviteError } = await insforge.database
    .from("organization_invites")
    .select()
    .eq("token_hash", tokenHash)
    .eq("status", "pending")
    .single();

  if (inviteError) throw inviteError;

  const invite = inviteData as InviteRecord;
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("This invite is for a different email address.");
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await insforge.database
      .from("organization_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    throw new Error("This invite has expired.");
  }

  const { data: member, error: memberError } = await insforge.database
    .from("organization_members")
    .insert({
      organization_id: invite.organization_id,
      user_id: user.id,
      email: user.email,
      role: invite.role,
      status: "active",
      invited_by: invite.invited_by,
    })
    .select()
    .single();

  if (memberError) throw memberError;

  await insforge.database
    .from("organization_invites")
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  return member as OrganizationMember;
}
