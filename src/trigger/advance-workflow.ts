import { task, wait } from "@trigger.dev/sdk";
import { insforge } from "@/lib/insforge/client";
import {
  getEnrollment,
  updateEnrollment,
  createExecutionStep,
} from "@/lib/data/enrollments";
import { getContact } from "@/lib/data/contacts";
import { getDeal } from "@/lib/data/deals";
import { createApprovalRequest } from "@/lib/data/approvals";
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowVersion,
  ConditionConfig,
  ConditionRule,
  WaitConfig,
  ApprovalConfig,
} from "@/types/workflow";
import { NodeType } from "@/types/workflow";
import { EnrollmentStatus, StepOutcome } from "@/types/enrollment";
import { ApprovalContentType } from "@/types/approval";
import { executeSendEmail } from "./actions/send-email";
import { executeAddTag } from "./actions/add-tag";
import { executeRemoveTag } from "./actions/remove-tag";
import { executeMoveDealStage } from "./actions/move-deal-stage";
import { executeCreateTask } from "./actions/create-task";
import { executeWebhook } from "./actions/webhook";

async function fetchRecordData(
  recordId: string,
  recordType: string
): Promise<Record<string, unknown>> {
  try {
    if (recordType === "contact") {
      return (await getContact(recordId)) as unknown as Record<string, unknown>;
    }
    if (recordType === "deal") {
      return (await getDeal(recordId)) as unknown as Record<string, unknown>;
    }
  } catch {
    // Record may not exist
  }
  return {};
}

function evaluateCondition(
  config: ConditionConfig,
  recordData: Record<string, unknown>
): boolean {
  if (!config.rules || config.rules.length === 0) return true;

  const results = config.rules.map((rule) => evaluateRule(rule, recordData));

  if (config.logicOperator === "AND") {
    return results.every(Boolean);
  }
  return results.some(Boolean);
}

function evaluateRule(
  rule: ConditionRule,
  recordData: Record<string, unknown>
): boolean {
  const fieldValue = recordData[rule.field];

  switch (rule.operator) {
    case "equals":
      return String(fieldValue) === String(rule.value);
    case "not_equals":
      return String(fieldValue) !== String(rule.value);
    case "contains":
      return String(fieldValue ?? "").includes(String(rule.value));
    case "exists":
      return fieldValue != null && fieldValue !== "";
    case "not_exists":
      return fieldValue == null || fieldValue === "";
    case "greater_than":
      return Number(fieldValue) > Number(rule.value);
    case "less_than":
      return Number(fieldValue) < Number(rule.value);
    default:
      return true;
  }
}

function findNextNode(
  currentNode: WorkflowNode,
  edges: WorkflowEdge[],
  nodes: WorkflowNode[],
  recordData: Record<string, unknown>
): string | null {
  const outgoingEdges = edges.filter(
    (e) => e.source_node_id === currentNode.id
  );

  if (outgoingEdges.length === 0) return null;

  if (currentNode.type === NodeType.Condition) {
    const condConfig = currentNode.config as ConditionConfig;
    const conditionMet = evaluateCondition(condConfig, recordData);

    const yesEdge = outgoingEdges.find(
      (e) => e.source_handle === "yes" || e.label === "Yes"
    );
    const noEdge = outgoingEdges.find(
      (e) => e.source_handle === "no" || e.label === "No"
    );

    if (conditionMet && yesEdge) return yesEdge.target_node_id;
    if (!conditionMet && noEdge) return noEdge.target_node_id;

    return outgoingEdges[0].target_node_id;
  }

  return outgoingEdges[0].target_node_id;
}

