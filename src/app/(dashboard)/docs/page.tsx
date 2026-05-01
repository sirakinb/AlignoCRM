import { BookOpen, KeyRound, Send, ShieldCheck } from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";

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
    notes: "Used to create or reuse a source tag, such as source:dropcard.",
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
    "source": "dropcard"
  }'`;

const responseExample = `{
  "contactId": "contact-uuid",
  "sourceTagId": "tag-uuid-or-null"
}`;

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div
        className="rounded-2xl border bg-white p-8 shadow-sm"
        style={{
          borderColor: withAlpha(getPurpleScaleColor(4), 0.18),
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,240,255,0.88))",
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: withAlpha(getPurpleScaleColor(2), 0.18),
              color: getPurpleScaleColor(5),
            }}
          >
            <BookOpen size={24} />
          </div>
          <div>
            <p
              className="text-sm font-semibold uppercase tracking-[0.2em]"
              style={{ color: getPurpleScaleColor(4) }}
            >
              Developer Docs
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">
              AlignoCRM API
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
              This page documents the internal API surface available today. It
              starts with API keys and contact creation, and will expand as new
              endpoints are added.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
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
          <div
            key={item.title}
            className="rounded-xl border bg-white p-5 shadow-sm"
            style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.16) }}
          >
            <item.icon
              size={20}
              className="mb-4"
              style={{ color: getPurpleScaleColor(4) }}
            />
            <h2 className="font-semibold text-gray-950">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">{item.text}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-950">Authentication</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Users create API keys from the Settings page. AlignoCRM stores only a
          hash of the key, so the raw value should be copied and stored securely
          when it is generated.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <code className="rounded-lg bg-gray-950 px-4 py-3 text-sm text-white">
            x-api-key: &lt;ALIGNO_USER_API_KEY&gt;
          </code>
          <code className="rounded-lg bg-gray-950 px-4 py-3 text-sm text-white">
            Authorization: Bearer &lt;ALIGNO_USER_API_KEY&gt;
          </code>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">
              Create Contact
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Creates a CRM contact from an external source such as Dropcard.
            </p>
          </div>
          <div
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{
              backgroundColor: withAlpha(getPurpleScaleColor(2), 0.16),
              color: getPurpleScaleColor(5),
            }}
          >
            POST /api/contacts
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {endpointFields.map((field) => (
                <tr key={field.field}>
                  <td className="px-4 py-3 font-mono text-gray-950">
                    {field.field}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{field.required}</td>
                  <td className="px-4 py-3 text-gray-600">{field.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-950">
              Example Request
            </h3>
            <pre className="overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-gray-100">
              <code>{requestExample}</code>
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-950">
              Success Response
            </h3>
            <pre className="overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-gray-100">
              <code>{responseExample}</code>
            </pre>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              A successful request returns <code>201 Created</code>. Treat{" "}
              <code>contactId</code> as the main success indicator.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-950">Error Handling</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["401", "Missing, invalid, or revoked API key."],
            ["400", "Validation issue with name, email, phone, or source."],
            ["500", "Unexpected server or database failure. Retry with backoff."],
          ].map(([code, text]) => (
            <div key={code} className="rounded-xl bg-gray-50 p-4">
              <p className="font-mono text-lg font-bold text-gray-950">{code}</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
