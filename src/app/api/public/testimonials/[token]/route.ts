import { NextResponse } from "next/server";
import {
  createTestimonial,
  getBusinessNameForRequest,
  getTestimonialRequestByToken,
  updateTestimonialRequestStatus,
} from "@/lib/data/testimonials";

// Public endpoints for the client-facing testimonial form. The share token is
// the only credential — no auth, so responses expose nothing beyond what the
// form itself displays.

const MIN_ANSWER = 10;
const MAX_ANSWER = 4000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const testimonialRequest = await getTestimonialRequestByToken(token);

    if (!testimonialRequest || testimonialRequest.status === "archived") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const businessName = await getBusinessNameForRequest(testimonialRequest);

    return NextResponse.json({
      clientName: testimonialRequest.client_name,
      clientCompany: testimonialRequest.client_company,
      businessName,
      completed: testimonialRequest.status === "completed",
    });
  } catch (error) {
    console.error("GET /api/public/testimonials/[token] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const testimonialRequest = await getTestimonialRequestByToken(token);

    if (!testimonialRequest || testimonialRequest.status === "archived") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();

    // Honeypot: bots fill the hidden field; pretend success and save nothing.
    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 200) {
      return NextResponse.json(
        { error: "Please tell us your name" },
        { status: 400 }
      );
    }

    const answers: Record<string, string> = {};
    for (const key of ["problem", "solution", "result"] as const) {
      const value = typeof body[key] === "string" ? body[key].trim() : "";
      if (value.length < MIN_ANSWER || value.length > MAX_ANSWER) {
        return NextResponse.json(
          { error: "Please write a little more in each answer" },
          { status: 400 }
        );
      }
      answers[key] = value;
    }

    const role = typeof body.role === "string" ? body.role.trim().slice(0, 200) : "";
    const company =
      typeof body.company === "string" ? body.company.trim().slice(0, 200) : "";

    const testimonial = await createTestimonial({
      workspace_id: testimonialRequest.workspace_id,
      ...(testimonialRequest.organization_id
        ? { organization_id: testimonialRequest.organization_id }
        : {}),
      request_id: testimonialRequest.id,
      ...(testimonialRequest.contact_id
        ? { contact_id: testimonialRequest.contact_id }
        : {}),
      name,
      role,
      company,
      problem: answers.problem,
      solution: answers.solution,
      result: answers.result,
      permission: body.permission !== false,
    });

    if (testimonialRequest.status === "pending") {
      try {
        await updateTestimonialRequestStatus(
          testimonialRequest.id,
          testimonialRequest.workspace_id,
          "completed"
        );
      } catch (statusError) {
        console.error(
          "POST /api/public/testimonials/[token] status update error:",
          statusError
        );
      }
    }

    return NextResponse.json({ ok: true, id: testimonial.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/public/testimonials/[token] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
