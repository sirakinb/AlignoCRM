# PRD: AI-Native Pipeline And Workflow Command Center

## Introduction / Overview

Build an AI-native, pipeline-first CRM and workflow command center for agencies, creators, coaches, and consultants who want the highest-value parts of GoHighLevel without the platform sprawl. V1 is centered on two jobs:

- managing deal flow through pipelines and stages
- running workflow automation tied directly to CRM activity

The product should combine:

- the centralized, easy-to-organize workflow structure of GoHighLevel
- the visual polish and aesthetic quality of Make
- a simpler learning curve than Make for common business automations

This is not a general-purpose automation platform, website builder, or agent operating system in V1. It is a focused command center for pipeline management, workflow automation, email campaigns, SMS campaigns, a small set of app integrations, and a narrow set of AI-native workflow actions.

Assumptions for this PRD:

- V1 is a web application for internal use first, then early external design partners.
- V1 supports one primary workspace model with multiple users, but not full white-labeling.
- V1 uses InsForge for database, authentication, storage, and backend primitives.
- V1 uses third-party providers for workflow execution, email delivery, and SMS delivery.
- V1 uses AI selectively inside workflows for ambiguity, judgment, and drafting, not as an open-ended agent platform.
- MCP exposure remains a future layer, not core V1 scope.

## Goals

- Replace the founder's highest-value GoHighLevel usage with an owned product.
- Give service businesses one place to manage leads, deals, stages, campaigns, and follow-up.
- Support deterministic workflows with waits, branching, email, SMS, and CRM actions.
- Support a small set of AI-native workflow actions for analysis, routing, drafting, and approval-based execution.
- Make workflow creation feel more straightforward and organized than Make.
- Create a product foundation that can later support AI agents, APIs, and MCP tools without needing a rewrite.

## User Stories

### US-001: Create core CRM records
**Description:** As an operator, I want to create and manage contacts, deals, pipelines, stages, tags, and tasks so that the command center can store the business context needed for pipeline management and automation.

**Acceptance Criteria:**
- [ ] The system stores contacts with name, email, phone, tags, owner, and status fields.
- [ ] The system stores deals with pipeline, stage, value, owner, and linked contact.
- [ ] The system stores configurable pipelines and stages.
- [ ] The system stores tasks linked to a contact or deal.
- [ ] Records can be created, updated, and archived without data loss.
- [ ] Typecheck and lint pass.

### US-002: View pipeline by stage
**Description:** As a sales or operations user, I want a stage-based pipeline view so that I can see where leads and deals currently sit.

**Acceptance Criteria:**
- [ ] The UI displays deals grouped by pipeline stage.
- [ ] A user can move a deal from one stage to another.
- [ ] Stage changes create an activity log entry.
- [ ] The pipeline view loads with sample data in development.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-003: Record business events
**Description:** As the system, I want to emit business events when important CRM and pipeline actions happen so that workflows can start and branch from real behavior.

**Acceptance Criteria:**
- [ ] The system emits events for `contact_created`, `tag_added`, `deal_stage_changed`, `task_created`, and `form_submitted`.
- [ ] Event payloads include the record ID, workspace ID, timestamp, and relevant metadata.
- [ ] Events are stored or forwarded in a way the workflow runner can consume reliably.
- [ ] Duplicate event handling is defined for idempotent processing.
- [ ] Typecheck and lint pass.

### US-004: Create draft workflows
**Description:** As an operator, I want to create workflow drafts from a visual builder so that I can configure automation without writing code and keep workflows organized in one place.

**Acceptance Criteria:**
- [ ] A workflow draft can be created with a name, description, and status.
- [ ] The builder stores nodes and edges in a versioned workflow definition.
- [ ] The builder supports saving drafts without publishing them.
- [ ] The workflow definition validates before save and returns clear errors for invalid nodes.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-005: Configure trigger nodes
**Description:** As an operator, I want to configure a workflow trigger so that contacts or deals can enter a workflow automatically.

**Acceptance Criteria:**
- [ ] V1 supports trigger types for `contact_created`, `tag_added`, `deal_stage_changed`, and `form_submitted`.
- [ ] Each trigger can be filtered by basic conditions such as tag, pipeline, stage, or form ID.
- [ ] The builder prevents publishing a workflow with no trigger.
- [ ] Trigger configuration is visible in the workflow summary panel.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-006: Configure deterministic action nodes
**Description:** As an operator, I want to add repeatable action nodes so that the workflow can move leads and deals through a process automatically.

