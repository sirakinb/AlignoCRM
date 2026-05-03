"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useDeferredValue,
} from "react";
import {
  Search,
  Plus,
  Mail,
  Phone,
  Building2,
  X,
  Loader2,
  UserPlus,
  Users,
  AlertCircle,
  Trash2,
  ChevronDown,
} from "lucide-react";
import {
  ALIGNO_PURPLE_SCALE,
  getPurpleScaleColor,
  getStringPurpleColor,
  withAlpha,
} from "@/lib/design/aligno-theme";
import type { Contact, Tag } from "@/types/crm";
import ContactDrawer from "@/components/contacts/contact-drawer";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}

const emptyForm: ContactFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
};

function getContactDisplayName(contact: Pick<Contact, "first_name" | "last_name">) {
  const firstName = contact.first_name?.trim() ?? "";
  const lastName = contact.last_name?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "Unnamed Contact";
}

function getContactInitials(contact: Pick<Contact, "first_name" | "last_name">) {
  const firstInitial = contact.first_name?.trim().charAt(0) ?? "";
  const lastInitial = contact.last_name?.trim().charAt(0) ?? "";
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();

  return initials || "UC";
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<ContactFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  // Tags state
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagsMap, setContactTagsMap] = useState<Record<string, Tag[]>>({});
  const [modalSelectedTags, setModalSelectedTags] = useState<Tag[]>([]);
  const [showModalTagDropdown, setShowModalTagDropdown] = useState(false);
  const [newModalTagName, setNewModalTagName] = useState("");
  const modalTagDropdownRef = useRef<HTMLDivElement>(null);

  const fetchContacts = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/contacts/summary", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load contacts");
      }

      setContacts((payload.contacts as Contact[]) ?? []);
      setAllTags((payload.tags as Tag[]) ?? []);
      setContactTagsMap(
        (payload.contactTagsMap as Record<string, Tag[]>) ?? {}
      );
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
      setError("Failed to load contacts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Close modal tag dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        modalTagDropdownRef.current &&
        !modalTagDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModalTagDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = contacts.filter((c) => {
    const normalizedSearch = deferredSearch.toLowerCase().trim();
    const matchesSearch =
      normalizedSearch === "" ||
      getContactDisplayName(c).toLowerCase().includes(normalizedSearch) ||
      c.email?.toLowerCase().includes(normalizedSearch) ||
      c.phone?.includes(deferredSearch) ||
      c.company?.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = contacts.filter((c) => c.status === "active").length;
  const archivedCount = contacts.filter((c) => c.status === "archived").length;

  function validateForm(): boolean {
    const errors: Partial<Record<keyof ContactFormData, string>> = {};

    if (!formData.first_name.trim()) {
      errors.first_name = "First name is required";
    }
    if (!formData.last_name.trim()) {
      errors.last_name = "Last name is required";
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim(),
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          company: formData.company.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          source: "alignocrm",
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create contact");
      }

      const newContact = payload.contact as Contact;

      // Add selected tags (don't let tag failures block contact creation)
      for (const tag of modalSelectedTags) {
        try {
          await fetch(`/api/contacts/${newContact.id}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId: tag.id }),
          });
        } catch (tagErr) {
          console.error(`Failed to add tag "${tag.name}":`, tagErr);
        }
      }

      // Reset form and close modal
      setFormData(emptyForm);
      setFormErrors({});
      setModalSelectedTags([]);
      setShowModal(false);

      setContacts((prev) => [newContact, ...prev]);
      setContactTagsMap((prev) => ({
        ...prev,
        [newContact.id]: modalSelectedTags,
      }));
    } catch (err) {
      console.error("Failed to create contact:", err);
      setSubmitError("Failed to create contact. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function openModal() {
    setFormData(emptyForm);
    setFormErrors({});
    setSubmitError(null);
    setModalSelectedTags([]);
    setNewModalTagName("");
    setShowModal(true);
  }

  function closeModal() {
    if (!submitting) {
      setShowModal(false);
      setFormData(emptyForm);
      setFormErrors({});
      setSubmitError(null);
      setModalSelectedTags([]);
      setNewModalTagName("");
    }
  }

  const TAG_COLORS = [...ALIGNO_PURPLE_SCALE];
  const primaryPurple = getPurpleScaleColor(3);
  const deepPurple = getPurpleScaleColor(5);
  const mutedPurple = getPurpleScaleColor(1);

  function getTagColor(tag: Tag) {
    return getStringPurpleColor(tag.id || tag.name);
  }

  async function handleCreateModalTag() {
    const name = newModalTagName.trim();
    if (!name) return;
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
      setModalSelectedTags((prev) => [...prev, tag]);
      setNewModalTagName("");
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  }

  async function handleDeleteTag(tagId: string, tagName: string) {
    if (!confirm(`Delete tag "${tagName}" from all contacts? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to delete tag");
      }
      setAllTags((prev) => prev.filter((t) => t.id !== tagId));
      setModalSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
      // Remove from contact tags map
      setContactTagsMap((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].filter((t) => t.id !== tagId);
        }
        return updated;
      });
    } catch (err) {
      console.error("Failed to delete tag:", err);
    }
  }

  async function handleDelete(contactId: string, contactName: string) {
    if (!confirm(`Delete "${contactName}"? This cannot be undone.`)) return;

    setDeletingId(contactId);
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to delete contact");
      }
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`
      )
    )
      return;

    setBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(async (id) => {
          const response = await fetch(`/api/contacts/${id}`, {
            method: "DELETE",
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Failed to delete contact ${id}`);
          }
        })
      );
      setContacts((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to bulk delete contacts:", err);
      alert("Some contacts could not be deleted. Please try again.");
      // Refresh to get current state
      fetchContacts();
    } finally {
      setBulkDeleting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="aligno-page-surface flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: primaryPurple }} />
          <p className="text-sm text-[#6B6481]">Loading contacts...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && contacts.length === 0) {
    return (
      <div className="aligno-page-surface flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <p className="text-sm text-[#33254F]">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchContacts();
            }}
            className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{
              background: `linear-gradient(135deg, ${primaryPurple}, ${deepPurple})`,
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aligno-page-surface min-h-full p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#21173A]">Contacts</h1>
          <p className="mt-1 text-sm text-[#6B6481]">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} total
            {activeCount > 0 && (
              <span className="ml-1 text-[#8D88A0]">
                &middot; {activeCount} active
              </span>
            )}
            {archivedCount > 0 && (
              <span className="ml-1 text-[#8D88A0]">
                &middot; {archivedCount} archived
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
          style={{
            background: `linear-gradient(135deg, ${primaryPurple}, ${deepPurple})`,
          }}
        >
          <Plus size={16} />
          Add Contact
        </button>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D88A0]"
          />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="aligno-panel-soft w-full rounded-lg py-2 pl-9 pr-3 text-sm text-[#21173A] placeholder-[#8D88A0] focus:outline-none focus:ring-1"
            style={{
              border: `1px solid ${withAlpha(mutedPurple, 0.18)}`,
              boxShadow: `0 8px 20px ${withAlpha(mutedPurple, 0.06)}`,
            }}
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                backgroundColor:
                  statusFilter === s ? primaryPurple : withAlpha(mutedPurple, 0.14),
                color: statusFilter === s ? "#FFFFFF" : "#5A4B78",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner (non-blocking) */}
      {error && contacts.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          {error}
          <button
            onClick={() => {
              setLoading(true);
              fetchContacts();
            }}
            className="ml-auto text-xs font-medium text-red-800 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div
          className="mb-3 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
          style={{ backgroundColor: withAlpha(primaryPurple, 0.08), border: `1px solid ${withAlpha(primaryPurple, 0.18)}` }}
        >
          <span className="font-medium" style={{ color: deepPurple }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {bulkDeleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            {bulkDeleting ? "Deleting..." : "Delete Selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#6B6481] transition-colors hover:bg-white/60"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="aligno-panel overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EEE6FF] bg-white/70">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 accent-[#6C2BD9] cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Company
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Tags
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#7B7590]">
                Added
              </th>
              <th className="w-12 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEE6FF]">
            {filtered.map((contact) => {
              const initials = getContactInitials(contact);
              const displayName = getContactDisplayName(contact);

              return (
                <tr
                  key={contact.id}
                  onClick={() => setSelectedContactId(contact.id)}
                  className="cursor-pointer transition-colors hover:bg-[#FBF7FF]"
                  style={selectedIds.has(contact.id) ? { backgroundColor: withAlpha(primaryPurple, 0.06) } : undefined}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 accent-[#6C2BD9] cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: withAlpha(primaryPurple, 0.12),
                          color: deepPurple,
                        }}
                      >
                        {initials}
                      </div>
                      <span className="font-medium text-[#21173A]">{displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.email ? (
                      <div className="flex items-center gap-1.5 text-[#5A4B78]">
                        <Mail size={13} className="shrink-0 text-[#8D88A0]" />
                        {contact.email}
                      </div>
                    ) : (
                      <span className="text-[#AAA3BC]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.phone ? (
                      <div className="flex items-center gap-1.5 text-[#5A4B78]">
                        <Phone size={13} className="shrink-0 text-[#8D88A0]" />
                        {contact.phone}
                      </div>
                    ) : (
                      <span className="text-[#AAA3BC]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.company ? (
                      <div className="flex items-center gap-1.5 text-[#5A4B78]">
                        <Building2 size={13} className="shrink-0 text-[#8D88A0]" />
                        {contact.company}
                      </div>
                    ) : (
                      <span className="text-[#AAA3BC]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(contactTagsMap[contact.id] ?? []).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: getTagColor(tag) }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {(!contactTagsMap[contact.id] || contactTagsMap[contact.id].length === 0) && (
                        <span className="text-[#AAA3BC]">&mdash;</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor:
                          contact.status === "active"
                            ? withAlpha(primaryPurple, 0.14)
                            : withAlpha(mutedPurple, 0.16),
                        color: contact.status === "active" ? deepPurple : "#6B6481",
                      }}
                    >
                      {contact.status === "active" ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6B6481]">
                    {formatDate(contact.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(
                          contact.id,
                          displayName
                        );
                      }}
                      disabled={deletingId === contact.id}
                      className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title="Delete contact"
                    >
                      {deletingId === contact.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && contacts.length > 0 && (
          <div className="px-4 py-12 text-center">
            <Search size={32} className="mx-auto mb-3 text-[#C4BDD6]" />
            <p className="text-sm font-medium text-[#6B6481]">No contacts found</p>
            <p className="mt-1 text-xs text-[#8D88A0]">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}

        {contacts.length === 0 && !error && (
          <div className="px-4 py-16 text-center">
            <Users size={40} className="mx-auto mb-4 text-[#C4BDD6]" />
            <p className="text-sm font-medium text-[#33254F]">No contacts yet</p>
            <p className="mt-1 text-sm text-[#8D88A0]">
              Get started by adding your first contact.
            </p>
            <button
              onClick={openModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
              style={{
                background: `linear-gradient(135deg, ${primaryPurple}, ${deepPurple})`,
              }}
            >
              <UserPlus size={16} />
              Add Your First Contact
            </button>
          </div>
        )}
      </div>

      {/* Contact Edit Drawer */}
      {selectedContactId && (
        <ContactDrawer
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          onSaved={() => fetchContacts()}
        />
      )}

      {/* Add Contact Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={closeModal}
          />

          {/* Modal content */}
          <div className="aligno-panel relative z-10 mx-4 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: withAlpha(primaryPurple, 0.14) }}
                >
                  <UserPlus size={20} style={{ color: deepPurple }} />
                </div>
                <h2 id="modal-title" className="text-lg font-semibold text-[#21173A]">
                  Add Contact
                </h2>
              </div>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateContact}>
              <div className="space-y-4">
                {/* Name row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="first_name"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      First name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="first_name"
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => {
                        setFormData((f) => ({ ...f, first_name: e.target.value }));
                        if (formErrors.first_name) {
                          setFormErrors((fe) => ({ ...fe, first_name: undefined }));
                        }
                      }}
                      placeholder="Jane"
                      disabled={submitting}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-500 ${
                        formErrors.first_name
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-200 focus:border-[#6C2BD9] focus:ring-[#6C2BD9]"
                      }`}
                    />
                    {formErrors.first_name && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.first_name}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="last_name"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="last_name"
                      type="text"
                      value={formData.last_name}
                      onChange={(e) => {
                        setFormData((f) => ({ ...f, last_name: e.target.value }));
                        if (formErrors.last_name) {
                          setFormErrors((fe) => ({ ...fe, last_name: undefined }));
                        }
                      }}
                      placeholder="Doe"
                      disabled={submitting}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-500 ${
                        formErrors.last_name
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-200 focus:border-[#6C2BD9] focus:ring-[#6C2BD9]"
                      }`}
                    />
                    {formErrors.last_name && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.last_name}</p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => {
                        setFormData((f) => ({ ...f, email: e.target.value }));
                        if (formErrors.email) {
                          setFormErrors((fe) => ({ ...fe, email: undefined }));
                        }
                      }}
                      placeholder="jane@company.com"
                      disabled={submitting}
                      className={`w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-500 ${
                        formErrors.email
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-200 focus:border-[#6C2BD9] focus:ring-[#6C2BD9]"
                      }`}
                    />
                  </div>
                  {formErrors.email && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Phone
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, phone: e.target.value }))
                      }
                      placeholder="+1-555-0100"
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>

                {/* Company */}
                <div>
                  <label
                    htmlFor="company"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Company
                  </label>
                  <div className="relative">
                    <Building2
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      id="company"
                      type="text"
                      value={formData.company}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, company: e.target.value }))
                      }
                      placeholder="Acme Inc."
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="notes"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="Additional info from DropCard, meeting notes, etc."
                    disabled={submitting}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>

              {/* Tags */}
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Tags
                </label>

                {/* Selected tags */}
                {modalSelectedTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {modalSelectedTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: getTagColor(tag) }}
                      >
                        {tag.name}
                        <button
                          type="button"
                          onClick={() =>
                            setModalSelectedTags((prev) =>
                              prev.filter((t) => t.id !== tag.id)
                            )
                          }
                          className="ml-0.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Tag dropdown */}
                <div className="relative" ref={modalTagDropdownRef}>
                  <button
                    type="button"
                    onClick={() =>
                      setShowModalTagDropdown(!showModalTagDropdown)
                    }
                    disabled={submitting}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-[#6B6481] transition-colors disabled:opacity-50"
                    style={{ borderColor: withAlpha(primaryPurple, 0.24) }}
                  >
                    <Plus size={12} />
                    Add tag
                    <ChevronDown size={12} />
                  </button>

                  {showModalTagDropdown && (
                    <div className="aligno-panel absolute left-0 top-full z-10 mt-1 w-56 rounded-lg py-1 shadow-lg">
                      {allTags.filter(
                        (t) => !modalSelectedTags.some((s) => s.id === t.id)
                      ).length > 0 && (
                        <div className="max-h-32 overflow-y-auto">
                          {allTags
                            .filter(
                              (t) =>
                                !modalSelectedTags.some((s) => s.id === t.id)
                            )
                            .map((tag) => (
                              <div
                                key={tag.id}
                                className="flex items-center justify-between px-3 py-2 hover:bg-[#FBF7FF]"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalSelectedTags((prev) => [
                                      ...prev,
                                      tag,
                                    ]);
                                    setShowModalTagDropdown(false);
                                  }}
                                  className="flex flex-1 items-center gap-2 text-left text-sm text-gray-700"
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
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTag(tag.id, tag.name);
                                  }}
                                  className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                                  title={`Delete "${tag.name}" tag`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                        </div>
                      )}

                      {allTags.filter(
                        (t) => !modalSelectedTags.some((s) => s.id === t.id)
                      ).length > 0 && (
                        <div className="border-t border-gray-100" />
                      )}

                      {/* Create new tag */}
                      <div className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newModalTagName}
                            onChange={(e) => setNewModalTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCreateModalTag();
                              }
                            }}
                            placeholder="Create new tag..."
                            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none"
                            style={{ borderColor: withAlpha(mutedPurple, 0.18) }}
                          />
                          <button
                            type="button"
                            onClick={handleCreateModalTag}
                            disabled={!newModalTagName.trim()}
                            className="rounded px-2 py-1 text-xs font-medium text-white disabled:opacity-50 transition-colors"
                            style={{
                              background: `linear-gradient(135deg, ${primaryPurple}, ${deepPurple})`,
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit error */}
              {submitError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0" />
                  {submitError}
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-[#5A4B78] hover:bg-[#FBF7FF] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-70"
                  style={{
                    background: `linear-gradient(135deg, ${primaryPurple}, ${deepPurple})`,
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Contact
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
