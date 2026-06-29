"use client";

import { useState } from "react";
import {
  getPurpleScaleColor,
  getStatusPurple,
  withAlpha,
} from "@/lib/design/aligno-theme";
import {
  useAllStages,
  useContacts,
  useDeals,
  usePipelines,
} from "@/hooks/use-crm-data";
import { Loader2, BarChart3, TrendingUp, Users, DollarSign, ChevronDown } from "lucide-react";

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
  const { data: deals = [], isLoading: dealsLoading } = useDeals();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const { data: contacts = [], isLoading: contactsLoading } = useContacts();
  const { data: stages = [], isLoading: stagesLoading } = useAllStages(pipelines);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(ALL_PIPELINES);

  const loading =
    dealsLoading || pipelinesLoading || contactsLoading || stagesLoading;

  if (loading) {
    return (
      <div className="aligno-page-surface flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#8A5DDE]" />
          <p className="text-sm text-[#6B6481]">Loading dashboard...</p>
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
    <div className="aligno-page-surface min-h-full p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#21173A]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#6B6481]">
            {pipeline
              ? `Pipeline overview for ${pipeline.name}`
              : "Overview across all pipelines"}
          </p>
        </div>
        {pipelines.length > 1 && (
          <div className="relative">
            <select
              value={selectedPipelineId}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className="appearance-none rounded-lg border border-[#E6DCF9] bg-white pl-3.5 pr-9 py-2.5 text-sm font-medium text-[#33254F] shadow-sm focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
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
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8D88A0]"
            />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="aligno-panel rounded-xl p-5"
              style={{
                borderColor: withAlpha(card.accent, 0.24),
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: withAlpha(card.accent, 0.14) }}
                >
                  <Icon className="h-4 w-4" style={{ color: card.accent }} />
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7B7590]">
                  {card.label}
                </p>
              </div>
              <p className="mt-3 text-2xl font-bold" style={{ color: card.accent }}>
                {card.value}
              </p>
              <p className="mt-1 text-xs text-[#6B6481]">{card.detail}</p>
            </div>
          );
        })}
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="aligno-panel rounded-xl border-dashed p-12">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 rounded-full bg-[#F1E8FF] p-4">
              <BarChart3 className="h-8 w-8 text-[#8A5DDE]" />
            </div>
            <h2 className="text-lg font-semibold text-[#21173A]">
              No data yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-[#6B6481]">
              Your dashboard will come to life once you start adding deals to
              your pipeline. Head over to the Pipeline page to create your first
              deal.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-6">
            {/* Bar Chart - Value by Stage */}
            <div className="aligno-panel col-span-2 rounded-xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-[#3B2E56]">
                Pipeline Value by Stage
              </h2>
              {stageData.length > 0 ? (
                <div className="space-y-3">
                  {stageData.map((stage) => (
                    <div key={stage.id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-[#3B2E56]">
                          {stage.name}
                        </span>
                        <span className="text-[#6B6481]">
                          {formatCurrency(stage.value)} &middot; {stage.count}{" "}
                          deal
                          {stage.count !== 1 && "s"}
                        </span>
                      </div>
                      <div
                        className="aligno-panel-soft h-6 w-full overflow-hidden rounded-full"
                        style={{ border: `1px solid ${withAlpha(stage.color, 0.18)}` }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(
                              (stage.value / maxStageValue) * 100,
                              stage.value > 0 ? 2 : 0
                            )}%`,
                            background: `linear-gradient(90deg, ${withAlpha(stage.color, 0.78)}, ${stage.color})`,
                            boxShadow: `0 0 18px ${withAlpha(stage.color, 0.28)}`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-[#8D88A0]">
                  No stages configured yet
                </p>
              )}
            </div>

            {/* Donut Chart - Stage Distribution */}
            <div className="aligno-panel rounded-xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-[#3B2E56]">
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
                          opacity={0.85}
                        />
                      ))}
                      <circle cx="90" cy="90" r="45" fill="#FCFAFF" />
                      <text
                        x="90"
                        y="85"
                        textAnchor="middle"
                        className="text-xs font-medium"
                        fill="#7B7590"
                      >
                        Total
                      </text>
                      <text
                        x="90"
                        y="102"
                        textAnchor="middle"
                        className="text-sm font-bold"
                        fill="#21173A"
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
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="flex-1 text-[#6B6481]">{seg.name}</span>
                        <span className="font-medium text-[#21173A]">
                          {formatCurrency(seg.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-[220px] items-center justify-center">
                  <p className="text-sm text-[#8D88A0]">
                    No deal values to display
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Second row */}
          <div className="mt-6 grid grid-cols-3 gap-6">
            {/* Deal Status Pie */}
            <div className="aligno-panel rounded-xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-[#3B2E56]">
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
                          opacity={0.85}
                        />
                      ))}
                      <circle cx="70" cy="70" r="35" fill="#FCFAFF" />
                      <text
                        x="70"
                        y="73"
                        textAnchor="middle"
                        className="text-sm font-bold"
                        fill="#21173A"
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
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="flex-1 text-[#6B6481]">{s.label}</span>
                        <span className="font-medium text-[#21173A]">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-sm text-[#8D88A0]">No deals yet</p>
                </div>
              )}
            </div>

            {/* Recent Deals */}
            <div className="aligno-panel col-span-2 rounded-xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-[#3B2E56]">
                Recent Deals
              </h2>
              {recentDeals.length > 0 ? (
                <div className="space-y-3">
                  {recentDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="aligno-panel-soft flex items-center justify-between rounded-lg px-3 py-2.5"
                      style={{
                        border: `1px solid ${withAlpha(getStageColor(deal.stage_id), 0.14)}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: getStageColor(deal.stage_id),
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium text-[#21173A]">
                            {deal.title}
                          </p>
                          <p className="text-xs text-[#6B6481]">
                            {getStageName(deal.stage_id)}
                            {deal.status !== "open" && (
                              <span
                                className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: withAlpha(
                                    getStatusPurple(deal.status),
                                    0.14
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
                      <span className="text-sm font-semibold text-[#21173A]">
                        ${deal.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-sm text-[#8D88A0]">
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
