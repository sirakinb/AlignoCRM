import { BookOpen, KeyRound, Send, ShieldCheck, Webhook } from "lucide-react";

const webhookFields = [
  {
    field: "name",
    required: "Name required",
    notes: "Full contact name. Alternatively send first_name and last_name separately.",
  },
  {
    field: "email",
    required: "Email or phone",
    notes: "Must be a valid email address when provided.",
  },
  {
    field: "phone",
    required: "Email or phone",
    notes: "Any phone format. phone_number is accepted as an alias.",
  },
  {
    field: "details",
    required: "Optional",
    notes: "Free-text lead details, saved as contact notes. message and case_details are accepted aliases.",
  },
  {
    field: "pipeline_id / pipeline_name",
    required: "Optional",
    notes: "Target pipeline for the new lead. Defaults to your first pipeline.",
  },
  {
    field: "stage_id / stage_name",
    required: "Optional",
    notes: "Target stage inside the pipeline. Defaults to the first stage.",
  },
];

const webhookRequestExample = `curl -X POST "https://<alignocrm-domain>/api/webhooks/lead" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <ALIGNO_USER_API_KEY>" \\
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "+15551234567",
    "email": "jane@example.com"
  }'`;

const webhookResponseExample = `{
  "contactId": "contact-uuid",
  "dealId": "deal-uuid",
  "pipelineId": "pipeline-uuid",
  "stageId": "stage-uuid"
}`;

const endpointFields = [
  {
    field: "name",
    required: "Yes",
    notes: "Full contact name. The API splits the first word into first name and the rest into last name.",
  },
  {
    field: "email",
    required: "Email or phone",
    notes: "Must be a valid email address when provided.",
  },
  {
    field: "phone",
    required: "Email or phone",
    notes: "Send any phone format your source system stores.",
  },
  {
    field: "source",
    required: "Yes",
    notes: "Used to create or reuse a source tag, such as source:website.",
  },
  {
    field: "workspace_id",
    required: "Optional",
    notes: "Defaults to default. Omit this unless AlignoCRM gives you a specific workspace ID.",
  },
];

const requestExample = `curl -X POST "https://<alignocrm-domain>/api/contacts" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <ALIGNO_USER_API_KEY>" \\
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+15551234567",
    "source": "website"
  }'`;

const responseExample = `{
  "contactId": "contact-uuid",
  "sourceTagId": "tag-uuid-or-null"
}`;

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="crisp-card p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e7e7ea] bg-[#fafafa]">
            <BookOpen size={16} strokeWidth={1.8} className="text-zinc-500" />
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Developer Docs
            </p>
            <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">
              AlignoCRM API
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-zinc-600">
              This page documents the internal API surface available today. It
              starts with API keys and contact creation, and will expand as new
              endpoints are added.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: KeyRound,
            title: "API Keys",
            text: "Create or regenerate a user-scoped API key from Settings. The full key is shown once.",
          },
          {
            icon: ShieldCheck,
            title: "Authentication",
            text: "Send the key with x-api-key or Authorization: Bearer on every internal API request.",
          },
          {
            icon: Send,
            title: "Current Endpoint",
            text: "POST /api/contacts creates a CRM contact and returns the new contact ID.",
          },
        ].map((item) => (
          <div key={item.title} className="crisp-card p-5">
            <item.icon size={16} strokeWidth={1.8} className="mb-3 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900">{item.title}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-zinc-600">{item.text}</p>
          </div>
        ))}
      </div>

      <section className="crisp-card mt-6 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Authentication</h2>
        <p className="mt-1.5 text-[13px] leading-6 text-zinc-600">
          Users create API keys from the Settings page. AlignoCRM stores only a
          hash of the key, so the raw value should be copied and stored securely
          when it is generated.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <code className="rounded-lg bg-zinc-950 px-4 py-3 text-[13px] text-zinc-100">
            x-api-key: &lt;ALIGNO_USER_API_KEY&gt;
          </code>
          <code className="rounded-lg bg-zinc-950 px-4 py-3 text-[13px] text-zinc-100">
            Authorization: Bearer &lt;ALIGNO_USER_API_KEY&gt;
          </code>
        </div>
      </section>

      <section className="crisp-card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Create Contact
            </h2>
            <p className="mt-1.5 text-[13px] text-zinc-600">
              Creates a CRM contact from an external source.
            </p>
          </div>
          <div className="rounded-md bg-[#efe7fb] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#5b21b6]">
            POST /api/contacts
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-[#e7e7ea]">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-[#e7e7ea] bg-[#fafafa] text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Field</th>
                <th className="px-4 py-2.5 font-medium">Required</th>
                <th className="px-4 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f2]">
              {endpointFields.map((field) => (
                <tr key={field.field} className="hover:bg-zinc-50/80">
                  <td className="px-4 py-2.5 font-mono text-zinc-900">
                    {field.field}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700">{field.required}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{field.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">
              Example Request
            </h3>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
              <code>{requestExample}</code>
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">
              Success Response
            </h3>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
              <code>{responseExample}</code>
            </pre>
            <p className="mt-3 text-[13px] leading-6 text-zinc-600">
              A successful request returns <code>201 Created</code>. Treat{" "}
              <code>contactId</code> as the main success indicator.
            </p>
          </div>
        </div>
      </section>

      <section className="crisp-card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Webhook size={16} strokeWidth={1.8} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900">Lead Webhook</h2>
            </div>
            <p className="mt-1.5 text-[13px] text-zinc-600">
              Send lead details here to create a contact and a pipeline lead in
              one call. Point your form service or backend at this endpoint.
            </p>
          </div>
          <div className="rounded-md bg-[#efe7fb] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#5b21b6]">
            POST /api/webhooks/lead
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-[#e7e7ea]">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-[#e7e7ea] bg-[#fafafa] text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Field</th>
                <th className="px-4 py-2.5 font-medium">Required</th>
                <th className="px-4 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f2]">
              {webhookFields.map((field) => (
                <tr key={field.field} className="hover:bg-zinc-50/80">
                  <td className="px-4 py-2.5 font-mono text-zinc-900">
                    {field.field}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700">{field.required}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{field.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">
              Example Request
            </h3>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
              <code>{webhookRequestExample}</code>
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">
              Success Response
            </h3>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
              <code>{webhookResponseExample}</code>
            </pre>
            <p className="mt-3 text-[13px] leading-6 text-zinc-600">
              A successful request returns <code>201 Created</code> with the new
              contact and lead. Authenticate with your Settings API key via{" "}
              <code>x-api-key</code>, and keep the key in server-side code only.
            </p>
          </div>
        </div>
      </section>

      <section className="crisp-card mt-6 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Error Handling</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["401", "Missing, invalid, or revoked API key."],
            ["400", "Validation issue with name, email, phone, or source."],
            ["500", "Unexpected server or database failure. Retry with backoff."],
          ].map(([code, text]) => (
            <div key={code} className="rounded-lg border border-[#e7e7ea] bg-[#fafafa] p-4">
              <p className="font-mono text-sm font-semibold tabular-nums text-zinc-900">{code}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-zinc-600">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
