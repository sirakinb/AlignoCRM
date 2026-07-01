import { NextResponse } from "next/server";
import { createContact } from "@/lib/data/contacts";
import { createDeal } from "@/lib/data/deals";
import { getPipelines, getStages } from "@/lib/data/pipelines";
import { getInternalApiAuthContext } from "@/lib/api/internal-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(firstName: string, lastName: string, fullName: string) {
  if (firstName || lastName) {
    return {
      firstName: firstName || fullName.split(/\s+/)[0] || "Unknown",
      lastName: lastName || fullName.split(/\s+/).slice(1).join(" ") || "-",
    };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "-",
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function findByName<T extends { name: string }>(items: T[], name: string) {
  const normalized = name.toLowerCase();
  return items.find((item) => item.name.toLowerCase() === normalized) ?? null;
}

export function leadWebhookOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function leadWebhookPost(request: Request, logPath = "/api/webhooks/lead") {
  try {
    const authContext = await getInternalApiAuthContext(request);
    if (!authContext.authorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const fullName = normalizeString(body.name);
    const firstNameInput = normalizeString(body.first_name ?? body.firstName);
    const lastNameInput = normalizeString(body.last_name ?? body.lastName);
    const email = normalizeString(body.email);
    const phone = normalizeString(body.phone ?? body.phone_number ?? body.phoneNumber);
    const details = normalizeString(
      body.details ?? body.message ?? body.case_details ?? body.caseDetails
    );
    const pipelineIdInput = normalizeString(body.pipeline_id ?? body.pipelineId);
    const pipelineNameInput = normalizeString(body.pipeline_name ?? body.pipelineName);
    const stageIdInput = normalizeString(body.stage_id ?? body.stageId);
    const stageNameInput = normalizeString(body.stage_name ?? body.stageName);

    const nameForSplit = fullName || `${firstNameInput} ${lastNameInput}`.trim();
    if (!nameForSplit) {
      return NextResponse.json(
        { error: "Missing required field: name or first_name" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Provide at least one contact method: email or phone" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400, headers: corsHeaders }
      );
    }

    const tenant = authContext.tenant;
    const pipelines = await getPipelines(tenant.workspaceId);
    const pipeline =
      pipelines.find((candidate) => candidate.id === pipelineIdInput) ??
      (pipelineNameInput ? findByName(pipelines, pipelineNameInput) : null) ??
      pipelines[0];

    if (!pipeline) {
      return NextResponse.json(
        { error: "No pipeline is available for this workspace" },
        { status: 400, headers: corsHeaders }
      );
    }

    const stages = await getStages(pipeline.id);
    const stage =
      stages.find((candidate) => candidate.id === stageIdInput) ??
      (stageNameInput ? findByName(stages, stageNameInput) : null) ??
      stages.find((candidate) => candidate.name.toLowerCase().includes("lead")) ??
      stages[0];

    if (!stage) {
      return NextResponse.json(
        { error: "No stage is available for the selected pipeline" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { firstName, lastName } = splitName(
      firstNameInput,
      lastNameInput,
      nameForSplit
    );
    const contact = await createContact({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      first_name: firstName,
      last_name: lastName,
      email: email || undefined,
      phone: phone || undefined,
      notes: details || undefined,
      status: "active",
    });

    const dealTitle = `${firstName} ${lastName}`.trim();
    const deal = await createDeal({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      contact_id: contact.id,
      title: dealTitle,
      value: 0,
      status: "open",
    });

    return NextResponse.json(
      {
        contactId: contact.id,
        dealId: deal.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        contact,
        deal,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error(`POST ${logPath} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
