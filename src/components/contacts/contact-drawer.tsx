"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Plus, ChevronDown, Trash2 } from "lucide-react";
import { getContact, updateContact } from "@/lib/data/contacts";
import {
  getTags,
  getContactTags,
  addTagToContact,
  removeTagFromContact,
  createTag,
  deleteTag,
} from "@/lib/data/tags";
import type { Contact, Tag } from "@/types/crm";

interface ContactDrawerProps {
  contactId: string;
  onClose: () => void;
  onSaved: () => void;
}

const TAG_COLORS = [
  "#6C2BD9",
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#DB2777",
  "#7C3AED",
  "#0891B2",
];

export default function ContactDrawer({
  contactId,
  onClose,
  onSaved,
}: ContactDrawerProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
      try {
        const [c, cTags, wTags] = await Promise.all([
          getContact(contactId),
          getContactTags(contactId),
          getTags("default"),
        ]);
        setContact(c);
        setFirstName(c.first_name);
        setLastName(c.last_name);
        setEmail(c.email ?? "");
        setPhone(c.phone ?? "");
        setStatus(c.status as "active" | "archived");
        setContactTags(cTags);
        setAllTags(wTags);
      } catch (err) {
        console.error("Failed to load contact:", err);
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
      status !== contact.status;
    setDirty(changed);
  }, [firstName, lastName, email, phone, status, contact]);

  async function handleSave() {
    if (!dirty || !contact) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateContact(contact.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        status,
      });
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
      await addTagToContact(contactId, tag.id, "default");
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
      await removeTagFromContact(contactId, tagId);
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
      const tag = await createTag({
        workspace_id: "default",
        name,
        color,
      });
      setAllTags((prev) => [...prev, tag]);
      await addTagToContact(contactId, tag.id, "default");
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
      await deleteTag(tagId);
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {loading ? "Loading..." : `${firstName} ${lastName}`}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[#6C2BD9]" />
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9]"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9]"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1-555-0100"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9]"
                />
              </div>

              {/* Status */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as "active" | "archived")
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9]"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Tags
                </label>

                {/* Current tags */}
                <div className="mb-3 flex flex-wrap gap-2">
                  {contactTags.length === 0 && (
                    <span className="text-sm text-gray-400">No tags</span>
                  )}
                  {contactTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color ?? "#6C2BD9" }}
                    >
                      {tag.name}
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        disabled={tagLoading === tag.id}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-white/20 transition-colors disabled:opacity-50"
                      >
                        {tagLoading === tag.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <X size={10} />
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
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-[#6C2BD9] hover:text-[#6C2BD9] transition-colors"
                  >
                    <Plus size={12} />
                    Add tag
                    <ChevronDown size={12} />
                  </button>

                  {showTagDropdown && (
                    <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                      {availableTags.length > 0 && (
                        <div className="max-h-40 overflow-y-auto">
                          {availableTags.map((tag) => (
                            <div
                              key={tag.id}
                              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                            >
                              <button
                                onClick={() => {
                                  handleAddTag(tag);
                                  setShowTagDropdown(false);
                                }}
                                disabled={tagLoading === tag.id}
                                className="flex flex-1 items-center gap-2 text-left text-sm text-gray-700 disabled:opacity-50"
                              >
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: tag.color ?? "#6C2BD9",
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
                                className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                                title={`Delete "${tag.name}" tag`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {availableTags.length > 0 && (
                        <div className="border-t border-gray-100" />
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
                            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none"
                          />
                          <button
                            onClick={handleCreateTag}
                            disabled={
                              !newTagName.trim() || tagLoading === "new"
                            }
                            className="rounded bg-[#6C2BD9] px-2 py-1 text-xs font-medium text-white hover:bg-[#5b24b8] disabled:opacity-50 transition-colors"
                          >
                            {tagLoading === "new" ? (
                              <Loader2 size={10} className="animate-spin" />
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
            <div className="border-t border-gray-200 px-6 py-4">
              {saveError && (
                <p className="mb-3 text-xs text-red-500">{saveError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#5b24b8] transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
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
