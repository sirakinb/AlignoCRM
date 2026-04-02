"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  getPurpleScaleColor,
  withAlpha,
} from "@/lib/design/aligno-theme";
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
  const accentColor = getPurpleScaleColor(stage.position);

  return (
    <div
      className={`aligno-panel flex w-72 flex-shrink-0 flex-col overflow-hidden rounded-2xl transition-colors ${
        isOver ? "aligno-glow" : ""
      }`}
      style={{
        borderColor: isOver
          ? withAlpha(accentColor, 0.34)
          : withAlpha(accentColor, 0.18),
      }}
    >
      {/* Color strip */}
      <div
        className="h-1.5 rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, ${withAlpha(accentColor, 0.65)})`,
        }}
      />

      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#33254F]">
              {stage.name}
            </h3>
            <span
              className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium"
              style={{
                backgroundColor: withAlpha(accentColor, 0.14),
                color: accentColor,
              }}
            >
              {deals.length}
            </span>
          </div>
        </div>
        <p className="mt-0.5 text-xs font-medium" style={{ color: accentColor }}>
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
              accentColor={accentColor}
              onDelete={onDeleteDeal}
            />
          ))}
          {deals.length === 0 && (
            <div
              className="aligno-panel-soft flex items-center justify-center rounded-xl border-2 border-dashed py-6 text-xs text-[#8D88A0]"
              style={{ borderColor: withAlpha(accentColor, 0.18) }}
            >
              Drop deals here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
