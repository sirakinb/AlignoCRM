import { NextResponse } from "next/server";
import {
  getApprovalRequest,
  approveRequest,
  rejectRequest,
} from "@/lib/data/approvals";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { approved, actorId, notes } = body as {
      approved: boolean;
      actorId: string;
      notes?: string;
    };

    if (typeof approved !== "boolean" || !actorId) {
      return NextResponse.json(
        { error: "Missing required fields: approved (boolean), actorId" },
        { status: 400 }
      );
    }

    const approvalRequest = await getApprovalRequest(id);

    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 }
      );
    }

    // Update approval status
    if (approved) {
      await approveRequest(id, actorId, notes);
    } else {
      await rejectRequest(id, actorId, notes);
    }

    // Complete the Trigger.dev wait token to resume the workflow
    const tokenId = (approvalRequest.context as Record<string, unknown>)
      ?.tokenId as string | undefined;

    if (tokenId) {
      const triggerApiUrl =
        process.env.TRIGGER_API_URL ?? "https://api.trigger.dev";

      const tokenResponse = await fetch(
        `${triggerApiUrl}/api/v1/waitpoints/tokens/${encodeURIComponent(tokenId)}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ output: { approved, notes } }),
        }
      );

      if (!tokenResponse.ok) {
        console.error(
          "Failed to complete Trigger.dev wait token:",
          await tokenResponse.text()
        );
      }
    }

    return NextResponse.json({
      status: approved ? "approved" : "rejected",
      approvalId: id,
    });
  } catch (error) {
    console.error("Approval response error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
