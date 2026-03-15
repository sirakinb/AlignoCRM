import { insforge } from "@/lib/insforge/client";
import type { WorkflowNode, WorkflowEdge, ConditionConfig, ConditionRule, SendEmailConfig, WaitConfig, AddTagConfig, RemoveTagConfig, MoveDealStageConfig } from "@/types/workflow";
import { NodeType } from "@/types/workflow";
import type { WorkflowVersion } from "@/types/workflow";
import { EnrollmentStatus, StepOutcome } from "@/types/enrollment";
import type { WorkflowEnrollment, ExecutionStep } from "@/types/enrollment";
import {
  getEnrollment,
  updateEnrollment,
  createExecutionStep,
} from "@/lib/data/enrollments";
import { getContact } from "@/lib/data/contacts";
import { interpolateTemplate } from "@/lib/messaging/interpolation";
import { addTagToContact, removeTagFromContact } from "@/lib/data/tags";
import { moveDealStage } from "@/lib/data/deals";

export async function executeStep(
  enrollment: WorkflowEnrollment,
  node: WorkflowNode
): Promise<StepOutcome> {
  const startedAt = new Date().toISOString();

  try {
    let outcome: StepOutcome;
    let providerResponse: Record<string, unknown> | null = null;

    switch (node.type) {
      case NodeType.Trigger:
        // Trigger is the entry point; mark as completed immediately
        outcome = StepOutcome.Completed;
        break;

      case NodeType.SendEmail: {
        const emailConfig = node.config as SendEmailConfig;
        let contact;
        try {
          contact = await getContact(enrollment.record_id);
        } catch {
          throw new Error(`Contact ${enrollment.record_id} not found — may have been deleted`);
        }
        const context: Record<string, unknown> = {
          contact: {
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
          },
        };
        const { text: subject } = interpolateTemplate(emailConfig.subject, context);
        const { text: body } = interpolateTemplate(emailConfig.body, context);
        const { text: toInterpolated } = interpolateTemplate(emailConfig.to, context);
        const to = toInterpolated || contact.email;

        if (!to) {
          throw new Error(`No email address for contact ${enrollment.record_id}`);
        }

        const { sendEmail } = await import("@/lib/messaging/email-service");
        const messageLog = await sendEmail(enrollment.workspace_id, {
          to,
          subject,
          body,
          contactId: enrollment.record_id,
          enrollmentId: enrollment.id,
          templateId: emailConfig.templateId,
        });

        if (messageLog.status === "failed") {
          const errorDetail =
            (messageLog.provider_response as Record<string, unknown>)?.error ??
            "Email send failed";
          throw new Error(String(errorDetail));
        }

        providerResponse = {
          messageLogId: messageLog.id,
          to,
          subject,
          status: messageLog.status,
        };
        outcome = StepOutcome.Completed;
        break;
      }

      case NodeType.SendSms:
        providerResponse = { mock: true, action: "send_sms", to: (node.config as Record<string, unknown>).to };
        outcome = StepOutcome.Completed;
        break;

      case NodeType.AddTag: {
        const tagConfig = node.config as AddTagConfig;
        // Don't pass workspaceId to avoid emitting TagAdded event (which would re-trigger workflows)
        await addTagToContact(enrollment.record_id, tagConfig.tagId);
        // Include tag name for Activity panel display
        let addTagName = tagConfig.tagName;
        if (!addTagName) {
          try {
            const { data: tagRow } = await insforge.database
              .from("tags")
              .select("name")
              .eq("id", tagConfig.tagId)
              .single();
            if (tagRow?.name) addTagName = tagRow.name;
          } catch { /* best-effort */ }
        }
        providerResponse = { action: "add_tag", tagId: tagConfig.tagId, tagName: addTagName || tagConfig.tagId };
        outcome = StepOutcome.Completed;
        break;
      }

      case NodeType.RemoveTag: {
        const removeTagConfig = node.config as RemoveTagConfig;
        await removeTagFromContact(enrollment.record_id, removeTagConfig.tagId);
        let removeTagName = removeTagConfig.tagName;
        if (!removeTagName) {
          try {
            const { data: tagRow } = await insforge.database
              .from("tags")
              .select("name")
              .eq("id", removeTagConfig.tagId)
              .single();
            if (tagRow?.name) removeTagName = tagRow.name;
          } catch { /* best-effort */ }
        }
        providerResponse = { action: "remove_tag", tagId: removeTagConfig.tagId, tagName: removeTagName || removeTagConfig.tagId };
        outcome = StepOutcome.Completed;
        break;
      }

      case NodeType.MoveDealStage: {
        const dealStageConfig = node.config as MoveDealStageConfig;
        const { data: deals, error: dealError } = await insforge.database
          .from("deals")
          .select()
          .eq("contact_id", enrollment.record_id)
          .eq("pipeline_id", dealStageConfig.pipelineId);

        if (dealError) throw dealError;
        if (!deals || deals.length === 0) {
          throw new Error(`No deal found for contact ${enrollment.record_id} in pipeline ${dealStageConfig.pipelineId}`);
        }

        const deal = deals[0];
        await moveDealStage(deal.id, dealStageConfig.stageId);
        // Enrich with human-readable names for Activity panel
        let dealName = deal.name || deal.id;
        let stageName = dealStageConfig.stageId;
        try {
          const { data: stageRow } = await insforge.database
            .from("pipeline_stages")
            .select("name")
            .eq("id", dealStageConfig.stageId)
            .single();
          if (stageRow?.name) stageName = stageRow.name;
        } catch { /* best-effort */ }
        providerResponse = { action: "move_deal_stage", dealId: deal.id, dealName, stageId: dealStageConfig.stageId, stageName };
        outcome = StepOutcome.Completed;
        break;
      }

      case NodeType.CreateTask:
        providerResponse = { mock: true, action: "create_task", title: (node.config as Record<string, unknown>).title };
        outcome = StepOutcome.Completed;
        break;

      case NodeType.Webhook:
        providerResponse = { mock: true, action: "webhook", url: (node.config as Record<string, unknown>).url };
        outcome = StepOutcome.Completed;
        break;

      case NodeType.Wait:
        // Real wait: pause enrollment and schedule resume
        outcome = StepOutcome.Waiting;
        const waitConfig = node.config as WaitConfig;
        providerResponse = { action: "wait", duration: waitConfig.duration, unit: waitConfig.unit };
        break;

      case NodeType.Condition:
        // Condition evaluation is handled during advance; mark as completed
        outcome = StepOutcome.Completed;
        break;

      case NodeType.AiAnalyze:
        providerResponse = { mock: true, action: "ai_analyze", result: "mock analysis" };
        outcome = StepOutcome.Completed;
        break;

      case NodeType.AiRoute:
        providerResponse = { mock: true, action: "ai_route", selectedRoute: "default" };
        outcome = StepOutcome.Completed;
        break;

      case NodeType.AiDraftMessage:
        providerResponse = { mock: true, action: "ai_draft_message", draft: "mock draft" };
        outcome = StepOutcome.Completed;
        break;

      case NodeType.StopWorkflow:
        outcome = StepOutcome.Completed;
        break;

      default:
        outcome = StepOutcome.Skipped;
    }

    await createExecutionStep({
      enrollment_id: enrollment.id,
      node_id: node.id,
      node_type: node.type,
      outcome,
      completed_at: new Date().toISOString(),
      provider_response: providerResponse,
    });

    return outcome;
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);

    await createExecutionStep({
      enrollment_id: enrollment.id,
      node_id: node.id,
      node_type: node.type,
      outcome: StepOutcome.Failed,
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    });

    return StepOutcome.Failed;
  }
}

