import { NextResponse } from "next/server";
import type { BusinessEvent } from "@/types/events";
import { processEvent } from "@/lib/workflows/trigger-matcher";
import { markEventProcessed } from "@/lib/events/emitter";

export async function POST(request: Request) {
  try {
    const event: BusinessEvent = await request.json();

    await processEvent(event);
    await markEventProcessed(event.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/events/process error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
