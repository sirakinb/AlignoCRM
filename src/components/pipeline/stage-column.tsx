"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Deal, Stage } from "@/types/crm";
import { DealCard } from "./deal-card";

interface StageColumnProps {
  stage: Stage;
  deals: Deal[];
  getContactName: (contactId: string | null) => string | null;
  getOwnerInitials: (ownerId: string | null) => string | null;
  onDeleteDeal?: (dealId: string) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function StageColumn({
  stage,
  deals,
  getContactName,
  getOwnerInitials,
  onDeleteDeal,
}: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);

  return (
    <div
      className={`flex w-72 flex-shrink-0 flex-col rounded-xl bg-gray-50 border transition-colors ${
        isOver
          ? "border-[#6C2BD9]/30 bg-purple-50/30"
          : "border-gray-200/60"
      }`}
    >
      {/* Color strip */}
      <div
        className="h-1 rounded-t-xl"
        style={{ backgroundColor: stage.color ?? "#6B7280" }}
      />

      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {stage.name}
            </h3>
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-200/80 px-1.5 text-[11px] font-medium text-gray-600">
              {deals.length}
            </span>
          </div>
        </div>
        <p className="mt-0.5 text-xs text-gray-400 font-medium">
          {formatCurrency(totalValue)}
        </p>
      </div>

      {/* Deal cards */}
      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex-1 space-y-2 px-3 pb-3 min-h-[60px]"
        >
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              contactName={getContactName(deal.contact_id)}
              ownerInitials={getOwnerInitials(deal.owner_id)}
              onDelete={onDeleteDeal}
            />
          ))}
          {deals.length === 0 && (
            <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-6 text-xs text-gray-400">
              Drop deals here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
