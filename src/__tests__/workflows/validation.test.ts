import { describe, expect, it } from "vitest";
import { validateWorkflow } from "@/lib/workflows/validation";
import { NodeType, type WorkflowNode, type WorkflowEdge } from "@/types/workflow";

function makeNode(
  overrides: Partial<WorkflowNode> & { id: string; type: NodeType }
): WorkflowNode {
  return {
    workflow_id: "wf-1",
    position_x: 0,
    position_y: 0,
    config: {} as WorkflowNode["config"],
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeEdge(
  overrides: Partial<WorkflowEdge> & {
    source_node_id: string;
    target_node_id: string;
  }
): WorkflowEdge {
  return {
    id: `edge-${overrides.source_node_id}-${overrides.target_node_id}`,
    workflow_id: "wf-1",
    source_handle: null,
    label: null,
    ...overrides,
  };
}

describe("validateWorkflow", () => {
  it("returns valid for a correct simple workflow", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "contact_created" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.SendEmail,
        config: { to: "{{contact.email}}", subject: "Welcome", body: "Hi!" },
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when no trigger node exists", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.SendEmail,
        config: { to: "a@b.com", subject: "Hi", body: "Hello" },
      }),
    ];

    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Workflow must have exactly one trigger node."
    );
  });

  it("fails when multiple trigger nodes exist", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "a" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.Trigger,
        config: { triggerType: "b" },
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("found 2");
  });

  it("detects orphan nodes", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "a" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.SendEmail,
        config: { to: "a@b.com", subject: "Hi", body: "Hello" },
      }),
      makeNode({
        id: "n3",
        type: NodeType.Wait,
        config: { duration: 5, unit: "minutes" },
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("n3"))).toBe(true);
    expect(result.errors.some((e) => e.includes("not connected"))).toBe(true);
  });

  it("fails when condition node has wrong number of outgoing edges", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "a" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.Condition,
        config: {
          conditionName: "Check status",
          logicOperator: "AND",
          rules: [{ field: "status", operator: "eq", value: "active" }],
        },
      }),
      makeNode({
        id: "n3",
        type: NodeType.SendEmail,
        config: { to: "a@b.com", subject: "Hi", body: "Hello" },
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
      // Only 1 outgoing from condition instead of 2
      makeEdge({ source_node_id: "n2", target_node_id: "n3" }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("exactly 2 outgoing edges"))
    ).toBe(true);
  });

  it("passes when condition node has exactly 2 outgoing edges", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "a" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.Condition,
        config: {
          conditionName: "Check",
          logicOperator: "AND",
          rules: [{ field: "f", operator: "eq", value: "v" }],
        },
      }),
      makeNode({
        id: "n3",
        type: NodeType.SendEmail,
        config: { to: "a@b.com", subject: "Yes", body: "Y" },
      }),
      makeNode({
        id: "n4",
        type: NodeType.StopWorkflow,
        config: {},
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
      makeEdge({
        source_node_id: "n2",
        target_node_id: "n3",
        source_handle: "yes",
      }),
      makeEdge({
        source_node_id: "n2",
        target_node_id: "n4",
        source_handle: "no",
      }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
  });

  it("validates required config fields for send_email", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "a" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.SendEmail,
        config: {} as any,
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"to"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"subject"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"body"'))).toBe(true);
  });

  it("validates required config fields for trigger node", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: {} as any,
      }),
    ];

    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"triggerType"'))).toBe(true);
  });

  it("validates wait node config", () => {
    const nodes: WorkflowNode[] = [
      makeNode({
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "a" },
      }),
      makeNode({
        id: "n2",
        type: NodeType.Wait,
        config: {} as any,
      }),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge({ source_node_id: "n1", target_node_id: "n2" }),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"duration"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"unit"'))).toBe(true);
  });
});
