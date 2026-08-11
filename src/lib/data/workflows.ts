import { insforge } from "@/lib/insforge/server";
import { validateWorkflow } from "@/lib/workflows/validation";
import type {
  Workflow,
  WorkflowVersion,
  WorkflowNode,
  WorkflowEdge,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  TriggerConfig,
} from "@/types/workflow";
import { NodeType } from "@/types/workflow";

export async function getWorkflows(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("workflows")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Workflow[];
}

export async function getWorkflow(id: string) {
  const { data, error } = await insforge.database
    .from("workflows")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Workflow;
}

export async function createWorkflow(input: CreateWorkflowInput) {
  const { data, error } = await insforge.database
    .from("workflows")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as Workflow;
}

export async function updateWorkflow(id: string, input: UpdateWorkflowInput) {
  const { data, error } = await insforge.database
    .from("workflows")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Workflow;
}

export async function deleteWorkflow(id: string) {
  // Delete dependent rows explicitly to avoid RLS/cascade conflicts.
  // Order: deepest dependents first, then the workflow itself.

  // 1. Find enrollments for this workflow
  const { data: enrollments } = await insforge.database
    .from("workflow_enrollments")
    .select("id")
    .eq("workflow_id", id);

  const enrollmentIds = (enrollments ?? []).map((e: { id: string }) => e.id);

  if (enrollmentIds.length > 0) {
    // Delete enrollment-dependent rows
    await insforge.database.from("approval_actions").delete().in(
      "request_id",
      (await insforge.database
        .from("approval_requests")
        .select("id")
        .in("enrollment_id", enrollmentIds)
      ).data?.map((a: { id: string }) => a.id) ?? []
    );
    await insforge.database.from("approval_requests").delete().in("enrollment_id", enrollmentIds);
    await insforge.database.from("execution_steps").delete().in("enrollment_id", enrollmentIds);
    await insforge.database.from("ai_outputs").delete().in("enrollment_id", enrollmentIds);
    await insforge.database.from("message_logs").delete().in("enrollment_id", enrollmentIds);
    await insforge.database.from("workflow_enrollments").delete().eq("workflow_id", id);
  }

  // 2. Delete workflow structure
  await insforge.database.from("workflow_edges").delete().eq("workflow_id", id);
  await insforge.database.from("workflow_nodes").delete().eq("workflow_id", id);
  await insforge.database.from("workflow_versions").delete().eq("workflow_id", id);

  // 3. Delete the workflow
  const { error } = await insforge.database
    .from("workflows")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getWorkflowNodes(workflowId: string) {
  const { data, error } = await insforge.database
    .from("workflow_nodes")
    .select()
    .eq("workflow_id", workflowId);

  if (error) throw error;
  return (data as WorkflowNode[]) ?? [];
}

export async function getWorkflowEdges(workflowId: string) {
  const { data, error } = await insforge.database
    .from("workflow_edges")
    .select()
    .eq("workflow_id", workflowId);

  if (error) throw error;
  return (data as WorkflowEdge[]) ?? [];
}

export async function saveWorkflowNodes(
  workflowId: string,
  nodes: Omit<WorkflowNode, "workflow_id" | "created_at" | "updated_at">[],
  edges: Omit<WorkflowEdge, "workflow_id">[]
) {
  // Delete existing nodes and edges for this workflow
  const { error: deleteEdgesError } = await insforge.database
    .from("workflow_edges")
    .delete()
    .eq("workflow_id", workflowId);
  if (deleteEdgesError) throw deleteEdgesError;

  const { error: deleteNodesError } = await insforge.database
    .from("workflow_nodes")
    .delete()
    .eq("workflow_id", workflowId);
  if (deleteNodesError) throw deleteNodesError;

  // Insert new nodes
  if (nodes.length > 0) {
    const nodesWithWorkflowId = nodes.map((n) => ({
      ...n,
      workflow_id: workflowId,
    }));
    const { error: insertNodesError } = await insforge.database
      .from("workflow_nodes")
      .insert(nodesWithWorkflowId);
    if (insertNodesError) throw insertNodesError;
  }

  // Insert new edges (deduplicate by id)
  if (edges.length > 0) {
    const seen = new Set<string>();
    const uniqueEdges = edges.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    const edgesWithWorkflowId = uniqueEdges.map((e) => ({
      ...e,
      workflow_id: workflowId,
    }));
    const { error: insertEdgesError } = await insforge.database
      .from("workflow_edges")
      .insert(edgesWithWorkflowId);
    if (insertEdgesError) throw insertEdgesError;
  }
}

export async function publishWorkflow(
  workflowId: string,
  publishedBy: string
) {
  // Fetch current nodes and edges
  const { data: nodes, error: nodesError } = await insforge.database
    .from("workflow_nodes")
    .select()
    .eq("workflow_id", workflowId);
  if (nodesError) throw nodesError;

  const { data: edges, error: edgesError } = await insforge.database
    .from("workflow_edges")
    .select()
    .eq("workflow_id", workflowId);
  if (edgesError) throw edgesError;

  // Validate before publishing
  const validation = validateWorkflow(
    (nodes as WorkflowNode[]) ?? [],
    (edges as WorkflowEdge[]) ?? []
  );
  if (!validation.valid) {
    return { version: null, errors: validation.errors };
  }

  // Get next version number
  const { data: latestVersion } = await insforge.database
    .from("workflow_versions")
    .select()
    .eq("workflow_id", workflowId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = latestVersion
    ? (latestVersion as WorkflowVersion).version_number + 1
    : 1;

  // Create version
  const { data: version, error: versionError } = await insforge.database
    .from("workflow_versions")
    .insert({
      workflow_id: workflowId,
      version_number: nextVersion,
      definition: { nodes, edges },
      published_by: publishedBy,
    })
    .select()
    .single();
  if (versionError) throw versionError;

  // Extract trigger type from the trigger node
  const triggerNode = (nodes as WorkflowNode[])?.find(
    (n) => n.type === NodeType.Trigger
  );
  const triggerType = triggerNode
    ? (triggerNode.config as TriggerConfig)?.triggerType ?? "contact_created"
    : null;

  // Update workflow status to published + set trigger_type
  await insforge.database
    .from("workflows")
    .update({
      status: "published",
      trigger_type: triggerType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflowId);

  return { version: version as WorkflowVersion, errors: [] };
}

export async function unpublishWorkflow(workflowId: string) {
  const { error } = await insforge.database
    .from("workflows")
    .update({
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflowId);

  if (error) throw error;

  // Cancel all active and paused enrollments for this workflow
  // so they don't continue executing after the workflow is unpublished
  const { error: cancelError } = await insforge.database
    .from("workflow_enrollments")
    .update({
      status: "canceled",
      completed_at: new Date().toISOString(),
    })
    .eq("workflow_id", workflowId)
    .in("status", ["active", "paused"]);

  if (cancelError) {
    console.error("[unpublishWorkflow] Failed to cancel enrollments:", cancelError);
  }
}

export async function getWorkflowVersion(versionId: string) {
  const { data, error } = await insforge.database
    .from("workflow_versions")
    .select()
    .eq("id", versionId)
    .single();

  if (error) throw error;
  return data as WorkflowVersion;
}
