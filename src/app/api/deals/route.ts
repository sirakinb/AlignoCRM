import { NextResponse } from "next/server";
import { getDeals, createDeal, deleteDeal } from "@/lib/data/deals";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "default";

    const deals = await getDeals(workspaceId);
    return NextResponse.json({ deals });
  } catch (error) {
    console.error("GET /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.workspace_id || !body.pipeline_id || !body.stage_id || !body.title) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, pipeline_id, stage_id, title" },
        { status: 400 }
      );
    }

    const deal = await createDeal({
      workspace_id: body.workspace_id,
      pipeline_id: body.pipeline_id,
      stage_id: body.stage_id,
      title: body.title,
      value: body.value ?? 0,
      contact_id: body.contact_id ?? null,
      owner_id: body.owner_id ?? null,
      status: body.status ?? "open",
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("POST /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get("id");

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    await deleteDeal(dealId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
