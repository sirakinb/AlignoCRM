import { NextResponse } from "next/server";
import { getPipelines, createPipeline, createStage } from "@/lib/data/pipelines";

const DEFAULT_STAGES = [
  { name: "Lead", position: 0, color: "#6B7280" },
  { name: "Qualified", position: 1, color: "#3B82F6" },
  { name: "Proposal", position: 2, color: "#F59E0B" },
  { name: "Negotiation", position: 3, color: "#8B5CF6" },
  { name: "Closed Won", position: 4, color: "#10B981" },
  { name: "Closed Lost", position: 5, color: "#EF4444" },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = body.workspaceId ?? "default";

    // Check if pipelines already exist
    const existing = await getPipelines(workspaceId);
    if (existing.length > 0) {
      return NextResponse.json(
        { message: "Pipelines already exist", pipelines: existing },
        { status: 200 }
      );
    }

    // Create default pipeline
    const pipeline = await createPipeline({
      workspace_id: workspaceId,
      name: "Sales Pipeline",
      description: "Default sales pipeline",
      position: 0,
    });

    // Create stages for the pipeline
    const stages = [];
    for (const stageInput of DEFAULT_STAGES) {
      const stage = await createStage({
        pipeline_id: pipeline.id,
        name: stageInput.name,
        position: stageInput.position,
        color: stageInput.color,
      });
      stages.push(stage);
    }

    return NextResponse.json(
      { message: "Pipeline seeded", pipeline, stages },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/pipelines/seed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
