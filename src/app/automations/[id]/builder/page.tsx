"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNodesState, useEdgesState, type Node, type Edge } from "reactflow";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { NodeSettingsPanel } from "@/components/workflow/node-settings-panel";
import { type WorkflowNodeData } from "@/components/workflow/workflow-node";
import {
  ActivityPanel,
  type EnrichedEnrollment,
} from "@/components/workflow/activity-panel";
import { TestWorkflowModal } from "@/components/workflow/test-workflow-modal";
import {
  NodeType,
  type Workflow,
  type WorkflowNode as DbWorkflowNode,
  type WorkflowEdge as DbWorkflowEdge,
  type NodeConfig,
} from "@/types/workflow";
import type { ExecutionStep } from "@/types/enrollment";
import { EnrollmentStatus } from "@/types/enrollment";
import { nodeTypeConfigs } from "@/components/workflow/node-types";
import {
  getWorkflow,
  getWorkflowNodes,
  getWorkflowEdges,
  saveWorkflowNodes,
  publishWorkflow,
  unpublishWorkflow,
  createWorkflow,
} from "@/lib/data/workflows";
import { getEnrollmentsForWorkflow } from "@/lib/data/enrollments";
import { Undo2, Redo2, Loader2, Check, Activity, Play } from "lucide-react";

// --- Format conversions ---

function toRfNode(dbNode: DbWorkflowNode): Node<WorkflowNodeData> {
  const rawConfig = (dbNode.config ?? {}) as Record<string, unknown>;
  const { _title, _subtitle, ...config } = rawConfig;
  return {
    id: dbNode.id,
    type: "workflowNode",
    position: { x: dbNode.position_x, y: dbNode.position_y },
    data: {
      nodeType: dbNode.type,
      title:
        (_title as string) ||
        nodeTypeConfigs[dbNode.type]?.label ||
        dbNode.type,
      subtitle: _subtitle as string | undefined,
      config: config as NodeConfig,
    },
  };
}

function toDbNode(
  rfNode: Node<WorkflowNodeData>
): Omit<DbWorkflowNode, "workflow_id" | "created_at" | "updated_at"> {
  return {
    id: rfNode.id,
    type: rfNode.data.nodeType,
    position_x: rfNode.position.x,
    position_y: rfNode.position.y,
    config: {
      ...(rfNode.data.config ?? {}),
      _title: rfNode.data.title,
      _subtitle: rfNode.data.subtitle,
    } as unknown as NodeConfig,
  };
}

function toRfEdge(dbEdge: DbWorkflowEdge): Edge {
  return {
    id: dbEdge.id,
    source: dbEdge.source_node_id,
    target: dbEdge.target_node_id,
    sourceHandle: dbEdge.source_handle,
    type: "smoothstep",
    animated: true,
    label: dbEdge.label ?? undefined,
    style: {
      stroke:
        dbEdge.source_handle === "yes"
          ? "#16a34a"
          : dbEdge.source_handle === "no"
            ? "#ef4444"
            : "#94a3b8",
      strokeWidth: 2,
    },
  };
}

function toDbEdge(
  rfEdge: Edge
): Omit<DbWorkflowEdge, "workflow_id"> {
  return {
    id: rfEdge.id,
    source_node_id: rfEdge.source,
    target_node_id: rfEdge.target,
    source_handle: rfEdge.sourceHandle ?? null,
    label: typeof rfEdge.label === "string" ? rfEdge.label : null,
  };
}

// --- Execution status computation ---

function computeNodeStatuses(
  enrollment: EnrichedEnrollment,
  allNodeIds: string[]
): Record<string, "completed" | "failed" | "waiting" | "active" | null> {
  const map: Record<
    string,
    "completed" | "failed" | "waiting" | "active" | null
  > = {};
  for (const nodeId of allNodeIds) {
    const step = enrollment.steps.find(
      (s: ExecutionStep) => s.node_id === nodeId
    );
    if (step) {
      map[nodeId] = step.outcome as "completed" | "failed" | "waiting";
    } else if (nodeId === enrollment.current_node_id) {
      // Only show "active" pulse for actually active enrollments;
      // paused enrollments show "waiting" at their current node
      map[nodeId] = enrollment.status === EnrollmentStatus.Paused ? "waiting" : "active";
    } else {
      map[nodeId] = null;
    }
  }
  return map;
}

