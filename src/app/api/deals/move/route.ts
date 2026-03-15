import { NextResponse } from "next/server";
import { moveDealStage } from "@/lib/data/deals";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.dealId || !body.stageId) {
      return NextResponse.json(
        { error: "Missing required fields: dealId, stageId" },
        { status: 400 }
      );
    }

    const deal = await moveDealStage(
      body.dealId,
      body.stageId,
      body.userId ?? undefined
    );

    return NextResponse.json({ deal });
  } catch (error) {
    console.error("POST /api/deals/move error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
