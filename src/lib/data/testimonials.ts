"use server";

import { insforge } from "@/lib/insforge/server";
import type {
  CreateTestimonialInput,
  CreateTestimonialRequestInput,
  Testimonial,
  TestimonialRequest,
  TestimonialRequestStatus,
  TestimonialStatus,
} from "@/types/crm";

export async function getTestimonials(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("testimonials")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Testimonial[];
}

export async function updateTestimonialStatus(
  id: string,
  workspaceId: string,
  status: TestimonialStatus
) {
  const { data, error } = await insforge.database
    .from("testimonials")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) throw error;
  return data as Testimonial;
}

export async function deleteTestimonial(id: string, workspaceId: string) {
  const { error } = await insforge.database
    .from("testimonials")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

export async function getTestimonialRequests(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("testimonial_requests")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as TestimonialRequest[];
}

export async function createTestimonialRequest(
  input: CreateTestimonialRequestInput
) {
  const { data, error } = await insforge.database
    .from("testimonial_requests")
    .insert([{ id: crypto.randomUUID(), ...input }])
    .select()
    .single();

  if (error) throw error;
  return data as TestimonialRequest;
}

export async function updateTestimonialRequestStatus(
  id: string,
  workspaceId: string,
  status: TestimonialRequestStatus
) {
  const { data, error } = await insforge.database
    .from("testimonial_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) throw error;
  return data as TestimonialRequest;
}

export async function deleteTestimonialRequest(id: string, workspaceId: string) {
  const { error } = await insforge.database
    .from("testimonial_requests")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

// Public-form lookups: token is the only credential, so these are not
// workspace-scoped. Never return more than the form needs.
export async function getTestimonialRequestByToken(token: string) {
  const { data, error } = await insforge.database
    .from("testimonial_requests")
    .select()
    .eq("token", token)
    .single();

  if (error) {
    console.error("[getTestimonialRequestByToken] error:", error);
    return null;
  }
  return data as TestimonialRequest;
}

// Auto-generated org names look like "Jane Smith's Workspace" — reduce those
// to the person's name so clients never see the raw placeholder. A business
// name set in Settings is used verbatim.
function cleanBusinessName(name: string) {
  return name.replace(/(?:'s)?\s+Workspace$/i, "").trim();
}

export async function getBusinessNameForRequest(request: TestimonialRequest) {
  if (request.organization_id) {
    const { data } = await insforge.database
      .from("organizations")
      .select("name")
      .eq("id", request.organization_id)
      .single();

    const orgName = cleanBusinessName(
      (data as { name?: string } | null)?.name ?? ""
    );
    if (orgName) return orgName;
  }

  const { data: workspace } = await insforge.database
    .from("workspaces")
    .select("name")
    .eq("id", request.workspace_id)
    .single();

  const workspaceName = (workspace as { name?: string } | null)?.name ?? "";
  return cleanBusinessName(workspaceName) || "our team";
}

export async function createTestimonial(input: CreateTestimonialInput) {
  const { data, error } = await insforge.database
    .from("testimonials")
    .insert([{ id: crypto.randomUUID(), ...input }])
    .select()
    .single();

  if (error) throw error;
  return data as Testimonial;
}
