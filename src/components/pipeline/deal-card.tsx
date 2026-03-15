"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import type { Deal } from "@/types/crm";

interface DealCardProps {
  deal: Deal;
  contactName: string | null;
  ownerInitials: string | null;
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

export function DealCard({ deal, contactName, ownerInitials, onDelete }: DealCardProps) {
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
      className={`group rounded-lg border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging
          ? "opacity-50 shadow-lg border-[#6C2BD9]/30"
          : "border-gray-200 hover:shadow-md hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-gray-900 leading-tight">
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
            className="shrink-0 rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
            title="Delete deal"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {contactName && (
        <p className="mt-1 text-xs text-gray-500">{contactName}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-600">
          {formatCurrency(deal.value)}
        </span>
        {ownerInitials && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F3EAFD] text-[10px] font-medium text-[#6C2BD9]">
            {ownerInitials}
          </span>
        )}
      </div>
    </div>
  );
}
