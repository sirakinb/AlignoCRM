# Dropcard to AlignoCRM API Brief

## Goal

Build a Dropcard sync that sends newly captured digital business card contacts into AlignoCRM through AlignoCRM's internal contacts API.

The first supported endpoint is a contact creation endpoint:

```text
POST /api/contacts
```

It accepts a contact's name, email, phone, and source, then returns the created AlignoCRM contact ID.

## Base URL

Use the AlignoCRM deployment base URL for production.

Examples:

```text
Local development: http://localhost:9000
Production: https://<alignocrm-domain>
```

## Authentication

Each AlignoCRM user can create an API key from the Settings page.

Settings path:

```text
/settings
```

The user can create or regenerate a key and copy it immediately. The full key is only shown once. Later displays show only a masked key.

Supported auth headers:

```http
x-api-key: <ALIGNO_USER_API_KEY>
```

or:

```http
Authorization: Bearer <ALIGNO_USER_API_KEY>
```

Use one of those headers on every Dropcard-to-AlignoCRM API request.

## Contact Create Endpoint

```http
POST /api/contacts
Content-Type: application/json
x-api-key: <ALIGNO_USER_API_KEY>
```

### Request Body

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+15551234567",
  "source": "dropcard"
}
```

### Fields

| Field | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Full name. AlignoCRM splits the first word into `first_name` and the rest into `last_name`. If only one name is provided, `last_name` is set to `-`. |
| `email` | Conditionally | At least one of `email` or `phone` is required. If provided, email must be valid. |
| `phone` | Conditionally | At least one of `email` or `phone` is required. |
| `source` | Yes | Used to tag the contact. For Dropcard, send `dropcard` or a more specific source string like `dropcard-event-name`. |
| `workspace_id` | Optional | Defaults to `default`. Do not send unless AlignoCRM gives Dropcard a specific workspace ID. |

### Success Response

```http
201 Created
```

```json
{
  "contactId": "contact-uuid",
  "sourceTagId": "tag-uuid-or-null"
}
```

`sourceTagId` may be `null` if contact creation succeeds but source tagging fails. Treat `contactId` as the main success indicator.

### Error Responses

```http
401 Unauthorized
```

Returned when the API key is missing, revoked, or invalid.

```http
400 Bad Request
```

Returned for validation errors:

```json
{ "error": "Missing required field: name" }
```

```json
{ "error": "Provide at least one contact method: email or phone" }
```

```json
{ "error": "Invalid email address" }
```

```json
{ "error": "Missing required field: source" }
```

```http
500 Internal Server Error
```

Returned for unexpected server/database failures.

## Source Tag Behavior

AlignoCRM creates or reuses a tag based on the `source` field.

Examples:

| Sent Source | AlignoCRM Tag |
| --- | --- |
| `dropcard` | `source:dropcard` |
| `Dropcard Conference 2026` | `source:dropcard-conference-2026` |

This lets AlignoCRM users filter contacts imported from Dropcard.

## Example cURL

```bash
curl -X POST "https://<alignocrm-domain>/api/contacts" \
  -H "Content-Type: application/json" \
  -H "x-api-key: <ALIGNO_USER_API_KEY>" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+15551234567",
    "source": "dropcard"
  }'
```

## Dropcard Sync Recommendations

Dropcard should:

1. Store the AlignoCRM API key securely per connected Dropcard account or workspace.
2. Send contacts to `POST /api/contacts` when a new business card/contact is captured.
3. Send `source: "dropcard"` by default, or a more specific event/campaign source when available.
4. Retry transient `5xx` failures with backoff.
5. Do not retry permanent `400` validation errors without fixing the payload.
6. If AlignoCRM returns `401`, prompt the user to reconnect or paste a new API key.
7. Store the returned `contactId` against the Dropcard contact to avoid duplicate syncs.

## Current AlignoCRM Implementation Notes

The API key is hashed before storage. AlignoCRM does not store the raw key.

The active key is user-scoped. Regenerating a key revokes the previous active key for that user.

The shared internal API auth helper supports this key model for future endpoints, so Dropcard should expect the same API key to work for additional AlignoCRM endpoints as they are added.
