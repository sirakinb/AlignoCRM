import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AddNodeMenu } from "@/components/workflow/add-node-menu";
import { NodeType } from "@/types/workflow";

afterEach(() => cleanup());

describe("AddNodeMenu", () => {
  const defaultProps = {
    position: { x: 100, y: 100 },
    onAddNode: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders the add node menu", () => {
    render(<AddNodeMenu {...defaultProps} />);
    expect(screen.getByTestId("add-node-menu")).toBeInTheDocument();
    expect(screen.getByText("ADD NODE")).toBeInTheDocument();
  });

  it("renders all node categories", () => {
    render(<AddNodeMenu {...defaultProps} />);
    expect(screen.getByText("Triggers")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Flow Control")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("renders node type options", () => {
    render(<AddNodeMenu {...defaultProps} />);
    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.getByText("Send Email")).toBeInTheDocument();
    expect(screen.getByText("Wait")).toBeInTheDocument();
    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("AI Draft Message")).toBeInTheDocument();
  });

  it("calls onAddNode when a node type is clicked", () => {
    render(<AddNodeMenu {...defaultProps} />);
    fireEvent.click(screen.getByText("Send Email"));
    expect(defaultProps.onAddNode).toHaveBeenCalledWith(
      NodeType.SendEmail,
      "Send Email"
    );
  });
});
