import { insforge } from "@/lib/insforge/server";
import { ALIGNO_PURPLE_SCALE } from "@/lib/design/aligno-theme";

export async function seed() {
  // 1. Create workspace
  const { data: workspace } = await insforge.database
    .from("workspaces")
    .insert({ name: "Aligno Demo Workspace" })
    .select()
    .single();

  const wsId = workspace!.id;

  // 2. Create pipelines
  const pipelineData = [
    { workspace_id: wsId, name: "Sales Pipeline", description: "Main sales funnel", position: 0 },
    { workspace_id: wsId, name: "Partnership Pipeline", description: "Partner deals", position: 1 },
  ];

  const { data: pipelines } = await insforge.database
    .from("pipelines")
    .insert(pipelineData)
    .select();

  // 3. Create stages for each pipeline
  const stageColors = [...ALIGNO_PURPLE_SCALE];
  const salesStages = [
    "Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won",
  ];
  const partnerStages = [
    "Initial Contact", "Evaluation", "Terms Discussion", "Agreement", "Active Partner",
  ];

  const stageInputs = [
    ...salesStages.map((name, i) => ({
      pipeline_id: pipelines![0].id,
      name,
      position: i,
      color: stageColors[i],
    })),
    ...partnerStages.map((name, i) => ({
      pipeline_id: pipelines![1].id,
      name,
      position: i,
      color: stageColors[i],
    })),
  ];

  const { data: stages } = await insforge.database
    .from("stages")
    .insert(stageInputs)
    .select();

  // 4. Create contacts
  const contactInputs = [
    { workspace_id: wsId, first_name: "Alice", last_name: "Johnson", email: "alice@acme.com", phone: "555-0101" },
    { workspace_id: wsId, first_name: "Bob", last_name: "Smith", email: "bob@globex.com", phone: "555-0102" },
    { workspace_id: wsId, first_name: "Carol", last_name: "Williams", email: "carol@initech.com", phone: "555-0103" },
    { workspace_id: wsId, first_name: "David", last_name: "Brown", email: "david@umbrella.com", phone: "555-0104" },
    { workspace_id: wsId, first_name: "Eve", last_name: "Davis", email: "eve@wayne.com", phone: "555-0105" },
    { workspace_id: wsId, first_name: "Frank", last_name: "Miller", email: "frank@stark.com", phone: "555-0106" },
    { workspace_id: wsId, first_name: "Grace", last_name: "Wilson", email: "grace@oscorp.com", phone: "555-0107" },
    { workspace_id: wsId, first_name: "Henry", last_name: "Moore", email: "henry@lexcorp.com", phone: "555-0108" },
    { workspace_id: wsId, first_name: "Iris", last_name: "Taylor", email: "iris@cyberdyne.com", phone: "555-0109" },
    { workspace_id: wsId, first_name: "Jack", last_name: "Anderson", email: "jack@weyland.com", phone: "555-0110" },
  ];

  const { data: contacts } = await insforge.database
    .from("contacts")
    .insert(contactInputs)
    .select();

  // 5. Create deals across different stages
  const salesStageIds = stages!.filter((s: { pipeline_id: string }) => s.pipeline_id === pipelines![0].id);
  const partnerStageIds = stages!.filter((s: { pipeline_id: string }) => s.pipeline_id === pipelines![1].id);

  const dealInputs = [
    { workspace_id: wsId, pipeline_id: pipelines![0].id, stage_id: salesStageIds[0].id, contact_id: contacts![0].id, title: "Acme Corp Enterprise Deal", value: 50000 },
    { workspace_id: wsId, pipeline_id: pipelines![0].id, stage_id: salesStageIds[1].id, contact_id: contacts![1].id, title: "Globex Subscription", value: 12000 },
    { workspace_id: wsId, pipeline_id: pipelines![0].id, stage_id: salesStageIds[2].id, contact_id: contacts![2].id, title: "Initech Platform License", value: 35000 },
    { workspace_id: wsId, pipeline_id: pipelines![0].id, stage_id: salesStageIds[3].id, contact_id: contacts![3].id, title: "Umbrella Annual Contract", value: 75000 },
    { workspace_id: wsId, pipeline_id: pipelines![0].id, stage_id: salesStageIds[4].id, contact_id: contacts![4].id, title: "Wayne Enterprises Onboarding", value: 120000, status: "won" as const },
    { workspace_id: wsId, pipeline_id: pipelines![1].id, stage_id: partnerStageIds[0].id, contact_id: contacts![5].id, title: "Stark Industries Partnership", value: 200000 },
    { workspace_id: wsId, pipeline_id: pipelines![1].id, stage_id: partnerStageIds[2].id, contact_id: contacts![6].id, title: "Oscorp Integration", value: 80000 },
    { workspace_id: wsId, pipeline_id: pipelines![1].id, stage_id: partnerStageIds[4].id, contact_id: contacts![7].id, title: "LexCorp Referral Program", value: 45000 },
  ];

  await insforge.database.from("deals").insert(dealInputs).select();

  // 6. Create tags
  const tagInputs = [
    { workspace_id: wsId, name: "VIP", color: "#ef4444" },
    { workspace_id: wsId, name: "Enterprise", color: "#6366f1" },
    { workspace_id: wsId, name: "Startup", color: "#10b981" },
    { workspace_id: wsId, name: "Referral", color: "#f59e0b" },
    { workspace_id: wsId, name: "Churned", color: "#6b7280" },
  ];

  const { data: tags } = await insforge.database
    .from("tags")
    .insert(tagInputs)
    .select();

  // 7. Create contact-tag associations
  const contactTagInputs = [
    { contact_id: contacts![0].id, tag_id: tags![0].id }, // Alice - VIP
    { contact_id: contacts![0].id, tag_id: tags![1].id }, // Alice - Enterprise
    { contact_id: contacts![1].id, tag_id: tags![2].id }, // Bob - Startup
    { contact_id: contacts![4].id, tag_id: tags![0].id }, // Eve - VIP
    { contact_id: contacts![5].id, tag_id: tags![1].id }, // Frank - Enterprise
    { contact_id: contacts![7].id, tag_id: tags![3].id }, // Henry - Referral
  ];

  await insforge.database.from("contact_tags").insert(contactTagInputs);

  // 8. Create tasks
  const taskInputs = [
    { workspace_id: wsId, contact_id: contacts![0].id, title: "Follow up with Alice on proposal", status: "pending" as const, due_date: "2026-03-20T09:00:00Z" },
    { workspace_id: wsId, contact_id: contacts![1].id, title: "Schedule demo for Bob", status: "in_progress" as const, due_date: "2026-03-15T14:00:00Z" },
    { workspace_id: wsId, contact_id: contacts![3].id, title: "Send contract to David", status: "pending" as const, due_date: "2026-03-18T10:00:00Z" },
    { workspace_id: wsId, title: "Prepare quarterly pipeline review", status: "pending" as const, due_date: "2026-03-25T16:00:00Z" },
    { workspace_id: wsId, contact_id: contacts![6].id, title: "Finalize Oscorp integration terms", status: "completed" as const, due_date: "2026-03-10T11:00:00Z" },
  ];

  await insforge.database.from("tasks").insert(taskInputs);

  console.log("Seed data created successfully");
  return { workspace, pipelines, stages, contacts, tags };
}
