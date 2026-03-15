"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  Mail,
  Phone,
  X,
  Loader2,
  UserPlus,
  Users,
  AlertCircle,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { getContacts, createContact, deleteContact } from "@/lib/data/contacts";
import {
  getTags,
  getContactTagsMap,
  addTagToContact,
  createTag,
  deleteTag,
} from "@/lib/data/tags";
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
}

const emptyForm: ContactFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
};

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
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

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
      const [data, tags] = await Promise.all([
        getContacts("default"),
        getTags("default"),
      ]);
      setContacts(data);
      setAllTags(tags);
      if (data.length > 0) {
        const tagsMap = await getContactTagsMap(data.map((c) => c.id));
        setContactTagsMap(tagsMap);
      }
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
    const matchesSearch =
      search === "" ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search);
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
      const newContact = await createContact({
        workspace_id: "default",
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });

      // Add selected tags (don't let tag failures block contact creation)
      for (const tag of modalSelectedTags) {
        try {
          await addTagToContact(newContact.id, tag.id, "default");
        } catch (tagErr) {
          console.error(`Failed to add tag "${tag.name}":`, tagErr);
        }
      }

      // Reset form and close modal
      setFormData(emptyForm);
      setFormErrors({});
      setModalSelectedTags([]);
      setShowModal(false);

      // Refresh the contact list
      await fetchContacts();
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

  const TAG_COLORS = [
    "#6C2BD9", "#2563EB", "#059669", "#D97706",
    "#DC2626", "#DB2777", "#7C3AED", "#0891B2",
  ];

  async function handleCreateModalTag() {
    const name = newModalTagName.trim();
    if (!name) return;
    try {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
      const tag = await createTag({ workspace_id: "default", name, color });
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
      await deleteTag(tagId);
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
      await deleteContact(contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-[#6C2BD9]" />
          <p className="text-sm text-gray-500">Loading contacts...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && contacts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchContacts();
            }}
            className="mt-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b24b8] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} total
            {activeCount > 0 && (
              <span className="ml-1 text-gray-400">
                &middot; {activeCount} active
              </span>
            )}
            {archivedCount > 0 && (
              <span className="ml-1 text-gray-400">
                &middot; {archivedCount} archived
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#5b24b8] transition-colors"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9]"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? "bg-[#6C2BD9] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tags
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Added
              </th>
              <th className="w-12 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((contact) => {
              const initials = `${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase();

              return (
                <tr
                  key={contact.id}
                  onClick={() => setSelectedContactId(contact.id)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3EAFD] text-xs font-medium text-[#6C2BD9]">
                        {initials}
                      </div>
                      <span className="font-medium text-gray-900">
                        {contact.first_name} {contact.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.email ? (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Mail size={13} className="shrink-0 text-gray-400" />
                        {contact.email}
                      </div>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.phone ? (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Phone size={13} className="shrink-0 text-gray-400" />
                        {contact.phone}
                      </div>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(contactTagsMap[contact.id] ?? []).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color ?? "#6C2BD9" }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {(!contactTagsMap[contact.id] || contactTagsMap[contact.id].length === 0) && (
                        <span className="text-gray-400">&mdash;</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        contact.status === "active"
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {contact.status === "active" ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(contact.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(
                          contact.id,
                          `${contact.first_name} ${contact.last_name}`
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
            <Search size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No contacts found</p>
            <p className="mt-1 text-xs text-gray-400">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}

        {contacts.length === 0 && !error && (
          <div className="px-4 py-16 text-center">
            <Users size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">No contacts yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Get started by adding your first contact.
            </p>
            <button
              onClick={openModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#5b24b8] transition-colors"
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
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl mx-4">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F3EAFD]">
                  <UserPlus size={20} className="text-[#6C2BD9]" />
                </div>
                <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
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
                        style={{ backgroundColor: tag.color ?? "#6C2BD9" }}
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
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-[#6C2BD9] hover:text-[#6C2BD9] transition-colors disabled:opacity-50"
                  >
                    <Plus size={12} />
                    Add tag
                    <ChevronDown size={12} />
                  </button>

                  {showModalTagDropdown && (
                    <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
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
                                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
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
                                      backgroundColor: tag.color ?? "#6C2BD9",
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
                            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleCreateModalTag}
                            disabled={!newModalTagName.trim()}
                            className="rounded bg-[#6C2BD9] px-2 py-1 text-xs font-medium text-white hover:bg-[#5b24b8] disabled:opacity-50 transition-colors"
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
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#5b24b8] transition-colors disabled:opacity-70"
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
