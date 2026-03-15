"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getWorkflows,
  deleteWorkflow,
  publishWorkflow,
  unpublishWorkflow,
  getWorkflow,
} from "@/lib/data/workflows";
import { WorkflowStatus, type Workflow } from "@/types/workflow";
import { Loader2, Trash2, Power, PowerOff } from "lucide-react";

export default function AutomationsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getWorkflows("default");
        setWorkflows(data);
      } catch (err) {
        console.error("Failed to load workflows:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleDelete = async (e: React.MouseEvent, wfId: string, wfName: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Delete "${wfName || "Untitled Workflow"}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(wfId);
    try {
      await deleteWorkflow(wfId);
      setWorkflows((prev) => prev.filter((w) => w.id !== wfId));
    } catch (err) {
      console.error("Failed to delete workflow:", err);
      alert("Failed to delete workflow. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleTogglePublish = async (
    e: React.MouseEvent,
    wf: Workflow
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (wf.status === "published") {
      if (!confirm(`Unpublish "${wf.name || "Untitled Workflow"}"? It will be moved to Drafts and stop running.`)) {
        return;
      }
      setTogglingId(wf.id);
      try {
        await unpublishWorkflow(wf.id);
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === wf.id ? { ...w, status: WorkflowStatus.Draft } : w
          )
        );
      } catch (err) {
        console.error("Failed to unpublish workflow:", err);
        alert("Failed to unpublish workflow. Please try again.");
      } finally {
        setTogglingId(null);
      }
    } else {
      setTogglingId(wf.id);
      try {
        const result = await publishWorkflow(wf.id, "user");
        if (result.errors.length > 0) {
          alert("Cannot publish — validation errors:\n" + result.errors.join("\n"));
        } else {
          const updated = await getWorkflow(wf.id);
          setWorkflows((prev) =>
            prev.map((w) => (w.id === wf.id ? updated : w))
          );
        }
      } catch (err) {
        console.error("Failed to publish workflow:", err);
        alert("Failed to publish workflow. Please try again.");
      } finally {
        setTogglingId(null);
      }
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/automations/logs"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Logs
          </Link>
          <Link
            href="/automations/new/builder"
            className="rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"
          >
            + New Workflow
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
          <p className="text-sm text-gray-500">
            No workflows yet. Click &quot;+ New Workflow&quot; to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              href={`/automations/${wf.id}/builder`}
              className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div>
                <h3 className="font-semibold text-gray-900">
                  {wf.name || "Untitled Workflow"}
                </h3>
                <p className="text-sm text-gray-500">
                  Created {new Date(wf.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    wf.status === "published"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {wf.status === "published" ? "Active" : "Draft"}
                </span>
                <button
                  onClick={(e) => handleTogglePublish(e, wf)}
                  disabled={togglingId === wf.id}
                  className={`rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 ${
                    wf.status === "published"
                      ? "text-green-500 hover:bg-orange-50 hover:text-orange-500"
                      : "text-gray-400 hover:bg-green-50 hover:text-green-500"
                  }`}
                  title={wf.status === "published" ? "Unpublish (move to Draft)" : "Publish"}
                >
                  {togglingId === wf.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : wf.status === "published" ? (
                    <PowerOff size={16} />
                  ) : (
                    <Power size={16} />
                  )}
                </button>
                <button
                  onClick={(e) => handleDelete(e, wf.id, wf.name)}
                  disabled={deletingId === wf.id}
                  className="rounded-lg p-2 text-gray-300 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                  title="Delete workflow"
                >
                  {deletingId === wf.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
