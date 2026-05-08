"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import type { Deal, Stage } from "@/types/crm";
import { StageColumn } from "./stage-column";

interface KanbanBoardProps {
  stages: Stage[];
  initialDeals: Deal[];
  getContactName: (contactId: string | null) => string | null;
  getOwnerInitials: (ownerId: string | null) => string | null;
  onMoveDeal?: (dealId: string, newStageId: string) => void;
  onDeleteDeal?: (dealId: string) => void;
  onEditDeal?: (dealId: string) => void;
}

export function KanbanBoard({
  stages,
  initialDeals,
  getContactName,
  getOwnerInitials,
  onMoveDeal,
  onDeleteDeal,
  onEditDeal,
}: KanbanBoardProps) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const originalStageRef = useRef<string | null>(null);

  // Sync with parent when initialDeals changes (e.g. new deal created, deal deleted)
  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const findStageForDeal = useCallback(
    (dealId: string): string | undefined => {
      return deals.find((d) => d.id === dealId)?.stage_id;
    },
    [deals]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = event.active.id as string;
      const stageId = findStageForDeal(activeId);
      originalStageRef.current = stageId ?? null;
    },
    [findStageForDeal]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeStageId = findStageForDeal(activeId);

      // Check if we're over a stage column directly
      const isOverStage = stages.some((s) => s.id === overId);
      const overStageId = isOverStage ? overId : findStageForDeal(overId);

      if (!activeStageId || !overStageId || activeStageId === overStageId) return;

      setDeals((prev) =>
        prev.map((deal) =>
          deal.id === activeId ? { ...deal, stage_id: overStageId } : deal
        )
      );
    },
    [findStageForDeal, stages]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const isOverStage = stages.some((s) => s.id === overId);
      const finalStageId = isOverStage ? overId : findStageForDeal(overId);

      if (!finalStageId) return;

      // Update local state to ensure consistency
      setDeals((prev) =>
        prev.map((d) =>
          d.id === activeId ? { ...d, stage_id: finalStageId } : d
        )
      );

      // Only call onMoveDeal if the stage actually changed from the original
      const originalStage = originalStageRef.current;
      if (originalStage && originalStage !== finalStageId) {
        onMoveDeal?.(activeId, finalStageId);
      }

      originalStageRef.current = null;
    },
    [stages, findStageForDeal, onMoveDeal]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-5 overflow-x-auto pb-6">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            deals={deals.filter((d) => d.stage_id === stage.id)}
            getContactName={getContactName}
            getOwnerInitials={getOwnerInitials}
            onDeleteDeal={onDeleteDeal}
            onEditDeal={onEditDeal}
          />
        ))}
      </div>
    </DndContext>
  );
}
