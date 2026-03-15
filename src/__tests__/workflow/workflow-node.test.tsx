import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import { WorkflowNode, type WorkflowNodeData } from "@/components/workflow/workflow-node";
import { NodeType } from "@/types/workflow";

afterEach(() => cleanup());

// Mock reactflow's Handle component
vi.mock("reactflow", async () => {
  const actual = await vi.importActual("reactflow");
  return {
    ...actual,
    Handle: ({ type, position, id }: { type: string; position: string; id?: string }) => (
      <div data-testid={`handle-${type}${id ? `-${id}` : ""}`} />
    ),
  };
});

function renderNode(data: WorkflowNodeData, selected = false) {
  return render(
    <WorkflowNode
      id="test-node"
      data={data}
      selected={selected}
      type="workflowNode"
      isConnectable={true}
      xPos={0}
      yPos={0}
      zIndex={0}
      dragging={false}
    />
  );
}

describe("WorkflowNode", () => {
  it("renders trigger node with correct type label and title", () => {
    renderNode({
      nodeType: NodeType.Trigger,
      title: "New Contact Created",
      subtitle: "Listens for new CRM entries",
    });

    expect(screen.getByText("TRIGGER")).toBeInTheDocument();
    expect(screen.getByText("New Contact Created")).toBeInTheDocument();
    expect(screen.getByText("Listens for new CRM entries")).toBeInTheDocument();
  });

  it("renders action node with ACTION type label", () => {
    renderNode({
      nodeType: NodeType.SendEmail,
      title: "Send Email",
    });

    expect(screen.getByText("ACTION")).toBeInTheDocument();
    expect(screen.getByText("Send Email")).toBeInTheDocument();
  });

  it("renders AI node with AI type label", () => {
    renderNode({
      nodeType: NodeType.AiDraftMessage,
      title: "Draft Welcome Email",
      subtitle: "AI-generated outreach",
    });

    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Draft Welcome Email")).toBeInTheDocument();
  });

  it("renders condition node with two output handles", () => {
    renderNode({
      nodeType: NodeType.Condition,
      title: "Has Email?",
    });

    expect(screen.getByText("CONDITION")).toBeInTheDocument();
    expect(screen.getByTestId("handle-source-yes")).toBeInTheDocument();
    expect(screen.getByTestId("handle-source-no")).toBeInTheDocument();
  });

  it("trigger node has no input handle", () => {
    renderNode({
      nodeType: NodeType.Trigger,
      title: "Trigger",
    });

    expect(screen.queryByTestId("handle-target")).not.toBeInTheDocument();
  });

  it("stop workflow node has no output handle", () => {
    renderNode({
      nodeType: NodeType.StopWorkflow,
      title: "Stop",
    });

    expect(screen.queryByTestId("handle-source")).not.toBeInTheDocument();
  });

  it("renders wait node with WAIT type label", () => {
    renderNode({
      nodeType: NodeType.Wait,
      title: "Wait 24 hours",
    });

    expect(screen.getByText("WAIT")).toBeInTheDocument();
  });

  it("applies data-testid with node type", () => {
    renderNode({
      nodeType: NodeType.AddTag,
      title: "Add Tag",
    });

    expect(screen.getByTestId("workflow-node-add_tag")).toBeInTheDocument();
  });
});
