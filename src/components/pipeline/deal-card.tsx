"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import type { Deal } from "@/types/crm";

interface DealCardProps {
  deal: Deal;
  contactName: string | null;
  ownerInitials: string | null;
  accentColor?: string;
  onDelete?: (dealId: string) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function DealCard({
  deal,
  contactName,
  ownerInitials,
  accentColor = getPurpleScaleColor(3),
  onDelete,
}: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const cardStyle = {
    ...style,
    borderColor: withAlpha(accentColor, isDragging ? 0.28 : 0.16),
    boxShadow: isDragging
      ? `0 16px 30px ${withAlpha(accentColor, 0.16)}`
      : `0 10px 20px ${withAlpha(accentColor, 0.08)}`,
  };

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      {...attributes}
      {...listeners}
      className={`aligno-panel-soft group cursor-grab rounded-xl border p-3 active:cursor-grabbing transition-shadow ${
        isDragging
          ? "opacity-50 shadow-lg"
          : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium leading-tight text-[#21173A]">
          {deal.title}
        </p>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete(deal.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/70"
            style={{ color: withAlpha(accentColor, 0.6) }}
            title="Delete deal"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {contactName && (
        <p className="mt-1 text-xs text-[#6B6481]">{contactName}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: accentColor }}>
          {formatCurrency(deal.value)}
        </span>
        {ownerInitials && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium"
            style={{
              backgroundColor: withAlpha(accentColor, 0.14),
              color: accentColor,
            }}
          >
            {ownerInitials}
          </span>
        )}
      </div>
    </div>
  );
}
