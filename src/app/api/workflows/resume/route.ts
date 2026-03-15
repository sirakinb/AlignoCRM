import { NextResponse } from "next/server";
import { getResumableEnrollments, claimEnrollmentForResume, updateEnrollment } from "@/lib/data/enrollments";
import { advanceWorkflow } from "@/lib/workflows/executor";
import { insforge } from "@/lib/insforge/client";
import { EnrollmentStatus } from "@/types/enrollment";

export async function POST() {
  try {
    const enrollments = await getResumableEnrollments();

    let resumed = 0;
    let skipped = 0;
    for (const enrollment of enrollments) {
      // Check that the parent workflow is still published before resuming
      const { data: workflow } = await insforge.database
        .from("workflows")
        .select("status")
        .eq("id", enrollment.workflow_id)
        .single();

      if (!workflow || workflow.status !== "published") {
        // Workflow was unpublished/deleted — cancel the enrollment
        await updateEnrollment(enrollment.id, {
          status: EnrollmentStatus.Canceled,
          completed_at: new Date().toISOString(),
        });
        skipped++;
        continue;
      }

      // Atomically claim: only proceeds if this caller wins the race
      const claimed = await claimEnrollmentForResume(enrollment.id);
      if (!claimed) continue; // Another caller already resumed this one

      await advanceWorkflow(enrollment.id);
      resumed++;
    }

    return NextResponse.json({ resumed, skipped });
  } catch (error) {
    console.error("Resume workflow error:", error);
    return NextResponse.json(
      { error: "Failed to resume workflows" },
      { status: 500 }
    );
  }
}
