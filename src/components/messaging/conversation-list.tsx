"use client";

import { Search, Mail, MessageSquare, Loader2, Inbox } from "lucide-react";
import type { ConversationListItem } from "@/lib/data/conversations";
import { formatRelativeTime, initialsFromName } from "./format";

export type ConversationFilter = "all" | "email" | "sms" | "unread";

interface ConversationListProps {
  items: ConversationListItem[];
  selectedId: string | null;
  filter: ConversationFilter;
  search: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onFilterChange: (filter: ConversationFilter) => void;
  onSearchChange: (value: string) => void;
}

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "unread", label: "Unread" },
];

export function ConversationList({
  items,
  selectedId,
  filter,
  search,
  loading,
  onSelect,
  onFilterChange,
  onSearchChange,
}: ConversationListProps) {
  return (
    <div className="flex h-full w-full flex-col border-r border-[#e7e7ea] bg-white">
      {/* Search */}
      <div className="border-b border-[#f0f0f2] p-3">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.8}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-lg border border-[#e7e7ea] bg-white py-2 pl-9 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </div>
        {/* Filter tabs */}
        <div className="mt-2.5 flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                filter === f.key
                  ? "bg-[#efe7fb] text-[#5b21b6]"
                  : "text-zinc-500 hover:bg-black/[0.045]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={22} strokeWidth={1.8} className="animate-spin text-[#6c2bd9]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Inbox size={30} strokeWidth={1.6} className="mb-3 text-zinc-300" />
            <p className="text-[13px] font-medium text-zinc-600">No conversations</p>
            <p className="mt-1 text-[12px] text-zinc-400">
              {search || filter !== "all"
                ? "Try a different search or filter."
                : "Inbound replies and new messages will appear here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f4f4f5]">
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              const unread = item.unread_count > 0;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${
                      isSelected ? "bg-[#f4eefc]" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6c2bd9]/10 text-[11px] font-semibold text-[#5b21b6]">
                        {initialsFromName(item.contact_name)}
                      </div>
                      {unread && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#6c2bd9] ring-2 ring-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-[13px] ${
                            unread ? "font-semibold text-zinc-900" : "font-medium text-zinc-800"
                          }`}
                        >
                          {item.contact_name}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                          {formatRelativeTime(item.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {item.last_message_channel === "email" ? (
                          <Mail size={12} strokeWidth={1.8} className="shrink-0 text-zinc-400" />
                        ) : item.last_message_channel === "sms" ? (
                          <MessageSquare
                            size={12}
                            strokeWidth={1.8}
                            className="shrink-0 text-zinc-400"
                          />
                        ) : null}
                        <span
                          className={`truncate text-[12px] ${
                            unread ? "text-zinc-600" : "text-zinc-400"
                          }`}
                        >
                          {item.last_message_direction === "outbound" && "You: "}
                          {item.last_message_preview ?? "No preview"}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
