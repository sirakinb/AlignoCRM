"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  Link2,
  Loader2,
  Mail,
  Phone,
  Save,
  Unlink,
  User,
} from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
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

async function fetchContacts(): Promise<Contact[]> {
  const response = await fetch("/api/contacts", { cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load contacts");
  }

  const data = await response.json();
  return (data.contacts ?? []) as Contact[];
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
    <div className="flex items-start gap-3 rounded-lg border border-[#e7e7ea] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(17,17,26,0.05)]">
      <Icon size={16} strokeWidth={1.8} className="mt-0.5 text-zinc-400" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          {label}
        </p>
        <p className="mt-1 break-words text-[13px] font-medium text-zinc-900">
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [valueInput, setValueInput] = useState("");
  const [savingValue, setSavingValue] = useState(false);
  const [valueSaved, setValueSaved] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);
  const [linkContactId, setLinkContactId] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [payload, contactList] = await Promise.all([
          fetchLeadDetail(params.id),
          fetchContacts(),
        ]);
        if (cancelled) return;
        setData(payload);
        setContacts(contactList);
        setNotes(payload.contact?.notes ?? "");
        setValueInput(String(payload.deal.value ?? 0));
        setLinkContactId(payload.contact?.id ?? "");
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

  async function handleSaveValue() {
    if (!data) return;

    const parsed = Number(valueInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValueError("Enter an amount of 0 or more.");
      return;
    }

    setSavingValue(true);
    setValueError(null);
    setValueSaved(false);

    try {
      const response = await fetch(`/api/deals/${data.deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parsed }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to update value");

      setData((current) =>
        current ? { ...current, deal: result.deal } : current
      );
      setValueInput(String(result.deal.value ?? 0));
      setValueSaved(true);
      window.setTimeout(() => setValueSaved(false), 1800);
    } catch (err) {
      setValueError(err instanceof Error ? err.message : "Failed to update value");
    } finally {
      setSavingValue(false);
    }
  }

  async function handleSaveContactLink() {
    if (!data) return;

    setSavingLink(true);
    setLinkError(null);
    setLinkSaved(false);

    try {
      const response = await fetch(`/api/deals/${data.deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: linkContactId || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to link contact");

      const linkedContact =
        contacts.find((contact) => contact.id === (result.deal.contact_id ?? "")) ??
        null;

      setData((current) =>
        current
          ? {
              ...current,
              deal: result.deal,
              contact: linkedContact,
            }
          : current
      );
      setNotes(linkedContact?.notes ?? "");
      setLinkContactId(result.deal.contact_id ?? "");
      setLinkSaved(true);
      window.setTimeout(() => setLinkSaved(false), 1800);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link contact");
    } finally {
      setSavingLink(false);
    }
  }

  const valueDirty = data ? String(data.deal.value ?? 0) !== valueInput.trim() : false;
  const linkDirty = data ? (data.deal.contact_id ?? "") !== linkContactId : false;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-[13px] text-zinc-500">
          <Loader2 size={18} className="animate-spin text-[#6c2bd9]" />
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
          className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-[#6c2bd9] hover:text-[#5b21b6]"
        >
          <ArrowLeft size={16} strokeWidth={1.8} />
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
        className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-[#6c2bd9] hover:text-[#5b21b6]"
      >
        <ArrowLeft size={16} strokeWidth={1.8} />
        Back to pipeline
      </button>

      <div className="crisp-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500">
              {data.pipeline.name} / {data.stage.name}
            </p>
            <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">
              {contactName}
            </h1>
          </div>
          <span className="rounded-md bg-[#efe7fb] px-1.5 py-0.5 text-[11px] font-medium text-[#5b21b6]">
            {data.deal.status}
          </span>
        </div>

        {/* Deal value — editable */}
        <div className="mt-6 rounded-lg border border-[#e7e7ea] bg-[#fafafa] px-4 py-3.5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                Deal value
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={valueInput}
                    onChange={(event) => setValueInput(event.target.value)}
                    className="w-40 rounded-lg border border-[#e7e7ea] bg-white py-2 pl-6 pr-3 text-sm font-medium tabular-nums text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveValue}
                  disabled={savingValue || !valueDirty}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingValue ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : valueSaved ? (
                    <Check size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  {valueSaved ? "Saved" : "Save"}
                </button>
              </div>
            </div>
            <p className="text-[13px] text-zinc-500">
              Current: <span className="font-medium text-zinc-900 tabular-nums">{formatCurrency(data.deal.value ?? 0)}</span>
            </p>
          </div>
          {valueError && (
            <p className="mt-2 text-[13px] text-red-600">{valueError}</p>
          )}
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
        <section className="crisp-card p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-zinc-900">
                Case details and notes
              </h2>
              <p className="mt-1 text-[13px] text-zinc-500">
                Website form details and internal follow-up notes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={!data.contact || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
            className="mt-3 w-full resize-y rounded-lg border border-[#e7e7ea] bg-white px-4 py-3 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors disabled:bg-zinc-50"
          />
          {!data.contact && (
            <p className="mt-2 text-[13px] text-red-600">
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

        <aside className="crisp-card p-6">
          <h2 className="text-[15px] font-semibold text-zinc-900">Lead record</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs text-zinc-500">Created</dt>
              <dd className="mt-1 text-[13px] font-medium text-zinc-900 tabular-nums">
                {new Date(data.deal.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Last updated</dt>
              <dd className="mt-1 text-[13px] font-medium text-zinc-900 tabular-nums">
                {new Date(data.deal.updated_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">CRM contact</dt>
              <dd className="mt-1 text-[13px] font-medium text-zinc-900">
                {data.contact
                  ? `${data.contact.first_name} ${data.contact.last_name}`.trim()
                  : "Not linked"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-[#e7e7ea] pt-5">
            <label
              htmlFor="lead-contact-link"
              className="block text-xs font-medium text-zinc-500"
            >
              Link to contact
            </label>
            <select
              id="lead-contact-link"
              value={linkContactId}
              onChange={(event) => {
                setLinkContactId(event.target.value);
                setLinkSaved(false);
                setLinkError(null);
              }}
              className="mt-2 w-full appearance-none rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none transition-colors"
            >
              <option value="">No linked contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.first_name} {contact.last_name}
                  {contact.email ? ` (${contact.email})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveContactLink}
              disabled={savingLink || !linkDirty}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#6c2bd9] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingLink ? (
                <Loader2 size={15} className="animate-spin" />
              ) : linkContactId ? (
                <Link2 size={15} />
              ) : (
                <Unlink size={15} />
              )}
              {linkSaved ? "Saved" : linkContactId ? "Save contact link" : "Unlink contact"}
            </button>
            {linkError && (
              <p className="mt-2 text-[13px] text-red-600">{linkError}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
