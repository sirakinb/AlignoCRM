"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  Loader2,
  Mail,
  Phone,
  Save,
  User,
} from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import type { Contact, Deal, Pipeline, Stage } from "@/types/crm";

interface LeadDetailPayload {
  deal: Deal;
  contact: Contact | null;
  pipeline: Pipeline;
  stage: Stage;
}

async function fetchLeadDetail(id: string): Promise<LeadDetailPayload> {
  const response = await fetch(`/api/deals/${id}`, { cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load lead");
  }

  return response.json();
}

async function saveContactNotes(contactId: string, contact: Contact, notes: string) {
  const response = await fetch(`/api/contacts/${contactId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      notes,
      status: contact.status,
      owner_id: contact.owner_id,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save notes");
  }

  return response.json() as Promise<{ contact: Contact }>;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3">
      <Icon size={17} className="mt-0.5 text-[#6C2BD9]" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-medium text-gray-900">
          {value || "Not provided"}
        </p>
      </div>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<LeadDetailPayload | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchLeadDetail(params.id);
        if (cancelled) return;
        setData(payload);
        setNotes(payload.contact?.notes ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load lead");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const contactName = useMemo(() => {
    if (!data?.contact) return data?.deal.title ?? "Lead";
    return `${data.contact.first_name} ${data.contact.last_name}`.trim();
  }, [data]);

  function goBackToPipeline() {
    const pipelineId =
      new URLSearchParams(window.location.search).get("pipelineId") ??
      data?.deal.pipeline_id;
    router.push(pipelineId ? `/pipeline?pipelineId=${pipelineId}` : "/pipeline");
  }

  async function handleSaveNotes() {
    if (!data?.contact) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const result = await saveContactNotes(data.contact.id, data.contact, notes);
      setData((current) =>
        current ? { ...current, contact: result.contact } : current
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin text-[#6C2BD9]" />
          Loading lead information...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <button
          type="button"
          onClick={goBackToPipeline}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#6C2BD9]"
        >
          <ArrowLeft size={16} />
          Back to pipeline
        </button>
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <button
        type="button"
        onClick={goBackToPipeline}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#6C2BD9] hover:text-[#5b24b8]"
      >
        <ArrowLeft size={16} />
        Back to pipeline
      </button>

      <div
        className="rounded-2xl border bg-white p-6 shadow-sm"
        style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.16) }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#6B6481]">
              {data.pipeline.name} / {data.stage.name}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[#21173A]">
              {contactName}
            </h1>
          </div>
          <span className="rounded-full bg-[#F3EAFD] px-3 py-1 text-sm font-medium text-[#6C2BD9]">
            {data.deal.status}
          </span>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <DetailRow icon={User} label="Name" value={contactName} />
          <DetailRow icon={Phone} label="Phone" value={data.contact?.phone ?? null} />
          <DetailRow icon={Mail} label="Email" value={data.contact?.email ?? null} />
          <DetailRow
            icon={BriefcaseBusiness}
            label="Pipeline stage"
            value={data.stage.name}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section
          className="rounded-2xl border bg-white p-6 shadow-sm"
          style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.16) }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Case details and notes
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Website form details and internal follow-up notes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={!data.contact || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : saved ? (
                <Check size={15} />
              ) : (
                <Save size={15} />
              )}
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!data.contact}
            rows={12}
            placeholder="Add case details, call notes, intake updates, or next steps."
            className="mt-3 w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition-colors focus:border-[#6C2BD9] focus:ring-1 focus:ring-[#6C2BD9] disabled:bg-gray-50"
          />
          {!data.contact && (
            <p className="mt-2 text-sm text-red-600">
              This pipeline item is not linked to a contact, so notes cannot be
              saved yet.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        <aside
          className="rounded-2xl border bg-white p-6 shadow-sm"
          style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.16) }}
        >
          <h2 className="text-lg font-semibold text-gray-950">Lead record</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {new Date(data.deal.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Last updated</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {new Date(data.deal.updated_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">CRM contact</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {data.contact ? "Created" : "Not linked"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
