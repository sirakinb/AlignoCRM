import { NextResponse } from "next/server";
import { emitEvent } from "@/lib/events/emitter";
import type { CreateBusinessEventInput } from "@/types/events";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBusinessEventInput;

    if (!body.workspace_id || !body.event_type || !body.record_id || !body.record_type) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, event_type, record_id, record_type" },
        { status: 400 }
      );
    }

    const event = await emitEvent(body);

    if (!event) {
      return NextResponse.json(
        { message: "Event already processed (duplicate)" },
        { status: 200 }
      );
    }

    return NextResponse.json({ eventId: event.id, status: "queued" }, { status: 201 });
  } catch (error) {
    console.error("Event ingestion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
