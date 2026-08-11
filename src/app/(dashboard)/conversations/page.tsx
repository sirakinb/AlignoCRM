"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useDeferredValue,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import type { MessageChannel } from "@/types/messaging";
import type {
  ConversationDetail,
  ConversationListItem,
} from "@/lib/data/conversations";
import {
  ConversationList,
  type ConversationFilter,
} from "@/components/messaging/conversation-list";
import { ThreadView } from "@/components/messaging/thread-view";

/** Broadcast so the sidebar unread badge refreshes without a reload. */
function pingUnreadBadge() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("aligno:unread-refresh"));
  }
}

export default function ConversationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact");

  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Fire mark-read at most once per opened thread (P3-11).
  const markedReadFor = useRef<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      setListError(null);
      const params = new URLSearchParams();
      if (filter === "email" || filter === "sms") params.set("channel", filter);
      if (filter === "unread") params.set("unread", "true");
      if (deferredSearch.trim()) params.set("q", deferredSearch.trim());

      const res = await fetch(`/api/conversations?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load conversations");
      setItems((payload.conversations as ConversationListItem[]) ?? []);
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setListError("Failed to load conversations.");
    } finally {
      setListLoading(false);
    }
  }, [filter, deferredSearch]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load thread");
      const payload = (await res.json()) as ConversationDetail;
      setDetail(payload);

      // Mark read once per open, then reflect it locally + refresh the badge.
      if (markedReadFor.current !== id && payload.conversation.unread_count > 0) {
        markedReadFor.current = id;
        await fetch(`/api/conversations/${id}/read`, { method: "POST" }).catch(
          () => {}
        );
        setItems((prev) =>
          prev.map((it) => (it.id === id ? { ...it, unread_count: 0 } : it))
        );
        pingUnreadBadge();
      }
    } catch (err) {
      console.error("Failed to load thread:", err);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      markedReadFor.current = null;
      setSelectedId(id);
      loadDetail(id);
    },
    [selectedId, loadDetail]
  );

  // Deep link: /conversations?contact=<id> → resolve (find-or-create) and open.
  const resolvedContact = useRef<string | null>(null);
  useEffect(() => {
    if (!contactParam || resolvedContact.current === contactParam) return;
    resolvedContact.current = contactParam;
    (async () => {
      try {
        const res = await fetch("/api/conversations/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: contactParam }),
        });
        const payload = await res.json();
        if (res.ok && payload.conversationId) {
          handleSelect(payload.conversationId);
        }
      } catch (err) {
        console.error("Failed to resolve conversation:", err);
      } finally {
        // Strip the param so a refresh doesn't re-resolve.
        router.replace("/conversations");
      }
    })();
  }, [contactParam, handleSelect, router]);

  async function handleSend(
    channel: MessageChannel,
    subject: string | undefined,
    body: string
  ): Promise<boolean> {
    if (!selectedId) return false;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, subject, body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Failed to send message");
      }
      await loadDetail(selectedId);
      await fetchList();
      return true;
    } catch (err) {
      // Keep the draft in the composer so the user can retry (P5-09).
      console.error("Failed to send:", err);
      setSendError(err instanceof Error ? err.message : "Failed to send message.");
      return false;
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-[#e7e7ea] px-4 py-3">
        <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-zinc-900">
          Conversations
        </h1>
      </div>

      {listError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-700">
          <AlertCircle size={15} strokeWidth={1.8} className="shrink-0" />
          {listError}
          <button
            onClick={() => {
              setListLoading(true);
              fetchList();
            }}
            className="ml-auto text-xs font-medium text-red-800 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="w-full max-w-[340px] shrink-0">
          <ConversationList
            items={items}
            selectedId={selectedId}
            filter={filter}
            search={search}
            loading={listLoading}
            onSelect={handleSelect}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
          />
        </div>
        <ThreadView
          detail={detail}
          loading={detailLoading}
          sending={sending}
          sendError={sendError}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
