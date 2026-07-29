"use client";

import { useEffect, useState } from "react";
import {
  getPurpleScaleColor,
  getStatusPurple,
  withAlpha,
} from "@/lib/design/aligno-theme";
import type { Deal, Pipeline, Stage, Contact } from "@/types/crm";
import { Loader2, BarChart3, TrendingUp, Users, DollarSign, ChevronDown } from "lucide-react";
import { AgentTrigger } from "@/components/agent/agent-trigger";

/* ── API helpers ── */
async function fetchDeals(): Promise<Deal[]> {
  const res = await fetch("/api/deals");
  if (!res.ok) throw new Error("Failed to load deals");
  const json = await res.json();
  return json.deals;
}

async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await fetch("/api/pipelines");
  if (!res.ok) throw new Error("Failed to load pipelines");
  const json = await res.json();
  return json.pipelines;
}

async function fetchStages(pipelineId: string): Promise<Stage[]> {
  const res = await fetch(`/api/pipelines?pipelineId=${pipelineId}`);
  if (!res.ok) throw new Error("Failed to load stages");
  const json = await res.json();
  return json.stages;
}

async function fetchContacts(): Promise<Contact[]> {
  const res = await fetch("/api/contacts");
  if (!res.ok) throw new Error("Failed to load contacts");
  const json = await res.json();
  return json.contacts;
}

/* ── helpers ── */
function formatCurrency(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

function buildDonutPath(
  segments: { id: string; name: string; color: string; value: number }[],
  total: number,
  radius: number,
  cx: number,
  cy: number
) {
  const paths: { d: string; color: string; name: string; value: number }[] = [];
  let cumulative = 0;

  segments.forEach((seg) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += seg.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    paths.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: seg.color,
      name: seg.name,
      value: seg.value,
    });
  });

  return paths;
}