export async function advanceWorkflow(
  enrollmentId: string
): Promise<void> {
  const enrollment = await getEnrollment(enrollmentId);

  if (enrollment.status !== EnrollmentStatus.Active) return;

  // Get the workflow version definition
  const { data: version, error: vError } = await insforge.database
    .from("workflow_versions")
    .select()
    .eq("id", enrollment.workflow_version_id)
    .single();

  if (vError || !version) {
    await updateEnrollment(enrollmentId, {
      status: EnrollmentStatus.Failed,
    });
    return;
  }

  const wfVersion = version as WorkflowVersion;
  const { nodes, edges } = wfVersion.definition;

  // Determine current node
  let currentNode: WorkflowNode | undefined;

  if (!enrollment.current_node_id) {
    // Start from trigger node
    currentNode = nodes.find((n) => n.type === NodeType.Trigger);
  } else {
    currentNode = nodes.find((n) => n.id === enrollment.current_node_id);
  }

  if (!currentNode) {
    await updateEnrollment(enrollmentId, {
      status: EnrollmentStatus.Failed,
    });
    return;
  }

  // Execute the current node
  const outcome = await executeStep(enrollment, currentNode);

  if (outcome === StepOutcome.Failed) {
    await updateEnrollment(enrollmentId, {
      status: EnrollmentStatus.Failed,
    });
    return;
  }

  // Handle wait step — pause enrollment and schedule resume
  if (outcome === StepOutcome.Waiting && currentNode.type === NodeType.Wait) {
    const waitConfig = currentNode.config as WaitConfig;
    const now = new Date();
    const multipliers: Record<string, number> = {
      minutes: 60_000,
      hours: 3_600_000,
      days: 86_400_000,
    };
    const delayMs = waitConfig.duration * (multipliers[waitConfig.unit] || 60_000);
    const resumeAt = new Date(now.getTime() + delayMs);

    const nextNodeId = findNextNode(currentNode, edges, nodes);
    await updateEnrollment(enrollmentId, {
      status: EnrollmentStatus.Paused,
      current_node_id: nextNodeId ?? currentNode.id,
      resume_at: resumeAt.toISOString(),
    });
    return; // Stop execution — cron will resume later
  }

  // Handle stop workflow
  if (currentNode.type === NodeType.StopWorkflow) {
    await updateEnrollment(enrollmentId, {
      status: EnrollmentStatus.Completed,
      completed_at: new Date().toISOString(),
      current_node_id: currentNode.id,
    });
    return;
  }

  // Find next node(s) via edges
  const nextNodeId = findNextNode(currentNode, edges, nodes);

  if (!nextNodeId) {
    // No more nodes, workflow is complete
    await updateEnrollment(enrollmentId, {
      status: EnrollmentStatus.Completed,
      completed_at: new Date().toISOString(),
      current_node_id: currentNode.id,
    });
    return;
  }

  // Update current node and continue
  await updateEnrollment(enrollmentId, {
    current_node_id: nextNodeId,
  });

  // Recursively advance to next step
  await advanceWorkflow(enrollmentId);
}

