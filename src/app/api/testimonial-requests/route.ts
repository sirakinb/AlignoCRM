import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getContact } from "@/lib/data/contacts";
import {
  createTestimonialRequest,
  getTestimonialRequests,
} from "@/lib/data/testimonials";

function generateToken(clientName: string) {
  const slug = clientName
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  return slug ? `${slug}-${suffix}` : suffix;
}

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const requests = await getTestimonialRequests(tenant.workspaceId);

    return NextResponse.json({ requests });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/testimonial-requests error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const user = await getAuthenticatedUser();
    const body = await request.json();

    const contactId =
      typeof body.contactId === "string" && body.contactId ? body.contactId : null;
    let clientName =
      typeof body.clientName === "string" ? body.clientName.trim() : "";
    let clientCompany =
      typeof body.clientCompany === "string" ? body.clientCompany.trim() : "";

    if (contactId) {
      const contact = await getContact(contactId);
      if (contact.workspace_id !== tenant.workspaceId) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }

      clientName =
        clientName ||
        `${contact.first_name ?? ""} ${contact.last_name === "-" ? "" : contact.last_name ?? ""}`.trim();
      clientCompany = clientCompany || contact.company || "";
    }

    if (!clientName) {
      return NextResponse.json(
        { error: "Pick a contact or enter a client name" },
        { status: 400 }
      );
    }

    const testimonialRequest = await createTestimonialRequest({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      ...(contactId ? { contact_id: contactId } : {}),
      client_name: clientName,
      client_company: clientCompany,
      token: generateToken(clientName),
      ...(user?.id ? { created_by: user.id } : {}),
    });

    return NextResponse.json({ request: testimonialRequest }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/testimonial-requests error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
