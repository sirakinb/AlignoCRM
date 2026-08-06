"use client";

import { useState } from "react";
import type { MessageChannel } from "@/types/messaging";
import { CampaignManager } from "./campaign-manager";
import { TemplateManager } from "./template-manager";
import { ChannelSettings } from "./channel-settings";
import { OptOutsManager } from "./opt-outs-manager";

type Tab = "campaigns" | "templates" | "settings" | "optouts";

/**
 * Shared Email/SMS section shell (P4-03/P4-22/P5-02/P5-03). Email exposes
 * Campaigns · Templates · Settings; SMS adds an Opt-outs tab.
 */
export function MessagingSection({
  channel,
  title,
  subtitle,
}: {
  channel: MessageChannel;
  title: string;
  subtitle: string;
}) {
  const [tab, setTab] = useState<Tab>("campaigns");

  const tabs: { id: Tab; label: string }[] = [
    { id: "campaigns", label: "Campaigns" },
    { id: "templates", label: "Templates" },
    { id: "settings", label: "Settings" },
    ...(channel === "sms" ? [{ id: "optouts" as Tab, label: "Opt-outs" }] : []),
  ];

  return (
    <div className="min-h-full bg-[#f7f7f8] p-6">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">{subtitle}</p>
      </div>

      <div className="mb-5 flex gap-1 border-b border-[#e7e7ea]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              tab === t.id
                ? "border-[#5b21b6] text-[#5b21b6]"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="crisp-card p-5">
        {tab === "campaigns" && <CampaignManager channel={channel} />}
        {tab === "templates" && <TemplateManager channel={channel} />}
        {tab === "settings" && <ChannelSettings channel={channel} />}
        {tab === "optouts" && <OptOutsManager channel="sms" />}
      </div>
    </div>
  );
}