**Acceptance Criteria:**
- [ ] V1 supports action nodes for `send_email`, `send_sms`, `add_tag`, `remove_tag`, `move_deal_stage`, `create_task`, `webhook`, and `stop_workflow`.
- [ ] Each action node stores the fields required to execute that action.
- [ ] Action node forms validate required fields before save.
- [ ] The builder shows action node labels on the canvas after configuration.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-007: Configure wait, if/else, and approval nodes
**Description:** As an operator, I want waits, conditional branches, and approval points so that workflows can follow time-based, rule-based, and human-reviewed paths.

**Acceptance Criteria:**
- [ ] V1 supports wait durations in minutes, hours, and days.
- [ ] V1 supports if/else conditions for tag presence, field equality, deal stage, and prior activity state.
- [ ] The builder supports two distinct outgoing paths for an if/else node.
- [ ] V1 supports a human approval node that pauses execution until approved, rejected, or edited.
- [ ] Invalid conditional configurations cannot be published.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-008: Publish workflow versions
**Description:** As an operator, I want to publish a workflow version so that new enrollments use an approved configuration and in-flight runs remain stable.

**Acceptance Criteria:**
- [ ] Publishing creates an immutable workflow version record.
- [ ] Active enrollments keep using the version they started with.
- [ ] Draft edits do not change the behavior of already published workflows.
- [ ] The UI distinguishes clearly between draft and published versions.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-009: Enroll records into workflows
**Description:** As the system, I want records to enroll into workflows when triggers fire so that automation begins without manual work.

**Acceptance Criteria:**
- [ ] The system creates an enrollment record when a trigger condition matches.
- [ ] Enrollment rules support a setting for whether the same record can enroll more than once.
- [ ] An enrollment stores current node, workflow version, status, and timestamps.
- [ ] Enrollment processing is idempotent so the same event does not create duplicate runs.
- [ ] Typecheck and lint pass.

### US-010: Execute workflows reliably
**Description:** As an operator, I want workflows to continue across waits, retries, and failures so that automation can be trusted.

**Acceptance Criteria:**
- [ ] Workflow execution is delegated to a third-party durable workflow runner rather than a custom timer system.
- [ ] Wait nodes resume without manual intervention after the configured delay.
- [ ] Failed steps retry according to a defined retry policy.
- [ ] The system records failed, skipped, completed, and canceled step outcomes.
- [ ] Typecheck and lint pass.

### US-011: Send campaign messages
**Description:** As an operator, I want to send campaign emails and SMS messages from workflows so that I can automate follow-up and onboarding.

**Acceptance Criteria:**
- [ ] Email actions send through a configured provider account.
- [ ] SMS actions send through a configured provider account.
- [ ] Message templates support variable interpolation from CRM fields.
- [ ] Provider responses are logged against the enrollment and contact record.
- [ ] Typecheck and lint pass.

### US-012: Configure AI action nodes
**Description:** As an operator, I want AI-native workflow steps so that the system can handle ambiguous tasks inside a structured workflow.

**Acceptance Criteria:**
- [ ] V1 supports an `ai_analyze` node that summarizes CRM context or classifies a record into structured output fields.
- [ ] V1 supports an `ai_route` node that returns a structured decision used by later workflow branches.
- [ ] V1 supports an `ai_draft_message` node that drafts email or SMS content from workflow context.
- [ ] AI node configuration requires a prompt template, available context fields, and expected output schema when structured output is required.
- [ ] AI outputs are logged per workflow run and visible in execution history.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-013: Review AI-generated outputs before action
**Description:** As an operator, I want AI-generated messages or decisions to be reviewable before external actions are taken so that the system remains trustworthy.

**Acceptance Criteria:**
- [ ] An approval step can show the AI-generated output and its relevant context.
- [ ] A user can approve, reject, or edit the generated output before the workflow continues.
- [ ] Workflows can be configured so some AI outputs continue automatically while high-risk outputs require approval.
- [ ] Approval history is stored with actor, timestamp, and outcome.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

### US-014: Manage connected app actions
**Description:** As an operator, I want workflows to send or receive data from connected apps so that the command center can automate across the tools I already use.

