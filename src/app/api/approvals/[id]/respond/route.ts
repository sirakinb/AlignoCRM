import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getApprovalRequest,
  approveRequest,
  rejectRequest,
  editAndApproveRequest,
} from "@/lib/data/approvals";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const tenant = await requireTenantContext();
    const { id } = await params;
    const body = await request.json();
    const { approved, notes, editedContent } = body as {
      approved: boolean;
      notes?: string;
      editedContent?: Record<string, unknown>;
    };

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing required field: approved (boolean)" },
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

    if (approvalRequest.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Update approval status
    if (editedContent) {
      await editAndApproveRequest(id, user?.id ?? "system", editedContent, notes);
    } else if (approved) {
      await approveRequest(id, user?.id ?? "system", notes);
    } else {
      await rejectRequest(id, user?.id ?? "system", notes);
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
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

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
