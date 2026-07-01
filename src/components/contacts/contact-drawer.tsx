"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Plus, ChevronDown, Trash2 } from "lucide-react";
import {
  ALIGNO_PURPLE_SCALE,
  getStringPurpleColor,
  withAlpha,
} from "@/lib/design/aligno-theme";
import type { Contact, Tag } from "@/types/crm";

interface ContactDrawerProps {
  contactId: string;
  onClose: () => void;
  onSaved: () => void;
}

const TAG_COLORS = [...ALIGNO_PURPLE_SCALE];

export default function ContactDrawer({
  contactId,
  onClose,
  onSaved,
}: ContactDrawerProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");

  // Tags
  const [contactTags, setContactTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagLoading, setTagLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/contacts/${contactId}`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load contact");
        }

        const c = payload.contact as Contact;
        const cTags = (payload.contactTags as Tag[]) ?? [];
        const wTags = (payload.tags as Tag[]) ?? [];

        setContact(c);
        setFirstName(c.first_name ?? "");
        setLastName(c.last_name ?? "");
        setEmail(c.email ?? "");
        setPhone(c.phone ?? "");
        setCompany(c.company ?? "");
        setNotes(c.notes ?? "");
        setStatus((c.status as "active" | "archived") ?? "active");
        setContactTags(cTags);
        setAllTags(wTags);
      } catch (err) {
        console.error("Failed to load contact:", err);
        setLoadError("Failed to load contact details.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [contactId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowTagDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Mark dirty when fields change from original
  useEffect(() => {
    if (!contact) return;
    const changed =
      firstName !== contact.first_name ||
      lastName !== contact.last_name ||
      email !== (contact.email ?? "") ||
      phone !== (contact.phone ?? "") ||
      company !== (contact.company ?? "") ||
      notes !== (contact.notes ?? "") ||
      status !== contact.status;
    setDirty(changed);
  }, [firstName, lastName, email, phone, company, notes, status, contact]);

  async function handleSave() {
    if (!dirty || !contact) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          company: company.trim() || null,
          notes: notes.trim() || null,
          status,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save contact");
      }
      const updated = payload.contact as Contact;
      setContact(updated);
      setDirty(false);
      onSaved();
    } catch (err) {
      console.error("Failed to save:", err);
      setSaveError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTag(tag: Tag) {
    if (contactTags.some((t) => t.id === tag.id)) return;
    setTagLoading(tag.id);
    try {
      const response = await fetch(`/api/contacts/${contactId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to add tag");
      }
      setContactTags((prev) => [...prev, tag]);
    } catch (err) {
      console.error("Failed to add tag:", err);
    } finally {
      setTagLoading(null);
    }
  }

  async function handleRemoveTag(tagId: string) {
    setTagLoading(tagId);
    try {
      const response = await fetch(
        `/api/contacts/${contactId}/tags?tagId=${encodeURIComponent(tagId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to remove tag");
      }
      setContactTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      console.error("Failed to remove tag:", err);
    } finally {
      setTagLoading(null);
    }
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    setTagLoading("new");
    try {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to create tag");
      const tag = payload.tag as Tag;
      setAllTags((prev) => [...prev, tag]);
      await fetch(`/api/contacts/${contactId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
      setContactTags((prev) => [...prev, tag]);
      setNewTagName("");
    } catch (err) {
      console.error("Failed to create tag:", err);
    } finally {
      setTagLoading(null);
    }
  }

  async function handleDeleteTag(tagId: string, tagName: string) {
    if (!confirm(`Delete tag "${tagName}" from all contacts? This cannot be undone.`)) return;
    setTagLoading(tagId);
    try {
      const response = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to delete tag");
      }
      setAllTags((prev) => prev.filter((t) => t.id !== tagId));
      setContactTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      console.error("Failed to delete tag:", err);
    } finally {
      setTagLoading(null);
    }
  }

  const availableTags = allTags.filter(
    (t) => !contactTags.some((ct) => ct.id === t.id)
  );

  function getTagColor(tag: Tag) {
    return getStringPurpleColor(tag.id || tag.name);
  }

  const displayName = `${firstName} ${lastName}`.trim() || "Contact";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#e7e7ea] bg-white shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)] animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0f0f2] px-6 py-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-900">
            {loading ? "Loading..." : displayName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={24} strokeWidth={1.8} className="animate-spin text-[#6c2bd9]" />
          </div>
        ) : loadError ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-[13px] text-red-600">{loadError}</p>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1-555-0100"
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </div>

              {/* Company */}
              <div>
                <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Company
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional info from DropCard, meeting notes, etc."
                  rows={3}
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </div>

              {/* Status */}
              <div className="border-t border-[#f0f0f2] pt-5">
                <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as "active" | "archived")
                  }
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Tags */}
              <div className="border-t border-[#f0f0f2] pt-5">
                <label className="mb-2 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Tags
                </label>

                {/* Current tags */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {contactTags.length === 0 && (
                    <span className="text-[13px] text-zinc-400">No tags</span>
                  )}
                  {contactTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: withAlpha(getTagColor(tag), 0.1),
                        color: getTagColor(tag),
                      }}
                    >
                      {tag.name}
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        disabled={tagLoading === tag.id}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-black/5 transition-colors disabled:opacity-50"
                      >
                        {tagLoading === tag.id ? (
                          <Loader2 size={10} strokeWidth={1.8} className="animate-spin" />
                        ) : (
                          <X size={10} strokeWidth={1.8} />
                        )}
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add tag dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowTagDropdown(!showTagDropdown)}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#dcdce1] px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    <Plus size={12} strokeWidth={1.8} />
                    Add tag
                    <ChevronDown size={12} strokeWidth={1.8} />
                  </button>

                  {showTagDropdown && (
                    <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-[#e7e7ea] bg-white py-1 shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)]">
                      {availableTags.length > 0 && (
                        <div className="max-h-40 overflow-y-auto">
                          {availableTags.map((tag) => (
                            <div
                              key={tag.id}
                              className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50"
                            >
                              <button
                                onClick={() => {
                                  handleAddTag(tag);
                                  setShowTagDropdown(false);
                                }}
                                disabled={tagLoading === tag.id}
                                className="flex flex-1 items-center gap-2 text-left text-[13px] text-zinc-700 disabled:opacity-50"
                              >
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: getTagColor(tag),
                                  }}
                                />
                                {tag.name}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTag(tag.id, tag.name);
                                }}
                                disabled={tagLoading === tag.id}
                                className="rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                                title={`Delete "${tag.name}" tag`}
                              >
                                <Trash2 size={12} strokeWidth={1.8} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {availableTags.length > 0 && (
                        <div className="border-t border-[#f0f0f2]" />
                      )}

                      {/* Create new tag */}
                      <div className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCreateTag();
                              }
                            }}
                            placeholder="Create new tag..."
                            className="flex-1 rounded-md border border-[#e7e7ea] bg-white px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                          />
                          <button
                            onClick={handleCreateTag}
                            disabled={
                              !newTagName.trim() || tagLoading === "new"
                            }
                            className="rounded-md bg-[#6c2bd9] px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:opacity-50"
                          >
                            {tagLoading === "new" ? (
                              <Loader2 size={10} strokeWidth={1.8} className="animate-spin" />
                            ) : (
                              "Add"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[#f0f0f2] px-6 py-4">
              {saveError && (
                <p className="mb-3 text-xs text-red-500">{saveError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-[#e7e7ea] bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} strokeWidth={1.8} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
