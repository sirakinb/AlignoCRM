"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ALIGNO_PURPLE_SCALE } from "@/lib/design/aligno-theme";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { PipelineSelector } from "@/components/pipeline/pipeline-selector";
import {
  Plus,
  X,
  Loader2,
  DollarSign,
  User,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  LayoutGrid,
} from "lucide-react";
import type { Pipeline, Stage, Deal, Contact } from "@/types/crm";

const DEFAULT_STAGE_COLORS = [...ALIGNO_PURPLE_SCALE];

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await fetch("/api/pipelines");
  if (!res.ok) throw new Error("Failed to load pipelines");
  const json = await res.json();
  return json.pipelines;
}

async function fetchStages(pipelineId: string): Promise<Stage[]> {
  const res = await fetch(
    `/api/pipelines?pipelineId=${pipelineId}`
  );
  if (!res.ok) throw new Error("Failed to load stages");
  const json = await res.json();
  return json.stages;
}

async function fetchDeals(): Promise<Deal[]> {
  const res = await fetch("/api/deals");
  if (!res.ok) throw new Error("Failed to load deals");
  const json = await res.json();
  return json.deals;
}

async function fetchContacts(): Promise<Contact[]> {
  const res = await fetch("/api/contacts");
  if (!res.ok) throw new Error("Failed to load contacts");
  const json = await res.json();
  return json.contacts;
}