function findNextNode(
  currentNode: WorkflowNode,
  edges: WorkflowEdge[],
  nodes: WorkflowNode[]
): string | null {
  const outgoingEdges = edges.filter(
    (e) => e.source_node_id === currentNode.id
  );

  if (outgoingEdges.length === 0) return null;

  // For condition nodes, evaluate the condition to pick a branch
  if (currentNode.type === NodeType.Condition) {
    const condConfig = currentNode.config as ConditionConfig;
    const conditionMet = evaluateCondition(condConfig);

    // "yes" branch = condition met, "no" branch = not met
    const yesEdge = outgoingEdges.find(
      (e) => e.source_handle === "yes" || e.label === "Yes"
    );
    const noEdge = outgoingEdges.find(
      (e) => e.source_handle === "no" || e.label === "No"
    );

    if (conditionMet && yesEdge) return yesEdge.target_node_id;
    if (!conditionMet && noEdge) return noEdge.target_node_id;

    // Fallback to first edge
    return outgoingEdges[0].target_node_id;
  }

  // For non-condition nodes, take the first outgoing edge
  return outgoingEdges[0].target_node_id;
}

function evaluateCondition(config: ConditionConfig): boolean {
  if (!config.rules || config.rules.length === 0) return true;

  const results = config.rules.map((rule) => evaluateRule(rule));

  if (config.logicOperator === "AND") {
    return results.every(Boolean);
  }
  return results.some(Boolean);
}

function evaluateRule(rule: ConditionRule): boolean {
  // Mock evaluation - in production, this would check actual record data
  switch (rule.operator) {
    case "equals":
      return rule.field === String(rule.value);
    case "not_equals":
      return rule.field !== String(rule.value);
    case "exists":
      return true;
    case "not_exists":
      return false;
    default:
      return true;
  }
}
