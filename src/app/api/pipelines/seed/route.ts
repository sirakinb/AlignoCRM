import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getPipelines, createPipeline, createStage } from "@/lib/data/pipelines";

const DEFAULT_SALES_STAGES = [
  { name: "Lead", position: 0, color: "#6B7280" },
  { name: "Qualified", position: 1, color: "#3B82F6" },
  { name: "Proposal", position: 2, color: "#F59E0B" },
  { name: "Negotiation", position: 3, color: "#8B5CF6" },
  { name: "Closed Won", position: 4, color: "#10B981" },
  { name: "Closed Lost", position: 5, color: "#EF4444" },
];

const DEFAULT_RETAINER_STAGES = [
  { name: "Scope Discussion", position: 0, color: "#6B7280" },
  { name: "Proposal Sent", position: 1, color: "#3B82F6" },
  { name: "Approved", position: 2, color: "#F59E0B" },
  { name: "In Progress", position: 3, color: "#8B5CF6" },
  { name: "Completed", position: 4, color: "#10B981" },
  { name: "Renewed", position: 5, color: "#06B6D4" },
];

export async function POST() {
  try {
    const tenant = await requireTenantContext();

    // Check if pipelines already exist
    const existing = await getPipelines(tenant.workspaceId);
    if (existing.length > 0) {
      return NextResponse.json(
        { message: "Pipelines already exist", pipelines: existing },
        { status: 200 }
      );
    }

    const orgId = tenant.organizationId ? { organization_id: tenant.organizationId } : {};

    // Create Sales Pipeline
    const salesPipeline = await createPipeline({
      workspace_id: tenant.workspaceId,
      ...orgId,
      name: "Sales Pipeline",
      description: "Default sales pipeline",
      position: 0,
    });

    const salesStages = [];
    for (const stageInput of DEFAULT_SALES_STAGES) {
      const stage = await createStage({
        pipeline_id: salesPipeline.id,
        ...orgId,
        name: stageInput.name,
        position: stageInput.position,
        color: stageInput.color,
      });
      salesStages.push(stage);
    }

    // Create Retainer / Existing Client Pipeline
    const retainerPipeline = await createPipeline({
      workspace_id: tenant.workspaceId,
      ...orgId,
      name: "Retainer / Existing Client",
      description: "Pipeline for retainer clients and existing clients signing on for additional work",
      position: 1,
    });

    const retainerStages = [];
    for (const stageInput of DEFAULT_RETAINER_STAGES) {
      const stage = await createStage({
        pipeline_id: retainerPipeline.id,
        ...orgId,
        name: stageInput.name,
        position: stageInput.position,
        color: stageInput.color,
      });
      retainerStages.push(stage);
    }

    return NextResponse.json(
      {
        message: "Pipelines seeded",
        pipelines: [
          { pipeline: salesPipeline, stages: salesStages },
          { pipeline: retainerPipeline, stages: retainerStages },
        ],
      },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/pipelines/seed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
