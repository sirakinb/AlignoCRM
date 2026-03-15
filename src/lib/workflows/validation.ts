import {
  NodeType,
  type WorkflowNode,
  type WorkflowEdge,
} from "@/types/workflow";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  const errors: string[] = [];

  // Check for exactly one trigger node
  const triggerNodes = nodes.filter((n) => n.type === NodeType.Trigger);
  if (triggerNodes.length === 0) {
    errors.push("Workflow must have exactly one trigger node.");
  } else if (triggerNodes.length > 1) {
    errors.push(
      `Workflow must have exactly one trigger node, found ${triggerNodes.length}.`
    );
  }

  // Check for orphan nodes (nodes not connected to any edge)
  if (nodes.length > 1) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source_node_id);
      connectedNodeIds.add(edge.target_node_id);
    }
    const orphanNodes = nodes.filter((n) => !connectedNodeIds.has(n.id));
    for (const orphan of orphanNodes) {
      errors.push(`Node "${orphan.id}" is not connected to any edge.`);
    }
  }

  // Check condition nodes have exactly 2 outgoing edges
  const conditionNodes = nodes.filter((n) => n.type === NodeType.Condition);
  for (const condNode of conditionNodes) {
    const outgoing = edges.filter((e) => e.source_node_id === condNode.id);
    if (outgoing.length !== 2) {
      errors.push(
        `Condition node "${condNode.id}" must have exactly 2 outgoing edges (yes/no), found ${outgoing.length}.`
      );
    }
  }

  // Check required config fields per node type
  for (const node of nodes) {
    const configErrors = validateNodeConfig(node);
    errors.push(...configErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateNodeConfig(node: WorkflowNode): string[] {
  const errors: string[] = [];
  const config = node.config as Record<string, unknown>;

  switch (node.type) {
    case NodeType.Trigger:
      if (!config.triggerType) {
        errors.push(`Trigger node "${node.id}" is missing "triggerType".`);
      }
      break;

    case NodeType.SendEmail:
      if (!config.to) {
        errors.push(`SendEmail node "${node.id}" is missing "to".`);
      }
      if (!config.subject) {
        errors.push(`SendEmail node "${node.id}" is missing "subject".`);
      }
      if (!config.body) {
        errors.push(`SendEmail node "${node.id}" is missing "body".`);
      }
      break;

    case NodeType.SendSms:
      if (!config.to) {
        errors.push(`SendSms node "${node.id}" is missing "to".`);
      }
      if (!config.message) {
        errors.push(`SendSms node "${node.id}" is missing "message".`);
      }
      break;

    case NodeType.AddTag:
    case NodeType.RemoveTag:
      if (!config.tagId) {
        errors.push(`${node.type} node "${node.id}" is missing "tagId".`);
      }
      break;

    case NodeType.MoveDealStage:
      if (!config.pipelineId) {
        errors.push(
          `MoveDealStage node "${node.id}" is missing "pipelineId".`
        );
      }
      if (!config.stageId) {
        errors.push(`MoveDealStage node "${node.id}" is missing "stageId".`);
      }
      break;

    case NodeType.CreateTask:
      if (!config.title) {
        errors.push(`CreateTask node "${node.id}" is missing "title".`);
      }
      break;

    case NodeType.Webhook:
      if (!config.url) {
        errors.push(`Webhook node "${node.id}" is missing "url".`);
      }
      if (!config.method) {
        errors.push(`Webhook node "${node.id}" is missing "method".`);
      }
      break;

    case NodeType.Wait:
      if (!config.duration) {
        errors.push(`Wait node "${node.id}" is missing "duration".`);
      }
      if (!config.unit) {
        errors.push(`Wait node "${node.id}" is missing "unit".`);
      }
      break;

    case NodeType.Condition:
      if (!config.conditionName) {
        errors.push(
          `Condition node "${node.id}" is missing "conditionName".`
        );
      }
      if (
        !Array.isArray(config.rules) ||
        (config.rules as unknown[]).length === 0
      ) {
        errors.push(
          `Condition node "${node.id}" must have at least one rule.`
        );
      }
      break;

    case NodeType.AiAnalyze:
      if (!config.promptTemplate) {
        errors.push(
          `AiAnalyze node "${node.id}" is missing "promptTemplate".`
        );
      }
      if (
        !Array.isArray(config.contextFields) ||
        (config.contextFields as unknown[]).length === 0
      ) {
        errors.push(
          `AiAnalyze node "${node.id}" must have at least one contextField.`
        );
      }
      break;

    case NodeType.AiRoute:
      if (!config.promptTemplate) {
        errors.push(`AiRoute node "${node.id}" is missing "promptTemplate".`);
      }
      if (
        !Array.isArray(config.routes) ||
        (config.routes as unknown[]).length === 0
      ) {
        errors.push(
          `AiRoute node "${node.id}" must have at least one route.`
        );
      }
      break;

    case NodeType.AiDraftMessage:
      if (!config.promptTemplate) {
        errors.push(
          `AiDraftMessage node "${node.id}" is missing "promptTemplate".`
        );
      }
      if (
        !Array.isArray(config.contextFields) ||
        (config.contextFields as unknown[]).length === 0
      ) {
        errors.push(
          `AiDraftMessage node "${node.id}" must have at least one contextField.`
        );
      }
      if (!config.outputFormat) {
        errors.push(
          `AiDraftMessage node "${node.id}" is missing "outputFormat".`
        );
      }
      break;

    case NodeType.StopWorkflow:
      // No required fields
      break;
  }

  return errors;
}
