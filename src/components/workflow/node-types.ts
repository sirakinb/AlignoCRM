import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import { NodeType } from "@/types/workflow";

export interface NodeTypeConfig {
  label: string;
  typeLabel: string;
  color: string;
  bgTint: string;
  borderColor: string;
  icon: string;
}

export const nodeTypeConfigs: Record<NodeType, NodeTypeConfig> = {
  [NodeType.Trigger]: {
    label: "Trigger",
    typeLabel: "TRIGGER",
    color: getPurpleScaleColor(4),
    bgTint: withAlpha(getPurpleScaleColor(4), 0.08),
    borderColor: getPurpleScaleColor(4),
    icon: "Zap",
  },
  [NodeType.SendEmail]: {
    label: "Send Email",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "Mail",
  },
  [NodeType.SendSms]: {
    label: "Send SMS",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "MessageSquare",
  },
  [NodeType.AddTag]: {
    label: "Add Tag",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "Tag",
  },
  [NodeType.RemoveTag]: {
    label: "Remove Tag",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "TagOff",
  },
  [NodeType.MoveDealStage]: {
    label: "Move Deal Stage",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "ArrowRightLeft",
  },
  [NodeType.CreateTask]: {
    label: "Create Task",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "CheckSquare",
  },
  [NodeType.Webhook]: {
    label: "Webhook",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(3),
    bgTint: withAlpha(getPurpleScaleColor(3), 0.08),
    borderColor: getPurpleScaleColor(3),
    icon: "Globe",
  },
  [NodeType.StopWorkflow]: {
    label: "Stop Workflow",
    typeLabel: "ACTION",
    color: getPurpleScaleColor(5),
    bgTint: withAlpha(getPurpleScaleColor(5), 0.08),
    borderColor: getPurpleScaleColor(5),
    icon: "Square",
  },
  [NodeType.Wait]: {
    label: "Wait",
    typeLabel: "WAIT",
    color: getPurpleScaleColor(1),
    bgTint: withAlpha(getPurpleScaleColor(1), 0.08),
    borderColor: getPurpleScaleColor(1),
    icon: "Clock",
  },
  [NodeType.Condition]: {
    label: "Condition",
    typeLabel: "CONDITION",
    color: getPurpleScaleColor(5),
    bgTint: withAlpha(getPurpleScaleColor(5), 0.08),
    borderColor: getPurpleScaleColor(5),
    icon: "GitBranch",
  },
  [NodeType.Approval]: {
    label: "Approval",
    typeLabel: "APPROVAL",
    color: getPurpleScaleColor(4),
    bgTint: withAlpha(getPurpleScaleColor(4), 0.08),
    borderColor: getPurpleScaleColor(4),
    icon: "UserCheck",
  },
  [NodeType.AiAnalyze]: {
    label: "AI Analyze",
    typeLabel: "AI",
    color: getPurpleScaleColor(2),
    bgTint: withAlpha(getPurpleScaleColor(2), 0.08),
    borderColor: getPurpleScaleColor(2),
    icon: "Brain",
  },
  [NodeType.AiRoute]: {
    label: "AI Route",
    typeLabel: "AI",
    color: getPurpleScaleColor(2),
    bgTint: withAlpha(getPurpleScaleColor(2), 0.08),
    borderColor: getPurpleScaleColor(2),
    icon: "Route",
  },
  [NodeType.AiDraftMessage]: {
    label: "AI Draft Message",
    typeLabel: "AI",
    color: getPurpleScaleColor(2),
    bgTint: withAlpha(getPurpleScaleColor(2), 0.08),
    borderColor: getPurpleScaleColor(2),
    icon: "Sparkles",
  },
};

export const nodeCategories = [
  {
    label: "Triggers",
    types: [NodeType.Trigger],
  },
  {
    label: "Actions",
    types: [
      NodeType.SendEmail,
      NodeType.SendSms,
      NodeType.AddTag,
      NodeType.RemoveTag,
      NodeType.MoveDealStage,
      NodeType.CreateTask,
      NodeType.Webhook,
      NodeType.StopWorkflow,
    ],
  },
  {
    label: "Flow Control",
    types: [NodeType.Wait, NodeType.Condition],
  },
  {
    label: "AI",
    types: [NodeType.AiAnalyze, NodeType.AiRoute, NodeType.AiDraftMessage],
  },
];
