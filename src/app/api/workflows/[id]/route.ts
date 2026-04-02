import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/client";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing workflow ID" }, { status: 400 });
  }

  try {
    // Delete enrollment-dependent tables first.
    // RLS may hide rows from SELECT, so we delete by workflow_id where possible.
    const { data: enrollments } = await insforge.database
      .from("workflow_enrollments")
      .select("id")
      .eq("workflow_id", id);

    const enrollmentIds = (enrollments ?? []).map((e: { id: string }) => e.id);

    if (enrollmentIds.length > 0) {
      const { data: approvalReqs } = await insforge.database
        .from("approval_requests")
        .select("id")
        .in("enrollment_id", enrollmentIds);

      const approvalIds = (approvalReqs ?? []).map((a: { id: string }) => a.id);
      if (approvalIds.length > 0) {
        await insforge.database.from("approval_actions").delete().in("request_id", approvalIds);
      }

      await insforge.database.from("approval_requests").delete().in("enrollment_id", enrollmentIds);
      await insforge.database.from("execution_steps").delete().in("enrollment_id", enrollmentIds);
      await insforge.database.from("ai_outputs").delete().in("enrollment_id", enrollmentIds);
      await insforge.database.from("message_logs").delete().in("enrollment_id", enrollmentIds);
    }

    // Always delete enrollments by workflow_id directly (in case RLS hid some from SELECT)
    await insforge.database.from("workflow_enrollments").delete().eq("workflow_id", id);

    // Delete workflow structure
    await insforge.database.from("workflow_nodes").delete().eq("workflow_id", id);
    await insforge.database.from("workflow_edges").delete().eq("workflow_id", id);
    await insforge.database.from("workflow_versions").delete().eq("workflow_id", id);

    // Delete the workflow
    const { error } = await insforge.database
      .from("workflows")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete workflow:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Delete workflow error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
