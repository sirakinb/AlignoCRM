import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getPipeline,
  getPipelines,
  getStages,
  createPipeline,
  createStage,
} from "@/lib/data/pipelines";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const { searchParams } = new URL(request.url);
    const pipelineId = searchParams.get("pipelineId");

    // If pipelineId is provided, return stages for that pipeline
    if (pipelineId) {
      const pipeline = await getPipeline(pipelineId);
      if (pipeline.workspace_id !== tenant.workspaceId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const stages = await getStages(pipelineId);
      return NextResponse.json({ stages });
    }

    // Otherwise return all pipelines for the workspace
    const pipelines = await getPipelines(tenant.workspaceId);
    return NextResponse.json({ pipelines });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/pipelines error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    // Get current pipeline count for position
    const existing = await getPipelines(tenant.workspaceId);

    const pipeline = await createPipeline({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      name: body.name,
      description: body.description ?? null,
      position: existing.length,
    });

    // Create stages if provided
    const stages = [];
    if (body.stages && Array.isArray(body.stages)) {
      for (let i = 0; i < body.stages.length; i++) {
        const s = body.stages[i];
        const stage = await createStage({
          pipeline_id: pipeline.id,
          ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
          name: s.name,
          position: i,
          color: s.color ?? null,
        });
        stages.push(stage);
      }
    }

    return NextResponse.json({ pipeline, stages }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/pipelines error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