export const advanceWorkflowTask = task({
  id: "advance-workflow",
  queue: { concurrencyLimit: 1 },
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: { enrollmentId: string }) => {
    const enrollment = await getEnrollment(payload.enrollmentId);

    if (enrollment.status !== EnrollmentStatus.Active) {
      return { status: "skipped", reason: "not_active" };
    }

    // Get workflow version definition
    const { data: version, error: vError } = await insforge.database
      .from("workflow_versions")
      .select()
      .eq("id", enrollment.workflow_version_id)
      .single();

    if (vError || !version) {
      await updateEnrollment(payload.enrollmentId, {
        status: EnrollmentStatus.Failed,
      });
      return { status: "failed", reason: "version_not_found" };
    }

    const wfVersion = version as WorkflowVersion;
    const { nodes, edges } = wfVersion.definition;

    // Determine starting node
    let currentNode: WorkflowNode | undefined;
    if (!enrollment.current_node_id) {
      currentNode = nodes.find((n) => n.type === NodeType.Trigger);
    } else {
      currentNode = nodes.find((n) => n.id === enrollment.current_node_id);
    }

    // Main execution loop
    while (currentNode) {
      try {
        let outcome: StepOutcome = StepOutcome.Completed;
        let providerResponse: Record<string, unknown> | null = null;

        switch (currentNode.type) {
          case NodeType.Trigger:
            break;

          case NodeType.SendEmail: {
            const result = await executeSendEmail.triggerAndWait({
              workspaceId: enrollment.workspace_id,
              enrollmentId: enrollment.id,
              recordId: enrollment.record_id,
              nodeConfig: currentNode.config as any,
            });
            if (result.ok) {
              providerResponse = result.output as Record<string, unknown>;
            } else {
              outcome = StepOutcome.Failed;
              providerResponse = { error: String(result.error) };
            }
            break;
          }

          case NodeType.AddTag: {
            const result = await executeAddTag.triggerAndWait({
              workspaceId: enrollment.workspace_id,
              recordId: enrollment.record_id,
              nodeConfig: currentNode.config as any,
            });
            if (result.ok) {
              providerResponse = result.output as Record<string, unknown>;
            } else {
              outcome = StepOutcome.Failed;
              providerResponse = { error: String(result.error) };
            }
            break;
          }

          case NodeType.RemoveTag: {
            const result = await executeRemoveTag.triggerAndWait({
              workspaceId: enrollment.workspace_id,
              recordId: enrollment.record_id,
              nodeConfig: currentNode.config as any,
            });
            if (result.ok) {
              providerResponse = result.output as Record<string, unknown>;
            } else {
              outcome = StepOutcome.Failed;
              providerResponse = { error: String(result.error) };
            }
            break;
          }

          case NodeType.MoveDealStage: {
            const result = await executeMoveDealStage.triggerAndWait({
              workspaceId: enrollment.workspace_id,
              recordId: enrollment.record_id,
              nodeConfig: currentNode.config as any,
            });
            if (result.ok) {
              providerResponse = result.output as Record<string, unknown>;
            } else {
              outcome = StepOutcome.Failed;
              providerResponse = { error: String(result.error) };
            }
            break;
          }

          case NodeType.CreateTask: {
            const result = await executeCreateTask.triggerAndWait({
              workspaceId: enrollment.workspace_id,
              recordId: enrollment.record_id,
              nodeConfig: currentNode.config as any,
            });
            if (result.ok) {
              providerResponse = result.output as Record<string, unknown>;
            } else {
              outcome = StepOutcome.Failed;
              providerResponse = { error: String(result.error) };
            }
            break;
          }

          case NodeType.Webhook: {
            const result = await executeWebhook.triggerAndWait({
              workspaceId: enrollment.workspace_id,
              recordId: enrollment.record_id,
              enrollmentId: enrollment.id,
              nodeConfig: currentNode.config as any,
            });
            if (result.ok) {
              providerResponse = result.output as Record<string, unknown>;
            } else {
              outcome = StepOutcome.Failed;
              providerResponse = { error: String(result.error) };
            }
            break;
          }

          case NodeType.Wait: {
            const waitConfig = currentNode.config as WaitConfig;
            switch (waitConfig.unit) {
              case "minutes":
                await wait.for({ minutes: waitConfig.duration });
                break;
              case "hours":
                await wait.for({ hours: waitConfig.duration });
                break;
              case "days":
                await wait.for({ days: waitConfig.duration });
                break;
            }
            providerResponse = {
              waited: `${waitConfig.duration} ${waitConfig.unit}`,
            };
            break;
          }

          case NodeType.Condition: {
            providerResponse = { evaluated: true };
            break;
          }

          case NodeType.Approval: {
            const approvalConfig = currentNode.config as ApprovalConfig;
            const tokenId = `approval-${enrollment.id}-${currentNode.id}`;

            await createApprovalRequest({
              workspace_id: enrollment.workspace_id,
              enrollment_id: enrollment.id,
              node_id: currentNode.id,
              content_type: ApprovalContentType.EmailDraft,
              content: { description: approvalConfig.description },
              context: {
                enrollmentId: enrollment.id,
                nodeId: currentNode.id,
                tokenId,
              },
              assigned_to: approvalConfig.assigneeId ?? null,
            });

            // Record waiting step
            await createExecutionStep({
              enrollment_id: enrollment.id,
              node_id: currentNode.id,
              node_type: currentNode.type,
              outcome: StepOutcome.Waiting,
              provider_response: { tokenId, status: "waiting_for_approval" },
            });

            await updateEnrollment(enrollment.id, {
              current_node_id: currentNode.id,
              status: EnrollmentStatus.Paused,
            });

            // Wait for approval token — checkpointed, free while paused
            const approvalResult = await wait.forToken({
              id: tokenId,
            });

            // Resume enrollment
            await updateEnrollment(enrollment.id, {
              status: EnrollmentStatus.Active,
            });

            const approvalData = approvalResult as
              | Record<string, unknown>
              | undefined;
            if (approvalData?.approved === false) {
              await createExecutionStep({
                enrollment_id: enrollment.id,
                node_id: currentNode.id,
                node_type: currentNode.type,
                outcome: StepOutcome.Canceled,
                completed_at: new Date().toISOString(),
                provider_response: { rejected: true },
              });
              await updateEnrollment(enrollment.id, {
                status: EnrollmentStatus.Canceled,
                completed_at: new Date().toISOString(),
              });
              return { status: "canceled", reason: "approval_rejected" };
            }

            // Record approval completion
            await createExecutionStep({
              enrollment_id: enrollment.id,
              node_id: currentNode.id,
              node_type: currentNode.type,
              outcome: StepOutcome.Completed,
              completed_at: new Date().toISOString(),
              provider_response: { approved: true, tokenId },
            });

            // Skip the normal step recording below
            const recordData = await fetchRecordData(
              enrollment.record_id,
              enrollment.record_type
            );
            const nextNodeId = findNextNode(
              currentNode,
              edges,
              nodes,
              recordData
            );

            if (!nextNodeId) {
              await updateEnrollment(enrollment.id, {
                status: EnrollmentStatus.Completed,
                completed_at: new Date().toISOString(),
                current_node_id: currentNode.id,
              });
              return { status: "completed" };
            }

            await updateEnrollment(enrollment.id, {
              current_node_id: nextNodeId,
            });
            currentNode = nodes.find((n) => n.id === nextNodeId);
            continue; // Skip normal step recording + next node logic
          }

          case NodeType.StopWorkflow: {
            await createExecutionStep({
              enrollment_id: enrollment.id,
              node_id: currentNode.id,
              node_type: currentNode.type,
              outcome: StepOutcome.Completed,
              completed_at: new Date().toISOString(),
            });
            await updateEnrollment(enrollment.id, {
              status: EnrollmentStatus.Completed,
              completed_at: new Date().toISOString(),
              current_node_id: currentNode.id,
            });
            return { status: "completed", reason: "stop_workflow" };
          }

          // AI nodes stay mocked
          case NodeType.AiAnalyze:
          case NodeType.AiRoute:
          case NodeType.AiDraftMessage:
            providerResponse = { mock: true, action: currentNode.type };
            break;

          default:
            outcome = StepOutcome.Skipped;
        }

        // Record execution step
        await createExecutionStep({
          enrollment_id: enrollment.id,
          node_id: currentNode.id,
          node_type: currentNode.type,
          outcome,
          completed_at: new Date().toISOString(),
          provider_response: providerResponse,
        });

        if (outcome === StepOutcome.Failed) {
          await updateEnrollment(enrollment.id, {
            status: EnrollmentStatus.Failed,
          });
          return { status: "failed" };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await createExecutionStep({
          enrollment_id: enrollment.id,
          node_id: currentNode!.id,
          node_type: currentNode!.type,
          outcome: StepOutcome.Failed,
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        });

        await updateEnrollment(enrollment.id, {
          status: EnrollmentStatus.Failed,
        });

        return { status: "failed", error: errorMessage };
      }

      // Find next node (fetch fresh record data for condition evaluation)
      const recordData = await fetchRecordData(
        enrollment.record_id,
        enrollment.record_type
      );
      const nextNodeId = findNextNode(currentNode, edges, nodes, recordData);

      if (!nextNodeId) {
        await updateEnrollment(enrollment.id, {
          status: EnrollmentStatus.Completed,
          completed_at: new Date().toISOString(),
          current_node_id: currentNode.id,
        });
        return { status: "completed" };
      }

      await updateEnrollment(enrollment.id, { current_node_id: nextNodeId });
      currentNode = nodes.find((n) => n.id === nextNodeId);
    }

    // No current node found
    await updateEnrollment(payload.enrollmentId, {
      status: EnrollmentStatus.Failed,
    });
    return { status: "failed", reason: "no_current_node" };
  },
});
