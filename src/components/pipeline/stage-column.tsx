"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { getPurpleScaleColor } from "@/lib/design/aligno-theme";
import type { Deal, Stage } from "@/types/crm";
import { DealCard } from "./deal-card";

interface StageColumnProps {
  stage: Stage;
  deals: Deal[];
  getContactName: (contactId: string | null) => string | null;
  getOwnerInitials: (ownerId: string | null) => string | null;
  onDeleteDeal?: (dealId: string) => void;
  onEditDeal?: (dealId: string) => void;
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
  onEditDeal,
}: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);
  const accentColor = getPurpleScaleColor(stage.position);

  return (
    <div
      className={`flex w-72 flex-shrink-0 flex-col rounded-xl border transition-colors duration-150 ${
        isOver
          ? "border-[#dcdce1] bg-[#f4f4f5]"
          : "border-[#ececef] bg-[#fafafa]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <h3 className="truncate text-[13px] font-medium text-zinc-800">
          {stage.name}
        </h3>
        <span className="text-xs text-zinc-400 tabular-nums">
          {deals.length}
        </span>
        <span className="ml-auto text-xs text-zinc-400 tabular-nums">
          {formatCurrency(totalValue)}
        </span>
      </div>

      {/* Deal cards */}
      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex-1 space-y-2 px-2.5 pb-2.5 min-h-[60px]"
        >
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              contactName={getContactName(deal.contact_id)}
              ownerInitials={getOwnerInitials(deal.owner_id)}
              accentColor={accentColor}
              onDelete={onDeleteDeal}
              onEdit={onEditDeal}
            />
          ))}
          {deals.length === 0 && (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-[#e7e7ea] py-6 text-xs text-zinc-400">
              Drop deals here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
