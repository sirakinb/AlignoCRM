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
    color: "#16a34a",
    bgTint: "#f0fdf4",
    borderColor: "#16a34a",
    icon: "Zap",
  },
  [NodeType.SendEmail]: {
    label: "Send Email",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "Mail",
  },
  [NodeType.SendSms]: {
    label: "Send SMS",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "MessageSquare",
  },
  [NodeType.AddTag]: {
    label: "Add Tag",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "Tag",
  },
  [NodeType.RemoveTag]: {
    label: "Remove Tag",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "TagOff",
  },
  [NodeType.MoveDealStage]: {
    label: "Move Deal Stage",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "ArrowRightLeft",
  },
  [NodeType.CreateTask]: {
    label: "Create Task",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "CheckSquare",
  },
  [NodeType.Webhook]: {
    label: "Webhook",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "Globe",
  },
  [NodeType.StopWorkflow]: {
    label: "Stop Workflow",
    typeLabel: "ACTION",
    color: "#2563eb",
    bgTint: "#eff6ff",
    borderColor: "#2563eb",
    icon: "Square",
  },
  [NodeType.Wait]: {
    label: "Wait",
    typeLabel: "WAIT",
    color: "#6b7280",
    bgTint: "#f9fafb",
    borderColor: "#6b7280",
    icon: "Clock",
  },
  [NodeType.Condition]: {
    label: "Condition",
    typeLabel: "CONDITION",
    color: "#ea580c",
    bgTint: "#fff7ed",
    borderColor: "#ea580c",
    icon: "GitBranch",
  },
  [NodeType.Approval]: {
    label: "Approval",
    typeLabel: "APPROVAL",
    color: "#ea580c",
    bgTint: "#fff7ed",
    borderColor: "#ea580c",
    icon: "UserCheck",
  },
  [NodeType.AiAnalyze]: {
    label: "AI Analyze",
    typeLabel: "AI",
    color: "#7c3aed",
    bgTint: "#f5f3ff",
    borderColor: "#7c3aed",
    icon: "Brain",
  },
  [NodeType.AiRoute]: {
    label: "AI Route",
    typeLabel: "AI",
    color: "#7c3aed",
    bgTint: "#f5f3ff",
    borderColor: "#7c3aed",
    icon: "Route",
  },
  [NodeType.AiDraftMessage]: {
    label: "AI Draft Message",
    typeLabel: "AI",
    color: "#7c3aed",
    bgTint: "#f5f3ff",
    borderColor: "#7c3aed",
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