const ALL_PIPELINES = "__all__";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(ALL_PIPELINES);

  useEffect(() => {
    async function load() {
      try {
        const [fetchedDeals, fetchedPipelines, fetchedContacts] =
          await Promise.all([
            fetchDeals(),
            fetchPipelines(),
            fetchContacts(),
          ]);

        setDeals(fetchedDeals);
        setPipelines(fetchedPipelines);
        setContacts(fetchedContacts);

        // Load stages for all pipelines
        if (fetchedPipelines.length > 0) {
          const allStages = await Promise.all(
            fetchedPipelines.map((p) => fetchStages(p.id))
          );
          setStages(allStages.flat());
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center bg-[#f7f7f8]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#6c2bd9]" />
          <p className="text-[13px] text-zinc-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Filter by selected pipeline or show all
  const isAll = selectedPipelineId === ALL_PIPELINES;
  const pipeline = isAll ? null : pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const pipelineStages = isAll
    ? stages.sort((a, b) => a.position - b.position)
    : stages
        .filter((s) => s.pipeline_id === selectedPipelineId)
        .sort((a, b) => a.position - b.position);
  const pipelineDeals = isAll
    ? deals
    : deals.filter((d) => d.pipeline_id === selectedPipelineId);

  // KPI calculations
  const totalValue = pipelineDeals.reduce((sum, d) => sum + d.value, 0);
  const wonDeals = pipelineDeals.filter((d) => d.status === "won");
  const wonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);
  const openDeals = pipelineDeals.filter((d) => d.status === "open");
  const lostDeals = pipelineDeals.filter((d) => d.status === "lost");
  const avgDealSize =
    pipelineDeals.length > 0
      ? Math.round(totalValue / pipelineDeals.length)
      : 0;

  const hasData = pipelineDeals.length > 0;

  // Stage breakdown for bar chart
  const stageData = pipelineStages.map((stage) => {
    const stageDeals = pipelineDeals.filter((d) => d.stage_id === stage.id);
    const color = getPurpleScaleColor(stage.position);

    return {
      id: stage.id,
      name: stage.name,
      color,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + d.value, 0),
    };
  });

  const maxStageValue = Math.max(...stageData.map((s) => s.value), 1);

  // Donut chart data
  const donutSegments = stageData.filter((s) => s.value > 0);
  const donutTotal = donutSegments.reduce((sum, s) => sum + s.value, 0);
  const donutPaths =
    donutSegments.length > 0
      ? buildDonutPath(donutSegments, donutTotal, 80, 90, 90)
      : [];

  // Status split for pie
  const statusData = [
    { label: "Open", count: openDeals.length, color: getStatusPurple("open") },
    { label: "Won", count: wonDeals.length, color: getStatusPurple("won") },
    { label: "Lost", count: lostDeals.length, color: getStatusPurple("lost") },
  ].filter((s) => s.count > 0);

  const statusTotal = statusData.reduce((sum, s) => sum + s.count, 0);
  const statusPaths =
    statusData.length > 0
      ? buildDonutPath(
          statusData.map((s) => ({
            id: s.label,
            name: s.label,
            color: s.color,
            value: s.count,
          })),
          statusTotal,
          60,
          70,
          70
        )
      : [];

  // Helper to get stage info for a deal
  function getStageColor(stageId: string): string {
    const stage = stages.find((s) => s.id === stageId);
    return stage ? getPurpleScaleColor(stage.position) : getPurpleScaleColor(0);
  }

  function getStageName(stageId: string): string {
    return stages.find((s) => s.id === stageId)?.name ?? "Unknown";
  }

  // Recent deals (already sorted by created_at desc from the DB query)
  const recentDeals = pipelineDeals.slice(0, 5);
  const kpiCards = [
    {
      label: "Total Pipeline",
      value: `$${totalValue.toLocaleString()}`,
      detail: `${pipelineDeals.length} deal${pipelineDeals.length === 1 ? "" : "s"} across ${pipelineStages.length} stage${pipelineStages.length === 1 ? "" : "s"}`,
      icon: DollarSign,
      accent: getPurpleScaleColor(5),
    },
    {
      label: "Won Revenue",
      value: `$${wonValue.toLocaleString()}`,
      detail: `${wonDeals.length} deal${wonDeals.length === 1 ? "" : "s"} closed`,
      icon: TrendingUp,
      accent: getPurpleScaleColor(4),
    },
    {
      label: "Open Deals",
      value: openDeals.length.toString(),
      detail: `$${openDeals.reduce((s, d) => s + d.value, 0).toLocaleString()} in pipeline`,
      icon: BarChart3,
      accent: getPurpleScaleColor(3),
    },
    {
      label: "Avg Deal Size",
      value: `$${avgDealSize.toLocaleString()}`,
      detail: `${contacts.length} contact${contacts.length === 1 ? "" : "s"} total`,
      icon: Users,
      accent: getPurpleScaleColor(1),
    },
  ];

  return (
    <div className="min-h-full bg-[#f7f7f8] px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">Dashboard</h1>
          <p className="mt-1 text-[13px] text-zinc-600">
            {pipeline
              ? `Pipeline overview for ${pipeline.name}`
              : "Overview across all pipelines"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AgentTrigger />
          {pipelines.length > 1 && (
            <div className="relative">
              <select
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                className="appearance-none rounded-lg border border-[#e7e7ea] bg-white pl-3.5 pr-9 py-2 text-[13px] font-medium text-zinc-700 shadow-[0_1px_2px_rgba(17,17,26,0.05)] transition-colors hover:bg-zinc-50 focus:border-[#6c2bd9] focus:outline-none"
              >
                <option value={ALL_PIPELINES}>All Pipelines</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="crisp-card crisp-card-hover p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  {card.label}
                </p>
                <Icon className="h-4 w-4 text-zinc-300" />
              </div>
              <p className="mt-3 text-[26px] font-semibold tracking-tight text-zinc-900 tabular-nums">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-zinc-500 tabular-nums">{card.detail}</p>
            </div>
          );
        })}
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="crisp-card border-dashed p-12">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 rounded-full bg-[#efe7fb] p-4">
              <BarChart3 className="h-8 w-8 text-[#6c2bd9]" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-900">
              No data yet
            </h2>
            <p className="mt-2 max-w-sm text-[13px] text-zinc-600">
              Your dashboard will come to life once you start adding deals to
              your pipeline. Head over to the Pipeline page to create your first
              deal.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {/* Bar Chart - Value by Stage */}
            <div className="crisp-card col-span-2 p-5">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900">
                Pipeline Value by Stage
              </h2>
              {stageData.length > 0 ? (
                <div className="space-y-3">
                  {stageData.map((stage) => (
                    <div key={stage.id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </span>
                        <span className="text-zinc-500 tabular-nums">
                          {formatCurrency(stage.value)} &middot; {stage.count}{" "}
                          deal
                          {stage.count !== 1 && "s"}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(
                              (stage.value / maxStageValue) * 100,
                              stage.value > 0 ? 2 : 0
                            )}%`,
                            backgroundColor: stage.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-[13px] text-zinc-500">
                  No stages configured yet
                </p>
              )}
            </div>

            {/* Donut Chart - Stage Distribution */}
            <div className="crisp-card p-5">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900">
                Value Distribution
              </h2>
              {donutSegments.length > 0 ? (
                <>
                  <div className="flex justify-center">
                    <svg width="180" height="180" viewBox="0 0 180 180">
                      {donutPaths.map((seg, i) => (
                        <path
                          key={i}
                          d={seg.d}
                          fill={seg.color}
                        />
                      ))}
                      <circle cx="90" cy="90" r="45" fill="#ffffff" />
                      <text
                        x="90"
                        y="85"
                        textAnchor="middle"
                        className="text-xs font-medium"
                        fill="#a1a1aa"
                      >
                        Total
                      </text>
                      <text
                        x="90"
                        y="102"
                        textAnchor="middle"
                        className="text-sm font-semibold"
                        fill="#18181b"
                      >
                        {formatCurrency(donutTotal)}
                      </text>
                    </svg>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {donutSegments.map((seg) => (
                      <div
                        key={seg.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="flex-1 text-zinc-600">{seg.name}</span>
                        <span className="font-medium text-zinc-900 tabular-nums">
                          {formatCurrency(seg.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-[220px] items-center justify-center">
                  <p className="text-[13px] text-zinc-500">
                    No deal values to display
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Second row */}
          <div className="mt-4 grid grid-cols-3 gap-4">
            {/* Deal Status Pie */}
            <div className="crisp-card p-5">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900">
                Deal Status
              </h2>
              {statusData.length > 0 ? (
                <>
                  <div className="flex justify-center">
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      {statusPaths.map((seg, i) => (
                        <path
                          key={i}
                          d={seg.d}
                          fill={seg.color}
                        />
                      ))}
                      <circle cx="70" cy="70" r="35" fill="#ffffff" />
                      <text
                        x="70"
                        y="73"
                        textAnchor="middle"
                        className="text-sm font-semibold"
                        fill="#18181b"
                      >
                        {statusTotal}
                      </text>
                    </svg>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {statusData.map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="flex-1 text-zinc-600">{s.label}</span>
                        <span className="font-medium text-zinc-900 tabular-nums">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-[13px] text-zinc-500">No deals yet</p>
                </div>
              )}
            </div>

            {/* Recent Deals */}
            <div className="crisp-card col-span-2 p-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">
                Recent Deals
              </h2>
              {recentDeals.length > 0 ? (
                <div className="divide-y divide-[#f0f0f2]">
                  {recentDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="-mx-2 flex items-center justify-between rounded-md px-2 py-2.5 transition-colors hover:bg-zinc-50/80"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: getStageColor(deal.stage_id),
                          }}
                        />
                        <div>
                          <p className="text-[13px] font-medium text-zinc-900">
                            {deal.title}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {getStageName(deal.stage_id)}
                            {deal.status !== "open" && (
                              <span
                                className="ml-2 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                                style={{
                                  backgroundColor: withAlpha(
                                    getStatusPurple(deal.status),
                                    0.1
                                  ),
                                  color: getStatusPurple(deal.status),
                                }}
                              >
                                {deal.status.toUpperCase()}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">
                        ${deal.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-[13px] text-zinc-500">
                    No deals to display yet
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
