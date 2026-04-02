"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { WorkflowNode, type WorkflowNodeData } from "./workflow-node";
import { AddNodeMenu } from "./add-node-menu";
import { NodeType } from "@/types/workflow";
import { getDefaultNodeConfig } from "./node-defaults";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
};

const defaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  selectable: true,
  style: { stroke: withAlpha(getPurpleScaleColor(2), 0.75), strokeWidth: 2 },
};

interface WorkflowCanvasProps {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  setNodes: Dispatch<SetStateAction<Node<WorkflowNodeData>[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  onNodeSelect?: (nodeId: string | null) => void;
  onSave?: () => void;
  onBeforeChange?: () => void;
}

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  setNodes,
  setEdges,
  onNodeSelect,
  onSave,
  onBeforeChange,
}: WorkflowCanvasProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMenuPosition, setAddMenuPosition] = useState({ x: 0, y: 0 });

  const onConnect = useCallback(
    (params: Connection) => {
      onBeforeChange?.();
      setEdges((eds) => addEdge({ ...params, ...defaultEdgeOptions }, eds));
      onSave?.();
    },
    [setEdges, onSave, onBeforeChange]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  const handleAddNode = useCallback(
    (nodeType: NodeType, title: string, subtitle?: string) => {
      onBeforeChange?.();
      const newNode: Node<WorkflowNodeData> = {
        id: `node-${Date.now()}`,
        type: "workflowNode",
        position: addMenuPosition,
        data: { nodeType, title, subtitle, config: getDefaultNodeConfig(nodeType) },
      };
      setNodes((nds) => [...nds, newNode]);
      setShowAddMenu(false);
      onSave?.();
    },
    [addMenuPosition, setNodes, onSave, onBeforeChange]
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Snapshot before removals
      if (changes.some((c) => c.type === "remove")) {
        onBeforeChange?.();
      }
      onNodesChange(changes);
      // Trigger save on position changes (drag) or removals
      if (changes.some((c) => c.type === "position" || c.type === "remove")) {
        onSave?.();
      }
    },
    [onNodesChange, onSave, onBeforeChange]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === "remove")) {
        onBeforeChange?.();
      }
      onEdgesChange(changes);
      if (changes.some((c) => c.type === "remove")) {
        onSave?.();
      }
    },
    [onEdgesChange, onSave, onBeforeChange]
  );

  // Snapshot once at drag start (not on every pixel)
  const onNodeDragStart = useCallback(() => {
    onBeforeChange?.();
  }, [onBeforeChange]);

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const reactFlowBounds = (
        event.currentTarget as HTMLElement
      ).getBoundingClientRect();
      setAddMenuPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      setShowAddMenu(true);
    },
    []
  );

  return (
    <div className="relative h-full w-full" data-testid="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStart={onNodeDragStart}
        onPaneClick={onPaneClick}
        onContextMenu={onContextMenu}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        className="bg-[#FCFAFF]"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={withAlpha(getPurpleScaleColor(1), 0.28)} />
        <Controls className="!rounded-lg !border !shadow-sm" style={{ borderColor: withAlpha(getPurpleScaleColor(1), 0.2) }} />
        <MiniMap
          className="!rounded-lg !border !shadow-sm"
          style={{ borderColor: withAlpha(getPurpleScaleColor(1), 0.2) }}
          nodeColor={(node) => {
            const data = node.data as WorkflowNodeData;
            const { nodeTypeConfigs } = require("./node-types");
            return nodeTypeConfigs[data.nodeType]?.color ?? getPurpleScaleColor(1);
          }}
        />
      </ReactFlow>

      {showAddMenu && (
        <AddNodeMenu
          position={addMenuPosition}
          onAddNode={handleAddNode}
          onClose={() => setShowAddMenu(false)}
        />
      )}
    </div>
  );
}
