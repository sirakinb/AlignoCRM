import { NodeType, type NodeConfig } from "@/types/workflow";
import type {
  TriggerConfig,
  SendEmailConfig,
  WaitConfig,
  ConditionConfig,
  AiDraftMessageConfig,
  AddTagConfig,
  RemoveTagConfig,
  MoveDealStageConfig,
  CreateTaskConfig,
  WebhookConfig,
  StopWorkflowConfig,
} from "@/types/workflow";

export function getDefaultNodeConfig(nodeType: NodeType): NodeConfig {
  switch (nodeType) {
    case NodeType.Trigger:
      return { triggerType: "contact_created" } as TriggerConfig;
    case NodeType.SendEmail:
      return { to: "", subject: "", body: "" } as SendEmailConfig;
    case NodeType.Wait:
      return { duration: 1, unit: "hours" } as WaitConfig;
    case NodeType.Condition:
      return {
        conditionName: "",
        logicOperator: "AND",
        rules: [{ field: "contact.email", operator: "equals", value: "" }],
      } as ConditionConfig;
    case NodeType.AiDraftMessage:
      return {
        promptTemplate: "",
        contextFields: [],
        outputFormat: "email",
        requireApproval: true,
      } as AiDraftMessageConfig;
    case NodeType.AddTag:
      return { tagId: "", tagName: "" } as AddTagConfig;
    case NodeType.RemoveTag:
      return { tagId: "", tagName: "" } as RemoveTagConfig;
    case NodeType.MoveDealStage:
      return { pipelineId: "", stageId: "" } as MoveDealStageConfig;
    case NodeType.CreateTask:
      return { title: "" } as CreateTaskConfig;
    case NodeType.Webhook:
      return { url: "", method: "POST" } as WebhookConfig;
    case NodeType.StopWorkflow:
      return {} as StopWorkflowConfig;
    default:
      return {} as NodeConfig;
  }
}