function computeContactCounts(
  enrollments: EnrichedEnrollment[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of enrollments) {
    if (
      (e.status === EnrollmentStatus.Active || e.status === EnrollmentStatus.Paused) &&
      e.current_node_id
    ) {
      counts[e.current_node_id] = (counts[e.current_node_id] || 0) + 1;
    }
  }
  return counts;
}

// --- Page component ---

export default function WorkflowBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Test modal state
  const [showTestModal, setShowTestModal] = useState(false);

  // Activity state
  const [showActivity, setShowActivity] = useState(false);
  const [enrollments, setEnrollments] = useState<EnrichedEnrollment[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<
    string | null
  >(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Refs for debounced save (always have latest state)
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;

  // Debounced save
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const wf = workflowRef.current;
      if (!wf) return;
      setSaveStatus("saving");
      try {
        await saveWorkflowNodes(
          wf.id,
          nodesRef.current.map(toDbNode),
          edgesRef.current.map(toDbEdge)
        );
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus("idle");
      }
    }, 1000);
  }, []);

  // --- Undo/Redo history ---
  type Snapshot = { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const isUndoRedo = useRef(false);

  const pushSnapshot = useCallback(() => {
    if (isUndoRedo.current) return;
    undoStack.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
    });
    // Cap history at 50 entries
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    redoStack.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
    });
    isUndoRedo.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    isUndoRedo.current = false;
    scheduleSave();
  }, [setNodes, setEdges, scheduleSave]);

  const handleRedo = useCallback(() => {
    const snapshot = redoStack.current.pop();
    if (!snapshot) return;
    undoStack.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
    });
    isUndoRedo.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    isUndoRedo.current = false;
    scheduleSave();
  }, [setNodes, setEdges, scheduleSave]);

  // Keyboard shortcuts: Cmd+Z / Ctrl+Z = undo, Cmd+Shift+Z / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  // Poll enrollments while activity panel is open and there are paused enrollments
  useEffect(() => {
    if (!showActivity) return;
    const hasPaused = enrollments.some((e) => e.status === EnrollmentStatus.Paused);
    if (!hasPaused) return;

    const interval = setInterval(async () => {
      const wf = workflowRef.current;
      if (!wf) return;
      try {
        // Try to resume any ready enrollments via local API
        await fetch("/api/workflows/resume", { method: "POST" }).catch(() => {});

        const data = await getEnrollmentsForWorkflow(wf.id);
        setEnrollments(data);

        const counts = computeContactCounts(data);
        const selectedEnrollment = selectedEnrollmentId
          ? data.find((e) => e.id === selectedEnrollmentId)
          : null;

        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: {
              ...n.data,
              activeContactCount: counts[n.id] || 0,
              executionStatus: selectedEnrollment
                ? (computeNodeStatuses(selectedEnrollment, nds.map((nd) => nd.id))[n.id] ?? null)
                : null,
            },
          }))
        );
      } catch {
        // Ignore polling errors
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [showActivity, enrollments, selectedEnrollmentId, setNodes]);

  // Poll enrollments while activity panel is open and there are paused enrollments
  useEffect(() => {
    if (!showActivity) return;
    const hasPaused = enrollments.some((e) => e.status === EnrollmentStatus.Paused);
    if (!hasPaused) return;

    const interval = setInterval(async () => {
      const wf = workflowRef.current;
      if (!wf) return;
      try {
        // Try to resume any ready enrollments locally
        try {
          await fetch("/api/workflows/resume", { method: "POST" });
        } catch {
          // ignore — endpoint may not be available
        }

        const data = await getEnrollmentsForWorkflow(wf.id);
        setEnrollments(data);

        const counts = computeContactCounts(data);
        const selectedEnrollment = selectedEnrollmentId
          ? data.find((e) => e.id === selectedEnrollmentId)
          : null;

        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: {
              ...n.data,
              activeContactCount: counts[n.id] || 0,
              executionStatus: selectedEnrollment
                ? (computeNodeStatuses(selectedEnrollment, nds.map((nd) => nd.id))[n.id] ?? null)
                : n.data.executionStatus,
            },
          }))
        );
      } catch {
        // ignore polling errors
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [showActivity, enrollments, selectedEnrollmentId, setNodes]);

  // Load workflow on mount
  useEffect(() => {
    loadWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadWorkflow() {
    try {
      if (params.id === "new") {
        const wf = await createWorkflow({
          workspace_id: "default",
          name: "Untitled Workflow",
          created_by: "user",
        });
        setWorkflow(wf);
        router.replace(`/automations/${wf.id}/builder`);
      } else {
        let wf: Workflow;
        try {
          wf = await getWorkflow(params.id);
        } catch {
          wf = await createWorkflow({
            workspace_id: "default",
            name: "Untitled Workflow",
            created_by: "user",
          });
          router.replace(`/automations/${wf.id}/builder`);
        }
        setWorkflow(wf);

        const dbNodes = await getWorkflowNodes(wf.id);
        const dbEdges = await getWorkflowEdges(wf.id);

        setNodes(dbNodes.map(toRfNode));
        setEdges(dbEdges.map(toRfEdge));
      }
    } catch (err) {
      console.error("Failed to load workflow:", err);
    } finally {
      setLoading(false);
    }
  }

  // Handle node config save from settings panel
  const handleSaveNode = useCallback(
    (data: WorkflowNodeData) => {
      if (!selectedNodeId) return;
      pushSnapshot();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...data } } : n
        )
      );
      setSelectedNodeId(null);
      scheduleSave();
    },
    [selectedNodeId, setNodes, scheduleSave, pushSnapshot]
  );

  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      if (showActivity) return; // Don't select nodes for editing when activity is open
      setSelectedNodeId(nodeId);
    },
    [showActivity]
  );

  // Handle publish
  const handlePublish = async () => {
    const wf = workflowRef.current;
    if (!wf) {
      alert("No workflow loaded. Please refresh and try again.");
      return;
    }

    try {
      // Save current state first
      await saveWorkflowNodes(
        wf.id,
        nodesRef.current.map(toDbNode),
        edgesRef.current.map(toDbEdge)
      );

      const result = await publishWorkflow(wf.id, "user");
      if (result.errors.length > 0) {
        alert("Validation errors:\n" + result.errors.join("\n"));
      } else {
        const updated = await getWorkflow(wf.id);
        setWorkflow(updated);
        alert("Workflow published successfully!");
      }
    } catch (err) {
      console.error("Publish failed:", err);
      const msg = err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
      alert("Failed to publish workflow: " + msg);
    }
  };

  // Handle unpublish
  const handleUnpublish = async () => {
    const wf = workflowRef.current;
    if (!wf) return;

    if (!confirm("Unpublish this workflow? It will be moved to Drafts and stop running.")) {
      return;
    }

    try {
      await unpublishWorkflow(wf.id);
      const updated = await getWorkflow(wf.id);
      setWorkflow(updated);
    } catch (err) {
      console.error("Unpublish failed:", err);
      alert("Failed to unpublish workflow.");
    }
  };

  // Handle workflow name change
  const handleNameChange = async (name: string) => {
    const wf = workflowRef.current;
    if (!wf) return;
    setWorkflow({ ...wf, name });
    // Save name to DB
    const { error } = await (await import("@/lib/insforge/client")).insforge.database
      .from("workflows")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", wf.id);
    if (error) console.error("Failed to save name:", error);
  };

  // --- Activity logic ---

  const handleToggleActivity = async () => {
    if (showActivity) {
      // Close activity panel — clear overlays
      setShowActivity(false);
      setSelectedEnrollmentId(null);
      setEnrollments([]);
      clearNodeOverlays();
      return;
    }

    // Open activity panel
    setSelectedNodeId(null); // Close settings panel
    setShowActivity(true);

    const wf = workflowRef.current;
    if (!wf) return;
    try {
      const data = await getEnrollmentsForWorkflow(wf.id);
      setEnrollments(data);

      // Apply contact count badges
      const counts = computeContactCounts(data);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            activeContactCount: counts[n.id] || 0,
            executionStatus: null,
          },
        }))
      );
    } catch (err) {
      console.error("Failed to load enrollments:", err);
    }
  };

  const handleTestComplete = async (enrollmentId: string) => {
    setShowTestModal(false);

    const wf = workflowRef.current;
    if (!wf) return;

    // Open activity panel with refreshed enrollments
    setSelectedNodeId(null);
    setShowActivity(true);

    try {
      const data = await getEnrollmentsForWorkflow(wf.id);
      setEnrollments(data);

      // Auto-select the new test enrollment
      setSelectedEnrollmentId(enrollmentId);

      const enrollment = data.find((e) => e.id === enrollmentId);
      if (enrollment) {
        const allNodeIds = nodesRef.current.map((n) => n.id);
        const statuses = computeNodeStatuses(enrollment, allNodeIds);
        const counts = computeContactCounts(data);

        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: {
              ...n.data,
              executionStatus: statuses[n.id] ?? null,
              activeContactCount: counts[n.id] || 0,
            },
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load enrollments after test:", err);
    }
  };

  const handleSelectEnrollment = (enrollmentId: string | null) => {
    setSelectedEnrollmentId(enrollmentId);

    if (!enrollmentId) {
      // Deselect — show only contact counts
      const counts = computeContactCounts(enrollments);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            executionStatus: null,
            activeContactCount: counts[n.id] || 0,
          },
        }))
      );
      return;
    }

    const enrollment = enrollments.find((e) => e.id === enrollmentId);
    if (!enrollment) return;

    const allNodeIds = nodesRef.current.map((n) => n.id);
    const statuses = computeNodeStatuses(enrollment, allNodeIds);
    const counts = computeContactCounts(enrollments);

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionStatus: statuses[n.id] ?? null,
          activeContactCount: counts[n.id] || 0,
        },
      }))
    );
  };

  const clearNodeOverlays = () => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionStatus: undefined,
          activeContactCount: undefined,
        },
      }))
    );
  };

  // Build nodeId -> name map for ActivityPanel
  const nodeNames: Record<string, string> = {};
  for (const n of nodes) {
    nodeNames[n.id] = n.data.title;
  }

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={workflow?.name ?? ""}
              onChange={(e) => handleNameChange(e.target.value)}
              className="text-lg font-bold text-gray-900 bg-transparent border-none outline-none focus:ring-1 focus:ring-purple-500 rounded px-1 -ml-1"
            />
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                workflow?.status === "published"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {workflow?.status === "published" ? "Published" : "Draft"}
            </span>
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check size={12} /> Saved
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.current.length === 0}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo (Cmd+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.current.length === 0}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 size={18} />
          </button>
          {workflow?.status === "published" && (
            <>
              <button
                onClick={() => setShowTestModal(true)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Test Workflow"
              >
                <Play size={18} />
              </button>
              <button
                onClick={handleToggleActivity}
                className={`rounded-lg p-2 transition-colors ${
                  showActivity
                    ? "bg-purple-100 text-purple-700"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                }`}
                title="View Activity"
              >
                <Activity size={18} />
              </button>
            </>
          )}
          {workflow?.status === "published" ? (
            <>
              <button
                onClick={handleUnpublish}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Unpublish
              </button>
              <button
                onClick={handlePublish}
                className="rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"
              >
                Republish
              </button>
            </>
          ) : (
            <button
              onClick={handlePublish}
              className="rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Canvas + Settings/Activity panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            setNodes={setNodes}
            setEdges={setEdges}
            onNodeSelect={handleNodeSelect}
            onSave={scheduleSave}
            onBeforeChange={pushSnapshot}
          />
        </div>
        {selectedNode && !showActivity && (
          <NodeSettingsPanel
            nodeData={selectedNode.data}
            onClose={() => setSelectedNodeId(null)}
            onSave={handleSaveNode}
          />
        )}
        {showActivity && (
          <ActivityPanel
            enrollments={enrollments}
            selectedEnrollmentId={selectedEnrollmentId}
            onSelectEnrollment={handleSelectEnrollment}
            onClose={handleToggleActivity}
            nodeNames={nodeNames}
          />
        )}
      </div>

      {showTestModal && workflow && (
        <TestWorkflowModal
          workflowId={workflow.id}
          onClose={() => setShowTestModal(false)}
          onComplete={handleTestComplete}
        />
      )}
    </div>
  );
}
