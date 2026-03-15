import { NextResponse } from "next/server";
import { getPipelines, getStages, createPipeline, createStage } from "@/lib/data/pipelines";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "default";
    const pipelineId = searchParams.get("pipelineId");

    // If pipelineId is provided, return stages for that pipeline
    if (pipelineId) {
      const stages = await getStages(pipelineId);
      return NextResponse.json({ stages });
    }

    // Otherwise return all pipelines for the workspace
    const pipelines = await getPipelines(workspaceId);
    return NextResponse.json({ pipelines });
  } catch (error) {
    console.error("GET /api/pipelines error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    const workspaceId = body.workspace_id ?? "default";

    // Get current pipeline count for position
    const existing = await getPipelines(workspaceId);

    const pipeline = await createPipeline({
      workspace_id: workspaceId,
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
          name: s.name,
          position: i,
          color: s.color ?? null,
        });
        stages.push(stage);
      }
    }

    return NextResponse.json({ pipeline, stages }, { status: 201 });
  } catch (error) {
    console.error("POST /api/pipelines error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