**Acceptance Criteria:**
- [ ] V1 supports outbound webhook actions with configurable URL, method, headers, and body.
- [ ] V1 supports storing connection metadata for approved integrations without exposing secrets in the UI.
- [ ] Integration failures are visible in workflow execution logs.
- [ ] The initial integration model is simple enough to add a few curated app connections without a full marketplace.
- [ ] Typecheck and lint pass.

### US-015: View enrollment history and execution logs
**Description:** As an operator, I want to inspect who entered a workflow and what happened at each step so that I can debug and trust automation.

**Acceptance Criteria:**
- [ ] The UI shows enrollments by status: active, completed, failed, canceled.
- [ ] Each enrollment shows a chronological step log with timestamps and outcomes.
- [ ] Failed steps include the provider or execution error message.
- [ ] Users can filter logs by workflow, contact, and status.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the `dev-browser` skill.

## Functional Requirements

- FR-1: The system must provide CRM entities for contacts, deals, pipelines, stages, tasks, tags, and activity logs.
- FR-2: The system must provide at least one stage-based pipeline view for deals.
- FR-3: The system must emit workflow-relevant business events from CRM actions.
- FR-4: The system must support visual workflow drafts composed of nodes and edges.
- FR-5: The system must support trigger nodes for `contact_created`, `tag_added`, `deal_stage_changed`, and `form_submitted`.
- FR-6: The system must support action nodes for sending email, sending SMS, adding tags, removing tags, moving deal stages, creating tasks, invoking webhooks, and stopping workflows.
- FR-7: The system must support wait nodes with minute, hour, and day durations.
- FR-8: The system must support if/else nodes with basic CRM conditions.
- FR-9: The system must validate workflow definitions before publishing.
- FR-10: The system must version published workflows so active enrollments remain stable.
- FR-11: The system must create and track workflow enrollments per record.
- FR-12: The system must delegate long-running execution, waits, and retries to a durable third-party workflow runner.
- FR-13: The system must integrate with a third-party email provider for delivery.
- FR-14: The system must integrate with a third-party SMS provider for delivery.
- FR-15: The system must provide message templates with CRM field interpolation.
- FR-16: The system must provide execution logs at both enrollment and step level.
- FR-17: The system must support AI action nodes for analysis, routing, and message drafting.
- FR-18: The system must support structured AI outputs that can be used safely by later workflow steps.
- FR-19: The system must support human approval nodes that can pause and resume workflow execution.
- FR-20: The system must support outbound webhook actions and a simple curated integration model for connected apps.
- FR-21: The system must use InsForge as the primary backend for auth, database, and storage.
- FR-22: The system must keep provider integrations, model integrations, and workflow runner implementation behind internal service boundaries so they can be replaced later.
- FR-23: The system must be designed so future AI, API, and MCP exposure can be added without redesigning core entities and actions.

## Non-Goals (Out of Scope)

- No landing page builder in V1.
- No social media scheduler or content publishing suite in V1.
- No website builder or funnel builder in V1.
- No custom email warm-up, deliverability, or inbox infrastructure in V1.
- No custom SMS transport infrastructure in V1.
- No open-ended multi-agent operating system in V1.
- No general-purpose agent builder in V1.
- No fully autonomous AI actions on high-risk external steps without an approval path.
- No voice agent, call center, or phone dialer in V1.
- No marketplace for templates, integrations, or agents in V1.
- No fully autonomous agents that take external actions without approval in V1.
- No generic developer IDE, code-generation workspace, or Lovable/Cursor replacement in V1.
- No full white-label or agency sub-account architecture in V1.

## Design Considerations

### Workflow Builder — Node-Based Canvas

