import type { Contact } from "@/types/crm";

export function getContactDisplayName(
  contact: Pick<Contact, "first_name" | "last_name">
) {
  const firstName = contact.first_name?.trim() ?? "";
  const lastName = contact.last_name?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "Unnamed Contact";
}

export function getContactInitials(
  contact: Pick<Contact, "first_name" | "last_name">
) {
  const firstInitial = contact.first_name?.trim().charAt(0) ?? "";
  const lastInitial = contact.last_name?.trim().charAt(0) ?? "";
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();

  return initials || "UC";
}

export function formatContactDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
