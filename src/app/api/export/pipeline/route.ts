import { NextResponse } from "next/server";
import {
  exportOptions,
  exportCorsHeaders,
  requireExportTenant,
} from "@/lib/api/export-api";
import { getDeals } from "@/lib/data/deals";
import { getPipeline, getPipelines, getStages } from "@/lib/data/pipelines";

export const OPTIONS = exportOptions;

export async function GET(request: Request) {
  try {
    const { tenant, response } = await requireExportTenant(request);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const pipelineId = searchParams.get("pipelineId");
    const pipelines = pipelineId
      ? [await getPipeline(pipelineId)]
      : await getPipelines(tenant.workspaceId);

    if (pipelines.some((pipeline) => pipeline.workspace_id !== tenant.workspaceId)) {
      return NextResponse.json(
        { error: "Pipeline not found" },
        { status: 404, headers: exportCorsHeaders }
      );
    }

    const deals = await getDeals(tenant.workspaceId);
    const pipelinesWithRecords = await Promise.all(
      pipelines.map(async (pipeline) => {
        const stages = await getStages(pipeline.id);
        return {
          ...pipeline,
          stages,
          deals: deals.filter((deal) => deal.pipeline_id === pipeline.id),
        };
      })
    );

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        count: pipelinesWithRecords.length,
        pipelines: pipelinesWithRecords,
      },
      { headers: exportCorsHeaders }
    );
  } catch (error) {
    console.error("GET /api/export/pipeline error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: exportCorsHeaders }
    );
  }
}