- The workflow builder uses an n8n / Make.com-style node canvas, not a Zapier-style linear step list or a GoHighLevel-style form wizard.
- Nodes are compact, rounded shapes (squircles with high border-radius, roughly 160x70px) on an infinite zoomable canvas with a subtle dot grid background. The shape should feel circular/spherical — closer to n8n's rounded node style than flat rectangular cards.
- Each node has a prominent colored icon badge or accent indicating its type: green for triggers, blue for actions, purple for AI nodes, orange for conditions/branches, gray for waits/delays. Color is applied as a top border, background tint, or icon badge — not a flat left-side stripe.
- Each node displays a small type label (e.g. "TRIGGER", "ACTION", "AI"), a bold title, and an optional one-line subtitle. Keep nodes compact and scannable.
- Nodes connect via curved bezier edge lines flowing left to right. Connection points are small circles centered on the right (output) and left (input) edges of each node.
- The canvas supports parallel branches that split from condition nodes and can merge back downstream.
- Node configuration opens in a right-side settings panel (roughly 320px wide), not in an inline modal or popup. The panel shows fields relevant to the selected node type.
- Integrations (Slack, Gmail, webhooks, etc.) are nodes on the canvas, not a separate integrations panel or bottom dock.
- Canvas controls include zoom in/out, zoom percentage, fit-to-view, and a minimap toggle in a bottom toolbar.
- The builder includes undo, redo, test, and publish controls in the top bar.
- A node palette or add-node menu allows users to discover and add available node types. This can be triggered from a "+" button on the canvas or from connection endpoints.

### AI Review and Approval

- The AI review screen is focused and minimal. The primary job is reviewing and approving the AI-generated draft, not navigating complex context.
- The draft (email, message, or structured output) is the dominant visual element, displayed in a clean card centered on the page.
- Execution context (trigger event, source data, AI prompt used) is available in a collapsed expandable section below the draft, not in an always-visible sidebar.
- Action buttons (Edit, Reject, Approve & Send) are prominently placed above the draft.
- No inline workflow history timeline, no AI confidence scores, no suggested next steps section. Keep the page focused on the single review task.
- Regenerate and copy actions sit below the draft card as secondary controls.

### General

- Pipeline, workflow, and execution logs should feel connected as one command center rather than separate modules.
- The UX should reduce the learning curve for building business automations compared with Make while maintaining Make's visual quality.
- AI steps should look native to the workflow builder (purple-bordered node cards) rather than bolted on as a separate product area.
- Approval states, AI outputs, and human edits should be visually obvious and easy to audit in execution logs.

## Technical Considerations

- Recommended frontend stack: Next.js with React and a visual graph library such as React Flow.
- Recommended backend platform: InsForge for Postgres database access, authentication, storage, serverless functions, and possible realtime support.
- Recommended deployment path: use InsForge deployment tooling for frontend deployment if it fits the project workflow.
- Recommended database schema: separate CRM records, workflow definitions, workflow versions, enrollments, message templates, provider connections, AI outputs, approval states, and execution logs.
- Recommended workflow execution layer: Trigger.dev first, with the internal workflow schema designed so the runner can be swapped later if needed.
- Recommended email provider: Resend or Postmark.
- Recommended SMS provider: Twilio.
- InsForge serverless functions can be used for integration endpoints, provider webhooks, and secure backend logic, but not as the primary durable workflow engine.
- Trigger.dev should also power AI-native workflow steps that require long-running runs, retries, pause/resume, or human-in-the-loop waiting.
- Model providers should be used through an internal AI service layer so prompts, structured outputs, and approval policies stay application-controlled.
- Workflow actions should be modeled as internal capabilities first so they can later be exposed through APIs or MCP tools.

## Success Metrics

- The founder can manage live deal flow in the new pipeline view instead of GoHighLevel for at least one real process.
- The founder can replace at least 3 existing GoHighLevel workflows with the new system.
- A user can create and publish a basic workflow in under 15 minutes.
- Workflow runs complete without duplicate sends for at least 99% of enrollments in staging and early production usage.
- At least 80% of workflow execution failures surface a clear error message in logs without requiring direct database inspection.
- Pilot users report that workflows are easier to understand and organize than equivalent setups in Make.
- Pilot users can successfully use at least one AI-native workflow step with clear logs and review controls.

## Open Questions

- Should V1 support custom fields beyond the default CRM schema, or should that wait until after core workflows are stable?
- Should project management entities live inside this same product in V1, or remain a separate system initially?
- What level of permissions is required for early multi-user teams: owner/admin/member, or something more granular?
- Should SMS be in true V1, or should the first release focus on email and internal task creation only?
- Which AI-native nodes belong in true V1 versus V1.1: analyze, route, draft, extract, or approve?
- Which workflow actions should always require approval when AI is involved?
- Which curated integrations matter most for the founder's first real workflows?
- Should the initial brand position as a CRM, command center, operating system, or a more opinionated combination of those terms?
- What is the first narrow launch segment within the broader service-business category: agencies, creators, coaches, or consultants?