async function seedDefaultPipeline(): Promise<void> {
  const res = await fetch("/api/pipelines/seed", {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to seed pipeline");
}

async function apiMoveDeal(dealId: string, stageId: string): Promise<void> {
  const res = await fetch("/api/deals/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, stageId, userId: "user" }),
  });
  if (!res.ok) throw new Error("Failed to move deal");
}

async function apiCreateDeal(input: {
  title: string;
  value: number;
  contact_id: string | null;
  pipeline_id: string;
  stage_id: string;
}): Promise<Deal> {
  const res = await fetch("/api/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to create deal");
  const json = await res.json();
  return json.deal;
}

async function apiDeleteDeal(dealId: string): Promise<void> {
  const res = await fetch(`/api/deals?id=${dealId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete deal");
}

async function apiCreatePipeline(input: {
  name: string;
  stages: { name: string; color: string }[];
}): Promise<{ pipeline: Pipeline; stages: Stage[] }> {
  const res = await fetch("/api/pipelines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      stages: input.stages,
    }),
  });
  if (!res.ok) throw new Error("Failed to create pipeline");
  return res.json();
}

// ---------------------------------------------------------------------------
// Create Pipeline Modal
// ---------------------------------------------------------------------------

interface CreatePipelineModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (pipeline: Pipeline, stages: Stage[]) => void;
}

function CreatePipelineModal({
  open,
  onClose,
  onCreated,
}: CreatePipelineModalProps) {
  const [name, setName] = useState("");
  const [stageInputs, setStageInputs] = useState([
    { name: "", color: DEFAULT_STAGE_COLORS[0] },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStage = () => {
    const color =
      DEFAULT_STAGE_COLORS[stageInputs.length % DEFAULT_STAGE_COLORS.length];
    setStageInputs((prev) => [...prev, { name: "", color }]);
  };

  const removeStage = (index: number) => {
    if (stageInputs.length <= 1) return;
    setStageInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: "name" | "color", value: string) => {
    setStageInputs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Pipeline name is required");
      return;
    }
    const validStages = stageInputs.filter((s) => s.name.trim());
    if (validStages.length === 0) {
      setError("Add at least one stage");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { pipeline, stages } = await apiCreatePipeline({
        name: name.trim(),
        stages: validStages.map((s) => ({
          name: s.name.trim(),
          color: s.color,
        })),
      });
      onCreated(pipeline, stages);
      // Reset
      setName("");
      setStageInputs([{ name: "", color: DEFAULT_STAGE_COLORS[0] }]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pipeline");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-xl border border-[#e7e7ea] bg-white shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)]">
        <div className="flex items-center justify-between border-b border-[#e7e7ea] px-6 py-4">
          <h2 className="text-[15px] font-semibold text-zinc-900">New Pipeline</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
              Pipeline Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Pipeline"
              className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-zinc-700 mb-2">
              Stages <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {stageInputs.map((stage, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => updateStage(i, "color", e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-[#e7e7ea] p-0.5"
                  />
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => updateStage(i, "name", e.target.value)}
                    placeholder={`Stage ${i + 1}`}
                    className="flex-1 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                  />
                  {stageInputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStage(i)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStage}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#6c2bd9] hover:text-[#5b21b6] transition-colors"
            >
              <Plus size={12} />
              Add stage
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#e7e7ea] bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create Pipeline
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Currency formatter
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Create Deal Modal
// ---------------------------------------------------------------------------

interface CreateDealModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (deal: Deal) => void;
  pipelines: Pipeline[];
  stages: Stage[];
  contacts: Contact[];
  selectedPipelineId: string;
  onPipelineChangeForStages: (pipelineId: string) => Promise<Stage[]>;
}

function CreateDealModal({
  open,
  onClose,
  onCreated,
  pipelines,
  stages: initialStages,
  contacts,
  selectedPipelineId,
  onPipelineChangeForStages,
}: CreateDealModalProps) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contactId, setContactId] = useState("");
  const [pipelineId, setPipelineId] = useState(selectedPipelineId);
  const [stageId, setStageId] = useState(initialStages[0]?.id ?? "");
  const [modalStages, setModalStages] = useState<Stage[]>(initialStages);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update when stages from parent change
  useEffect(() => {
    setModalStages(initialStages);
    if (pipelineId === selectedPipelineId) {
      setStageId(initialStages[0]?.id ?? "");
    }
  }, [initialStages, pipelineId, selectedPipelineId]);

  // Update pipeline selection when parent changes
  useEffect(() => {
    setPipelineId(selectedPipelineId);
  }, [selectedPipelineId]);

  const handlePipelineChange = async (newPipelineId: string) => {
    setPipelineId(newPipelineId);
    try {
      const newStages = await onPipelineChangeForStages(newPipelineId);
      setModalStages(newStages);
      setStageId(newStages[0]?.id ?? "");
    } catch {
      // Keep existing stages on error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Deal name is required");
      return;
    }
    if (!stageId) {
      setError("Please select a stage");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const deal = await apiCreateDeal({
        title: title.trim(),
        value: parseFloat(value) || 0,
        contact_id: contactId || null,
        pipeline_id: pipelineId,
        stage_id: stageId,
      });
      onCreated(deal);
      // Reset form
      setTitle("");
      setValue("");
      setContactId("");
      setStageId(initialStages[0]?.id ?? "");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-xl border border-[#e7e7ea] bg-white shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e7e7ea] px-6 py-4">
          <h2 className="text-[15px] font-semibold text-zinc-900">New Deal</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Deal Name */}
          <div>
            <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
              Deal Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Corp - Enterprise License"
              className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Value */}
          <div>
            <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
              Deal Value
            </label>
            <div className="relative">
              <DollarSign
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                min="0"
                step="100"
                className="w-full rounded-lg border border-[#e7e7ea] bg-white pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
              Contact
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[#e7e7ea] bg-white pl-9 pr-8 py-2 text-sm text-zinc-900 focus:outline-none transition-colors"
              >
                <option value="">No contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pipeline & Stage side-by-side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
                Pipeline
              </label>
              <select
                value={pipelineId}
                onChange={(e) => handlePipelineChange(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none transition-colors"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
                Stage
              </label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none transition-colors"
              >
                {modalStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#e7e7ea] bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create Deal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatePipelineModal, setShowCreatePipelineModal] = useState(false);
  const [moveErrors, setMoveErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const contactMapRef = useRef<Map<string, Contact>>(new Map());
  const selectedPipelineIdRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Load pipelines first
        let pipelineList = await fetchPipelines();

        // If no pipelines exist, seed default ones
        if (pipelineList.length === 0) {
          await seedDefaultPipeline();
          pipelineList = await fetchPipelines();
        }

        if (cancelled) return;

        setPipelines(pipelineList);

        const requestedPipelineId =
          new URLSearchParams(window.location.search).get("pipelineId") ??
          window.localStorage.getItem("aligno:selectedPipelineId");
        const initialPipelineId =
          pipelineList.find((pipeline) => pipeline.id === requestedPipelineId)?.id ??
          pipelineList[0]?.id;
        if (!initialPipelineId) {
          setError("No pipelines available");
          setLoading(false);
          return;
        }

        setSelectedPipelineId(initialPipelineId);
        selectedPipelineIdRef.current = initialPipelineId;
        window.localStorage.setItem("aligno:selectedPipelineId", initialPipelineId);

        // Load stages, deals, and contacts in parallel
        const [stageList, dealList, contactList] = await Promise.all([
          fetchStages(initialPipelineId),
          fetchDeals(),
          fetchContacts(),
        ]);

        if (cancelled) return;

        setStages(stageList);
        setDeals(dealList);
        setContacts(contactList);

        // Build contact lookup map
        const map = new Map<string, Contact>();
        contactList.forEach((c) => map.set(c.id, c));
        contactMapRef.current = map;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load pipeline data"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Pipeline selection change
  // -------------------------------------------------------------------------

  const handlePipelineChange = useCallback(
    async (pipelineId: string) => {
      setSelectedPipelineId(pipelineId);
      selectedPipelineIdRef.current = pipelineId;
      window.localStorage.setItem("aligno:selectedPipelineId", pipelineId);
      router.replace(`/pipeline?pipelineId=${pipelineId}`, { scroll: false });

      try {
        const stageList = await fetchStages(pipelineId);
        setStages(stageList);
      } catch (err) {
        console.error("Failed to load stages for pipeline:", err);
      }
    },
    [router]
  );

  // -------------------------------------------------------------------------
  // Move deal (persist to DB)
  // -------------------------------------------------------------------------

  const handleMoveDeal = useCallback(
    async (dealId: string, newStageId: string) => {
      try {
        await apiMoveDeal(dealId, newStageId);
        // Update local deals state to keep in sync
        setDeals((prev) =>
          prev.map((d) =>
            d.id === dealId ? { ...d, stage_id: newStageId } : d
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to move deal";
        setMoveErrors((prev) => [...prev, msg]);

        // Auto-dismiss error after 4 seconds
        setTimeout(() => {
          setMoveErrors((prev) => prev.slice(1));
        }, 4000);

        // Refetch deals to revert optimistic update
        try {
          const dealList = await fetchDeals();
          setDeals(dealList);
        } catch {
          // Silently fail on refetch
        }
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Contact name lookup for kanban cards
  // -------------------------------------------------------------------------

  const getContactName = useCallback((contactId: string | null) => {
    if (!contactId) return null;
    const contact = contactMapRef.current.get(contactId);
    return contact ? `${contact.first_name} ${contact.last_name}` : null;
  }, []);

  const getOwnerInitials = useCallback((_ownerId: string | null) => {
    // Owner details are not loaded in this version; return null
    return null;
  }, []);

  // -------------------------------------------------------------------------
  // Deal created callback
  // -------------------------------------------------------------------------

  const handleDealCreated = useCallback((deal: Deal) => {
    setDeals((prev) => [deal, ...prev]);
  }, []);

  const handleDeleteDeal = useCallback(async (dealId: string) => {
    try {
      await apiDeleteDeal(dealId);
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
    } catch (err) {
      console.error("Failed to delete deal:", err);
    }
  }, []);

  const handleEditDeal = useCallback((dealId: string) => {
    const pipelineId = selectedPipelineIdRef.current ?? selectedPipelineId;
    router.push(
      pipelineId
        ? `/pipeline/${dealId}?pipelineId=${pipelineId}`
        : `/pipeline/${dealId}`
    );
  }, [router, selectedPipelineId]);

  useEffect(() => {
    selectedPipelineIdRef.current = selectedPipelineId;
  }, [selectedPipelineId]);

  const handlePipelineCreated = useCallback(
    (pipeline: Pipeline, newStages: Stage[]) => {
      setPipelines((prev) => [...prev, pipeline]);
      setSelectedPipelineId(pipeline.id);
      selectedPipelineIdRef.current = pipeline.id;
      window.localStorage.setItem("aligno:selectedPipelineId", pipeline.id);
      router.replace(`/pipeline?pipelineId=${pipeline.id}`, { scroll: false });
      setStages(newStages);
    },
    [router]
  );

  // -------------------------------------------------------------------------
  // Fetch stages for modal pipeline switch
  // -------------------------------------------------------------------------

  const fetchStagesForModal = useCallback(
    async (pipelineId: string): Promise<Stage[]> => {
      return fetchStages(pipelineId);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Refresh data
  // -------------------------------------------------------------------------

  const handleRefresh = useCallback(async () => {
    if (!selectedPipelineId) return;
    setRefreshing(true);
    try {
      const [stageList, dealList] = await Promise.all([
        fetchStages(selectedPipelineId),
        fetchDeals(),
      ]);
      setStages(stageList);
      setDeals(dealList);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedPipelineId]);

  // -------------------------------------------------------------------------
  // Computed values
  // -------------------------------------------------------------------------

  const pipelineDeals = deals.filter(
    (d) => d.pipeline_id === selectedPipelineId
  );
  const openDeals = pipelineDeals.filter((d) => d.status === "open");
  const totalPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-zinc-200" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-[#6c2bd9] border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-medium text-zinc-700">
            Loading pipeline...
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Setting up your deal board
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-red-50 p-3">
          <AlertCircle size={24} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-medium text-zinc-900">
            Something went wrong
          </p>
          <p className="mt-1 text-[13px] text-zinc-500">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col bg-[#f7f7f8]">
      {/* Move error toasts */}
      {moveErrors.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {moveErrors.map((msg, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 shadow-lg animate-in slide-in-from-right"
            >
              <AlertCircle size={16} className="shrink-0" />
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-[#e7e7ea] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">Pipeline</h1>
            {pipelines.length > 0 && selectedPipelineId && (
              <PipelineSelector
                pipelines={pipelines}
                selectedId={selectedPipelineId}
                onChange={handlePipelineChange}
              />
            )}
            <button
              onClick={() => setShowCreatePipelineModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Plus size={14} />
              New Pipeline
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Pipeline stats */}
            <div className="hidden sm:flex items-center gap-4 mr-2">
              <div className="flex items-center gap-1.5 text-[13px] text-zinc-500">
                <TrendingUp size={14} strokeWidth={1.8} className="text-zinc-400" />
                <span className="font-medium text-zinc-800 tabular-nums">
                  {formatCurrency(totalPipelineValue)}
                </span>
                <span className="text-zinc-400">in pipeline</span>
              </div>
              <div className="h-4 w-px bg-[#e7e7ea]" />
              <span className="text-[13px] text-zinc-500 tabular-nums">
                {openDeals.length} open{" "}
                {openDeals.length === 1 ? "deal" : "deals"}
              </span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] transition-colors"
            >
              <Plus size={16} />
              Add Deal
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        {stages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-[#efe7fb] p-3">
              <LayoutGrid size={24} strokeWidth={1.8} className="text-[#5b21b6]" />
            </div>
            <p className="text-[13px] font-medium text-zinc-800">
              No stages configured
            </p>
            <p className="text-[13px] text-zinc-500">
              This pipeline doesn&apos;t have any stages yet.
            </p>
          </div>
        ) : (
          <KanbanBoard
            key={selectedPipelineId}
            stages={stages}
            initialDeals={pipelineDeals}
            getContactName={getContactName}
            getOwnerInitials={getOwnerInitials}
            onMoveDeal={handleMoveDeal}
            onDeleteDeal={handleDeleteDeal}
            onEditDeal={handleEditDeal}
          />
        )}
      </div>

      {/* Create Deal Modal */}
      <CreateDealModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleDealCreated}
        pipelines={pipelines}
        stages={stages}
        contacts={contacts}
        selectedPipelineId={selectedPipelineId ?? ""}
        onPipelineChangeForStages={fetchStagesForModal}
      />

      {/* Create Pipeline Modal */}
      <CreatePipelineModal
        open={showCreatePipelineModal}
        onClose={() => setShowCreatePipelineModal(false)}
        onCreated={handlePipelineCreated}
      />

    </div>
  );
}
