import type { Metadata } from "next";
import {
  getBusinessNameForRequest,
  getTestimonialRequestByToken,
} from "@/lib/data/testimonials";

// Personal links get shared over text/email — the preview should describe the
// testimonial ask, not the app.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  let title = "Share a quick testimonial";
  let description =
    "3 questions, about 2 minutes — your words about working together.";

  try {
    const { token } = await params;
    const request = await getTestimonialRequestByToken(token);

    if (request && request.status !== "archived") {
      const businessName = await getBusinessNameForRequest(request);
      title = `Share a quick testimonial for ${businessName}`;
      description = `${request.client_name.split(/\s+/)[0]}, would you share a few words about working with ${businessName}? 3 questions, about 2 minutes.`;
    }
  } catch {
    // Fall back to the generic copy.
  }

  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
    },
  };
}

export default function TestimonialFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
