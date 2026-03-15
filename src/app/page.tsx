"use client";

import { useEffect, useState } from "react";
import type { Deal, Pipeline, Stage, Contact } from "@/types/crm";
import { Loader2, BarChart3, TrendingUp, Users, DollarSign } from "lucide-react";

const WORKSPACE_ID = "default";

/* ── API helpers ── */
async function fetchDeals(): Promise<Deal[]> {
  const res = await fetch(`/api/deals?workspaceId=${WORKSPACE_ID}`);
  if (!res.ok) throw new Error("Failed to load deals");
  const json = await res.json();
  return json.deals;
}

async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`/api/pipelines?workspaceId=${WORKSPACE_ID}`);
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
  const res = await fetch(`/api/contacts?workspaceId=${WORKSPACE_ID}`);
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

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
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Use the first pipeline as the primary view
  const pipeline = pipelines[0] ?? null;
  const pipelineStages = pipeline
    ? stages
        .filter((s) => s.pipeline_id === pipeline.id)
        .sort((a, b) => a.position - b.position)
    : [];
  const pipelineDeals = pipeline
    ? deals.filter((d) => d.pipeline_id === pipeline.id)
    : deals;

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
    return {
      id: stage.id,
      name: stage.name,
      color: stage.color ?? "#6B7280",
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
    { label: "Open", count: openDeals.length, color: "#3B82F6" },
    { label: "Won", count: wonDeals.length, color: "#10B981" },
    { label: "Lost", count: lostDeals.length, color: "#EF4444" },
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
    return stages.find((s) => s.id === stageId)?.color ?? "#6B7280";
  }

  function getStageName(stageId: string): string {
    return stages.find((s) => s.id === stageId)?.name ?? "Unknown";
  }

  // Recent deals (already sorted by created_at desc from the DB query)
  const recentDeals = pipelineDeals.slice(0, 5);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pipeline
            ? `Pipeline overview for ${pipeline.name}`
            : "Pipeline overview"}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Total Pipeline
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            ${totalValue.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {pipelineDeals.length} deal{pipelineDeals.length !== 1 && "s"}{" "}
            across {pipelineStages.length} stage
            {pipelineStages.length !== 1 && "s"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Won Revenue
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-green-600">
            ${wonValue.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {wonDeals.length} deal{wonDeals.length !== 1 && "s"} closed
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Open Deals
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {openDeals.length}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            ${openDeals.reduce((s, d) => s + d.value, 0).toLocaleString()} in
            pipeline
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Avg Deal Size
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            ${avgDealSize.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {contacts.length} contact{contacts.length !== 1 && "s"} total
          </p>
        </div>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <BarChart3 className="h-8 w-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              No data yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-gray-500">
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
            <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">
                Pipeline Value by Stage
              </h2>
              {stageData.length > 0 ? (
                <div className="space-y-3">
                  {stageData.map((stage) => (
                    <div key={stage.id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700">
                          {stage.name}
                        </span>
                        <span className="text-gray-500">
                          {formatCurrency(stage.value)} &middot; {stage.count}{" "}
                          deal
                          {stage.count !== 1 && "s"}
                        </span>
                      </div>
                      <div className="h-6 w-full overflow-hidden rounded-full bg-gray-100">
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
                <p className="py-8 text-center text-sm text-gray-400">
                  No stages configured yet
                </p>
              )}
            </div>

            {/* Donut Chart - Stage Distribution */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">
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
                      <circle cx="90" cy="90" r="45" fill="white" />
                      <text
                        x="90"
                        y="85"
                        textAnchor="middle"
                        className="text-xs font-medium"
                        fill="#374151"
                      >
                        Total
                      </text>
                      <text
                        x="90"
                        y="102"
                        textAnchor="middle"
                        className="text-sm font-bold"
                        fill="#111827"
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
                        <span className="flex-1 text-gray-600">{seg.name}</span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(seg.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-[220px] items-center justify-center">
                  <p className="text-sm text-gray-400">
                    No deal values to display
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Second row */}
          <div className="mt-6 grid grid-cols-3 gap-6">
            {/* Deal Status Pie */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">
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
                      <circle cx="70" cy="70" r="35" fill="white" />
                      <text
                        x="70"
                        y="73"
                        textAnchor="middle"
                        className="text-sm font-bold"
                        fill="#111827"
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
                        <span className="flex-1 text-gray-600">{s.label}</span>
                        <span className="font-medium text-gray-900">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-sm text-gray-400">No deals yet</p>
                </div>
              )}
            </div>

            {/* Recent Deals */}
            <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">
                Recent Deals
              </h2>
              {recentDeals.length > 0 ? (
                <div className="space-y-3">
                  {recentDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: getStageColor(deal.stage_id),
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {deal.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {getStageName(deal.stage_id)}
                            {deal.status !== "open" && (
                              <span
                                className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  deal.status === "won"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {deal.status.toUpperCase()}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        ${deal.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-sm text-gray-400">
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
