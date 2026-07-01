"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Pencil, User, Banknote } from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import type { Deal } from "@/types/crm";

interface DealCardProps {
  deal: Deal;
  contactName: string | null;
  ownerInitials: string | null;
  accentColor?: string;
  onDelete?: (dealId: string) => void;
  onEdit?: (dealId: string) => void;
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
  onEdit,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit?.(deal.id)}
      className={`group cursor-grab rounded-lg border bg-white p-3 active:cursor-grabbing transition-[border-color,box-shadow] duration-150 ${
        isDragging
          ? "rotate-1 border-[#dcdce1] opacity-60 shadow-md"
          : "border-[#e7e7ea] shadow-[0_1px_2px_rgba(17,17,26,0.05)] hover:border-[#dcdce1]"
      }`}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onEdit) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(deal.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-[13px] font-medium leading-snug text-zinc-900">
          {deal.title}
        </p>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit(deal.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
              title="View lead information"
            >
              <Pencil size={12} strokeWidth={1.8} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete(deal.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
              title="Delete deal"
            >
              <Trash2 size={12} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Banknote size={14} strokeWidth={1.8} className="text-zinc-400" />
          <span className="tabular-nums">{formatCurrency(deal.value)}</span>
        </div>
        {contactName && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <User size={14} strokeWidth={1.8} className="text-zinc-400" />
            <span className="truncate">{contactName}</span>
          </div>
        )}
      </div>

      {ownerInitials && (
        <div className="mt-2 flex justify-end">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-medium"
            style={{
              backgroundColor: withAlpha(accentColor, 0.1),
              color: accentColor,
            }}
          >
            {ownerInitials}
          </span>
        </div>
      )}
    </div>
  );
}
