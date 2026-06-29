"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { mutate } from "swr";
import {
  getPurpleScaleColor,
  withAlpha,
} from "@/lib/design/aligno-theme";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { PipelineSelector } from "@/components/pipeline/pipeline-selector";
import { CreatePipelineModal } from "@/components/pipeline/create-pipeline-modal";
import { CreateDealModal } from "@/components/pipeline/create-deal-modal";
import { EditDealModal } from "@/components/pipeline/edit-deal-modal";
import {
  deleteDeal,
  fetchStages,
  moveDeal,
  seedDefaultPipeline,
} from "@/lib/api/crm";
import { swrKeys } from "@/lib/api/swr-keys";
import { formatCurrency } from "@/lib/format/currency";
import {
  useContacts,
  useDeals,
  usePipelines,
  useStages,
} from "@/hooks/use-crm-data";
import {
  Plus,
  Loader2,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  LayoutGrid,
} from "lucide-react";
import type { Deal, Pipeline, Stage, Contact } from "@/types/crm";

export default function PipelinePage() {
  const {
    data: pipelines = [],
    error: pipelinesError,
    isLoading: pipelinesLoading,
    mutate: mutatePipelines,
  } = usePipelines();
  const { data: deals = [], mutate: mutateDealsList } = useDeals();
  const { data: contacts = [] } = useContacts();

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  );
  const [seeding, setSeeding] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatePipelineModal, setShowCreatePipelineModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [moveErrors, setMoveErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const contactMapRef = useRef<Map<string, Contact>>(new Map());
  const seededRef = useRef(false);

  const {
    data: stages = [],
    mutate: mutateStages,
  } = useStages(selectedPipelineId);

  useEffect(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    contactMapRef.current = map;
  }, [contacts]);

  useEffect(() => {
    if (pipelinesLoading || seeding) return;

    if (pipelines.length === 0 && !seededRef.current) {
      seededRef.current = true;
      setSeeding(true);
      seedDefaultPipeline()
        .then(() => mutatePipelines())
        .catch((err) => console.error("Failed to seed pipeline:", err))
        .finally(() => setSeeding(false));
      return;
    }

    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [pipelines, pipelinesLoading, seeding, selectedPipelineId, mutatePipelines]);

  const handlePipelineChange = useCallback((pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
  }, []);

  const handleMoveDeal = useCallback(
    async (dealId: string, newStageId: string) => {
      const previousDeals = deals;

      await mutateDealsList(
        (current) =>
          (current ?? []).map((d) =>
            d.id === dealId ? { ...d, stage_id: newStageId } : d
          ),
        { revalidate: false }
      );

      try {
        await moveDeal(dealId, newStageId);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to move deal";
        setMoveErrors((prev) => [...prev, msg]);
        setTimeout(() => {
          setMoveErrors((prev) => prev.slice(1));
        }, 4000);
        await mutateDealsList(previousDeals, { revalidate: false });
      }
    },
    [deals, mutateDealsList]
  );

  const getContactName = useCallback((contactId: string | null) => {
    if (!contactId) return null;
    const contact = contactMapRef.current.get(contactId);
    return contact ? `${contact.first_name} ${contact.last_name}` : null;
  }, []);

  const getOwnerInitials = useCallback((_ownerId: string | null) => null, []);

  const handleDealCreated = useCallback(
    (deal: Deal) => {
      void mutateDealsList((current) => [deal, ...(current ?? [])], {
        revalidate: false,
      });
    },
    [mutateDealsList]
  );

  const handleDeleteDeal = useCallback(
    async (dealId: string) => {
      try {
        await deleteDeal(dealId);
        void mutateDealsList(
          (current) => (current ?? []).filter((d) => d.id !== dealId),
          { revalidate: false }
        );
      } catch (err) {
        console.error("Failed to delete deal:", err);
      }
    },
    [mutateDealsList]
  );

  const handleEditDeal = useCallback(
    (dealId: string) => {
      const deal = deals.find((d) => d.id === dealId) ?? null;
      setEditingDeal(deal);
    },
    [deals]
  );

  const handleDealUpdated = useCallback(
    (updated: Deal) => {
      void mutateDealsList(
        (current) =>
          (current ?? []).map((d) => (d.id === updated.id ? updated : d)),
        { revalidate: false }
      );
    },
    [mutateDealsList]
  );

  const handlePipelineCreated = useCallback(
    (pipeline: Pipeline, newStages: Stage[]) => {
      void mutatePipelines([...pipelines, pipeline], { revalidate: false });
      void mutate(swrKeys.stages(pipeline.id), newStages, { revalidate: false });
      setSelectedPipelineId(pipeline.id);
    },
    [pipelines, mutatePipelines]
  );

  const fetchStagesForModal = useCallback(
    (pipelineId: string) => fetchStages(pipelineId),
    []
  );

  const handleRefresh = useCallback(async () => {
    if (!selectedPipelineId) return;
    setRefreshing(true);
    try {
      await Promise.all([mutateStages(), mutateDealsList()]);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedPipelineId, mutateStages, mutateDealsList]);

  const pipelineDeals = useMemo(
    () => deals.filter((d) => d.pipeline_id === selectedPipelineId),
    [deals, selectedPipelineId]
  );
  const openDeals = pipelineDeals.filter((d) => d.status === "open");
  const totalPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);

  const loading = pipelinesLoading || seeding;
  const error = pipelinesError
    ? pipelinesError instanceof Error
      ? pipelinesError.message
      : "Failed to load pipeline data"
    : !loading && pipelines.length === 0
      ? "No pipelines available"
      : null;

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-gray-200" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-[#6C2BD9] border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            Loading pipeline...
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Setting up your deal board
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-red-50 p-3">
          <AlertCircle size={24} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">
            Something went wrong
          </p>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="aligno-page-surface flex h-full flex-col">
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

      <div className="border-b border-[#E6DCF9] bg-white/85 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-[#21173A]">Pipeline</h1>
            {pipelines.length > 0 && selectedPipelineId && (
              <PipelineSelector
                pipelines={pipelines}
                selectedId={selectedPipelineId}
                onChange={handlePipelineChange}
              />
            )}
            <button
              onClick={() => setShowCreatePipelineModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors"
              style={{
                borderColor: withAlpha(getPurpleScaleColor(2), 0.34),
                color: "#6B6481",
              }}
            >
              <Plus size={14} />
              New Pipeline
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-4 mr-2">
              <div className="flex items-center gap-1.5 text-sm text-[#6B6481]">
                <TrendingUp
                  size={14}
                  style={{ color: getPurpleScaleColor(4) }}
                />
                <span className="font-medium text-[#33254F]">
                  {formatCurrency(totalPipelineValue)}
                </span>
                <span className="text-[#8D88A0]">in pipeline</span>
              </div>
              <div className="h-4 w-px bg-[#E6DCF9]" />
              <span className="text-sm text-[#6B6481]">
                {openDeals.length} open{" "}
                {openDeals.length === 1 ? "deal" : "deals"}
              </span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg p-2 text-[#8D88A0] hover:bg-[#F5EEFF] hover:text-[#6F43BF] disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(5)})`,
              }}
            >
              <Plus size={16} />
              Add Deal
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        {stages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-[#F1E8FF] p-3">
              <LayoutGrid size={24} className="text-[#8A5DDE]" />
            </div>
            <p className="text-sm font-medium text-[#33254F]">
              No stages configured
            </p>
            <p className="text-sm text-[#6B6481]">
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

      <CreatePipelineModal
        open={showCreatePipelineModal}
        onClose={() => setShowCreatePipelineModal(false)}
        onCreated={handlePipelineCreated}
      />

      <EditDealModal
        deal={editingDeal}
        onClose={() => setEditingDeal(null)}
        onUpdated={handleDealUpdated}
        contacts={contacts}
      />
    </div>
  );
}
