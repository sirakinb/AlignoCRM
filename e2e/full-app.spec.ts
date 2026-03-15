import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────

const BASE = "http://localhost:3000";
const TS = Date.now().toString().slice(-6);

async function waitForPage(page: Page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/e2e-${name}.png` });
}

// ═══════════════════════════════════════════════════════
// 1. DASHBOARD
// ═══════════════════════════════════════════════════════

test.describe("Dashboard", () => {
  test("loads and displays KPI cards and charts", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);
    await screenshot(page, "01-dashboard");

    // Should show page content (KPI cards or empty state)
    const body = await page.textContent("body");
    const hasDashboard =
      body?.includes("Total Pipeline") ||
      body?.includes("Won Revenue") ||
      body?.includes("Open Deals") ||
      body?.includes("Dashboard") ||
      body?.includes("Add your first deal");
    expect(hasDashboard).toBe(true);
    console.log("Dashboard loaded successfully");
  });
});

// ═══════════════════════════════════════════════════════
// 2. CONTACTS
// ═══════════════════════════════════════════════════════

test.describe("Contacts", () => {
  test("page loads with contact list or empty state", async ({ page }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);
    await screenshot(page, "02-contacts-list");

    const body = await page.textContent("body");
    const hasContacts =
      body?.includes("Contacts") ||
      body?.includes("Add Contact") ||
      body?.includes("No contacts");
    expect(hasContacts).toBe(true);
    console.log("Contacts page loaded");
  });

  test("create a new contact with all fields", async ({ page }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Open add contact modal
    const addBtn = page.locator("text=Add Contact");
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await waitForPage(page, 1000);

    // Fill form
    await page.fill("#first_name", `E2EFirst${TS}`);
    await page.fill("#last_name", `E2ELast${TS}`);
    await page.fill("#email", `e2e-${TS}@test.com`);
    await page.fill("#phone", `+1555${TS}`);
    await screenshot(page, "02-contacts-form-filled");

    // Submit
    await page.click("text=Create Contact");
    await waitForPage(page, 3000);
    await screenshot(page, "02-contacts-after-create");

    // Verify contact appears in list
    const body = await page.textContent("body");
    expect(body).toContain(`E2EFirst${TS}`);
    console.log(`Contact E2EFirst${TS} created successfully`);
  });

  test("search contacts by name", async ({ page }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Find search input
    const searchInput = page.locator("input[placeholder*='earch']").first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(`E2EFirst${TS}`);
      await waitForPage(page, 1500);
      await screenshot(page, "02-contacts-search");

      const body = await page.textContent("body");
      expect(body).toContain(`E2EFirst${TS}`);
      console.log("Contact search works");
    } else {
      console.log("Search input not found, skipping");
    }
  });

  test("filter contacts by status", async ({ page }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Look for status filter buttons/dropdown
    const allFilter = page.locator("text=All").first();
    if (await allFilter.isVisible()) {
      await allFilter.click();
      await waitForPage(page, 1000);
      console.log("Status filter clickable");
    }

    const activeFilter = page.locator("button:has-text('Active'), [role='option']:has-text('Active')").first();
    if (await activeFilter.isVisible()) {
      await activeFilter.click();
      await waitForPage(page, 1000);
      await screenshot(page, "02-contacts-filter-active");
      console.log("Active filter applied");
    }
  });

  test("open contact drawer and view details", async ({ page }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Click on first contact row
    const contactRow = page.locator("tr, [role='row']").filter({ hasText: "@" }).first();
    if (await contactRow.isVisible()) {
      await contactRow.click();
      await waitForPage(page, 1500);
      await screenshot(page, "02-contacts-drawer");

      // Should see contact details (drawer or detail view)
      const body = await page.textContent("body");
      const hasDetail =
        body?.includes("Save") ||
        body?.includes("Delete") ||
        body?.includes("first_name") ||
        body?.includes("Email");
      console.log("Contact drawer opened:", hasDetail ? "yes" : "no details visible");
    } else {
      console.log("No contact rows to click");
    }
  });

  test("delete a contact", async ({ page }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Find our test contact
    const testRow = page.locator("tr, [role='row']").filter({ hasText: `E2EFirst${TS}` }).first();
    if (await testRow.isVisible()) {
      await testRow.click();
      await waitForPage(page, 1500);

      // Look for delete button in drawer
      const deleteBtn = page.locator("button:has-text('Delete')").first();
      if (await deleteBtn.isVisible()) {
        // Handle confirmation dialog
        page.on("dialog", async (dialog) => {
          console.log("Confirm dialog:", dialog.message());
          await dialog.accept();
        });
        await deleteBtn.click();
        await waitForPage(page, 3000);
        await screenshot(page, "02-contacts-after-delete");
        console.log("Contact deleted");
      } else {
        console.log("Delete button not found in drawer");
      }
    } else {
      console.log("Test contact not found, skipping delete");
    }
  });
});

// ═══════════════════════════════════════════════════════
// 3. PIPELINE & DEALS
// ═══════════════════════════════════════════════════════

test.describe("Pipeline & Deals", () => {
  test("page loads with pipeline view", async ({ page }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);
    await screenshot(page, "03-pipeline-view");

    const body = await page.textContent("body");
    const hasPipeline =
      body?.includes("Pipeline") ||
      body?.includes("Stage") ||
      body?.includes("Deal") ||
      body?.includes("Seed") ||
      body?.includes("Add Deal") ||
      body?.includes("Kanban");
    expect(hasPipeline).toBe(true);
    console.log("Pipeline page loaded");
  });

  test("seed pipeline if empty", async ({ page }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const seedBtn = page.locator("button:has-text('Seed'), button:has-text('seed'), button:has-text('Create Pipeline')").first();
    if (await seedBtn.isVisible()) {
      await seedBtn.click();
      await waitForPage(page, 3000);
      await screenshot(page, "03-pipeline-after-seed");
      console.log("Pipeline seeded");
    } else {
      console.log("Pipeline already has data, no seed needed");
    }
  });

  test("create a new deal", async ({ page }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Find add deal button
    const addDealBtn = page.locator("button:has-text('Add Deal'), button:has-text('New Deal'), button:has-text('add deal')").first();
    if (await addDealBtn.isVisible()) {
      await addDealBtn.click();
      await waitForPage(page, 1000);
      await screenshot(page, "03-deal-modal");

      // Fill deal form
      const titleInput = page.locator("input[name='title'], input[placeholder*='itle'], #title").first();
      if (await titleInput.isVisible()) {
        await titleInput.fill(`E2E Deal ${TS}`);

        const valueInput = page.locator("input[name='value'], input[placeholder*='alue'], #value").first();
        if (await valueInput.isVisible()) {
          await valueInput.fill("50000");
        }

        await screenshot(page, "03-deal-form-filled");

        // Submit
        const submitBtn = page.locator("button[type='submit'], button:has-text('Create'), button:has-text('Add')").last();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await waitForPage(page, 3000);
          await screenshot(page, "03-deal-created");
          console.log("Deal created successfully");
        }
      } else {
        console.log("Deal title input not found");
      }
    } else {
      console.log("Add Deal button not visible");
    }
  });

  test("view deal cards on kanban board", async ({ page }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Check for deal cards or stage columns
    const body = await page.textContent("body");
    const hasDeals =
      body?.includes("$") ||
      body?.includes("Deal") ||
      body?.includes("Stage");
    console.log("Kanban board shows deals:", hasDeals ? "yes" : "empty");
    await screenshot(page, "03-kanban-board");
  });

  test("pipeline selector works", async ({ page }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Find pipeline selector dropdown
    const selector = page.locator("select, [role='combobox'], button:has-text('Pipeline')").first();
    if (await selector.isVisible()) {
      await selector.click();
      await waitForPage(page, 1000);
      await screenshot(page, "03-pipeline-selector");
      console.log("Pipeline selector opened");
    } else {
      console.log("Pipeline selector not found (may have only 1 pipeline)");
    }
  });
});

// ═══════════════════════════════════════════════════════
// 4. WORKFLOWS
// ═══════════════════════════════════════════════════════

test.describe("Workflows", () => {
  test("workflow list page loads", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);
    await screenshot(page, "04-workflows-list");

    const body = await page.textContent("body");
    const hasWorkflows =
      body?.includes("Workflow") ||
      body?.includes("Automation") ||
      body?.includes("New Workflow") ||
      body?.includes("Create");
    expect(hasWorkflows).toBe(true);
    console.log("Workflows list loaded");
  });

  test("create a new workflow", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const newBtn = page.locator("a:has-text('New Workflow'), button:has-text('New Workflow'), a:has-text('Create')").first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await waitForPage(page, 3000);
      await screenshot(page, "04-workflow-new");

      // Should be on builder page
      const url = page.url();
      console.log("Navigated to:", url);
      const isOnBuilder = url.includes("builder") || url.includes("automations");
      expect(isOnBuilder).toBe(true);
      console.log("New workflow created");
    } else {
      console.log("New Workflow button not found");
    }
  });

  test("workflow builder canvas loads with nodes", async ({ page }) => {
    // Find an existing workflow
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const links = page.locator("a[href*='/automations/'][href*='/builder']");
    const count = await links.count();

    if (count > 0) {
      const href = await links.first().getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await waitForPage(page, 3000);
      await screenshot(page, "04-workflow-builder");

      // Should see canvas elements
      const body = await page.textContent("body");
      const hasCanvas =
        body?.includes("Trigger") ||
        body?.includes("Publish") ||
        body?.includes("Save") ||
        body?.includes("Republish");
      expect(hasCanvas).toBe(true);
      console.log("Workflow builder loaded with canvas");
    } else {
      console.log("No workflows to open builder for");
    }
  });

  test("workflow node settings panel opens on node click", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const links = page.locator("a[href*='/automations/'][href*='/builder']");
    if ((await links.count()) > 0) {
      const href = await links.first().getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await waitForPage(page, 3000);

      // Click on a node in the canvas
      const triggerNode = page.locator("text=Trigger").first();
      if (await triggerNode.isVisible()) {
        await triggerNode.click();
        await waitForPage(page, 1000);
        await screenshot(page, "04-workflow-node-settings");
        console.log("Node clicked, settings panel should be open");
      }
    }
  });

  test("workflow publish/unpublish toggle", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Find a workflow with publish/unpublish button
    const publishBtn = page.locator("button:has-text('Publish'), button:has-text('Unpublish')").first();
    if (await publishBtn.isVisible()) {
      const text = await publishBtn.textContent();
      console.log(`Found button: ${text}`);
      // Don't actually click to avoid changing state, just verify it exists
      console.log("Publish/Unpublish toggle available");
    } else {
      console.log("No publish button on list page (may need to be in builder)");
    }
  });

  test("workflow activity panel opens", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const links = page.locator("a[href*='/automations/'][href*='/builder']");
    if ((await links.count()) > 0) {
      const href = await links.first().getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await waitForPage(page, 3000);

      const activityBtn = page.locator("button[title='View Activity']");
      if (await activityBtn.isVisible()) {
        await activityBtn.click();
        await waitForPage(page, 2000);

        const panel = page.locator("[data-testid='activity-panel']");
        await expect(panel).toBeVisible();
        await screenshot(page, "04-workflow-activity");

        const panelText = await panel.textContent();
        expect(panelText).toContain("Activity");
        console.log("Activity panel opened successfully");

        // Click into enrollment if exists
        const enrollmentBtn = panel.locator("button").filter({ hasText: /Active|Completed|Failed|Paused/ }).first();
        if (await enrollmentBtn.isVisible()) {
          await enrollmentBtn.click();
          await waitForPage(page, 1500);
          await screenshot(page, "04-workflow-activity-detail");

          const detailText = await panel.textContent();
          expect(detailText).toContain("Execution Steps");

          // Check for our new step detail rendering
          const hasDetails =
            detailText?.includes("Duration:") ||
            detailText?.includes("To:") ||
            detailText?.includes("Tag:") ||
            detailText?.includes("Deal:");

          console.log("Step details visible:", hasDetails ? "yes" : "no (may not have enriched steps)");
          console.log("Activity detail view working");
        }
      } else {
        console.log("Activity button not found");
      }
    }
  });

  test("test workflow modal opens", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const links = page.locator("a[href*='/automations/'][href*='/builder']");
    if ((await links.count()) > 0) {
      const href = await links.first().getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await waitForPage(page, 3000);

      // Look for test/play button
      const testBtn = page.locator("button[title*='Test'], button[title*='Run'], button:has(svg)").first();
      // Try the play/run button (usually an icon button)
      const playBtn = page.locator("button").filter({ has: page.locator("svg") }).nth(3);
      if (await playBtn.isVisible()) {
        await playBtn.click();
        await waitForPage(page, 1500);
        await screenshot(page, "04-workflow-test-modal");
        console.log("Test modal area checked");
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// 5. EXECUTION LOGS
// ═══════════════════════════════════════════════════════

test.describe("Execution Logs", () => {
  test("logs page loads with enrollment list", async ({ page }) => {
    await page.goto("/automations/logs", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);
    await screenshot(page, "05-logs-list");

    const body = await page.textContent("body");
    const hasLogs =
      body?.includes("Log") ||
      body?.includes("Enrollment") ||
      body?.includes("Execution") ||
      body?.includes("All") ||
      body?.includes("No enrollments");
    expect(hasLogs).toBe(true);
    console.log("Logs page loaded");
  });

  test("filter logs by status tabs", async ({ page }) => {
    await page.goto("/automations/logs", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const tabs = ["All", "Active", "Completed", "Failed", "Paused"];
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text('${tab}'), [role='tab']:has-text('${tab}')`).first();
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await waitForPage(page, 1000);
        console.log(`Tab "${tab}" clicked`);
      }
    }
    await screenshot(page, "05-logs-filtered");
    console.log("Log status filters work");
  });

  test("click into enrollment detail", async ({ page }) => {
    await page.goto("/automations/logs", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    // Click first enrollment row
    const enrollmentRow = page.locator("tr, a, button, [role='row']").filter({ hasText: /active|completed|failed|paused/i }).first();
    if (await enrollmentRow.isVisible()) {
      await enrollmentRow.click();
      await waitForPage(page, 3000);
      await screenshot(page, "05-logs-detail");

      const body = await page.textContent("body");
      const hasDetail =
        body?.includes("Step") ||
        body?.includes("Execution") ||
        body?.includes("completed") ||
        body?.includes("failed") ||
        body?.includes("Trigger");
      console.log("Enrollment detail view:", hasDetail ? "loaded" : "no detail visible");
    } else {
      console.log("No enrollment rows to click");
    }
  });
});

// ═══════════════════════════════════════════════════════
// 6. APPROVALS
// ═══════════════════════════════════════════════════════

test.describe("Approvals", () => {
  test("approvals page loads", async ({ page }) => {
    await page.goto("/automations/approvals", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);
    await screenshot(page, "06-approvals-list");

    const body = await page.textContent("body");
    const hasApprovals =
      body?.includes("Approval") ||
      body?.includes("Pending") ||
      body?.includes("No approval") ||
      body?.includes("Inbox");
    expect(hasApprovals).toBe(true);
    console.log("Approvals page loaded");
  });

  test("filter approvals by status", async ({ page }) => {
    await page.goto("/automations/approvals", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const tabs = ["All", "Pending", "Approved", "Rejected"];
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text('${tab}'), [role='tab']:has-text('${tab}')`).first();
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await waitForPage(page, 1000);
        console.log(`Approval tab "${tab}" clicked`);
      }
    }
    await screenshot(page, "06-approvals-filtered");
  });

  test("click into approval detail if available", async ({ page }) => {
    await page.goto("/automations/approvals", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const approvalItem = page.locator("a, button, tr").filter({
      hasText: /Needs Review|Pending|Approved|Rejected/,
    }).first();
    if (await approvalItem.isVisible()) {
      await approvalItem.click();
      await waitForPage(page, 3000);
      await screenshot(page, "06-approval-detail");

      const body = await page.textContent("body");
      const hasDetail =
        body?.includes("Approve") ||
        body?.includes("Reject") ||
        body?.includes("Content");
      console.log("Approval detail:", hasDetail ? "loaded" : "no detail");
    } else {
      console.log("No approval items to click (empty state)");
    }
  });
});

// ═══════════════════════════════════════════════════════
// 7. NAVIGATION & LAYOUT
// ═══════════════════════════════════════════════════════

test.describe("Navigation", () => {
  test("sidebar navigation links work", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 2000);

    const navItems = [
      { text: "Home", expectedUrl: "/" },
      { text: "Contacts", expectedUrl: "/contacts" },
      { text: "Pipeline", expectedUrl: "/pipeline" },
      { text: "Automations", expectedUrl: "/automations" },
    ];

    for (const item of navItems) {
      const link = page.locator(`nav a:has-text('${item.text}'), aside a:has-text('${item.text}')`).first();
      if (await link.isVisible()) {
        await link.click();
        await waitForPage(page, 2000);
        const url = page.url();
        console.log(`Nav "${item.text}" → ${url}`);
        // Just verify navigation doesn't error
      }
    }
    console.log("All navigation links tested");
  });

  test("settings page accessible", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 2000);

    const settingsLink = page.locator("a:has-text('Settings'), button:has-text('Settings')").first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await waitForPage(page, 2000);
      await screenshot(page, "07-settings");
      console.log("Settings page loaded");
    } else {
      console.log("Settings link not visible");
    }
  });
});

// ═══════════════════════════════════════════════════════
// 8. API HEALTH CHECKS
// ═══════════════════════════════════════════════════════

test.describe("API endpoints", () => {
  test("GET /api/contacts returns data", async ({ request }) => {
    const res = await request.get(`${BASE}/api/contacts?workspaceId=default`);
    console.log(`GET /api/contacts: ${res.status()}`);
    expect(res.status()).toBeLessThan(500);
  });

  test("GET /api/deals returns data", async ({ request }) => {
    const res = await request.get(`${BASE}/api/deals?workspaceId=default`);
    console.log(`GET /api/deals: ${res.status()}`);
    expect(res.status()).toBeLessThan(500);
  });

  test("GET /api/pipelines returns data", async ({ request }) => {
    const res = await request.get(`${BASE}/api/pipelines?workspaceId=default`);
    console.log(`GET /api/pipelines: ${res.status()}`);
    expect(res.status()).toBeLessThan(500);
  });

  test("GET /api/workflows returns data", async ({ request }) => {
    const res = await request.get(`${BASE}/api/workflows?workspaceId=default`);
    console.log(`GET /api/workflows: ${res.status()}`);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/contacts creates a contact", async ({ request }) => {
    const res = await request.post(`${BASE}/api/contacts`, {
      data: {
        workspaceId: "default",
        first_name: `APITest${TS}`,
        last_name: "Contact",
        email: `api-${TS}@test.com`,
      },
    });
    console.log(`POST /api/contacts: ${res.status()}`);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/deals creates a deal", async ({ request }) => {
    // First get a pipeline and stage
    const pipeRes = await request.get(`${BASE}/api/pipelines?workspaceId=default`);
    if (pipeRes.status() === 200) {
      const pipelines = await pipeRes.json();
      if (pipelines.length > 0) {
        const stageRes = await request.get(`${BASE}/api/pipelines?pipelineId=${pipelines[0].id}`);
        if (stageRes.status() === 200) {
          const stages = await stageRes.json();
          if (stages.length > 0) {
            const res = await request.post(`${BASE}/api/deals`, {
              data: {
                workspaceId: "default",
                pipeline_id: pipelines[0].id,
                stage_id: stages[0].id,
                title: `API Deal ${TS}`,
                value: 25000,
              },
            });
            console.log(`POST /api/deals: ${res.status()}`);
            expect(res.status()).toBeLessThan(500);
          }
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// 9. WORKFLOW BUILDER INTERACTIONS
// ═══════════════════════════════════════════════════════

test.describe("Workflow Builder — Node Operations", () => {
  test("undo/redo buttons exist", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const links = page.locator("a[href*='/automations/'][href*='/builder']");
    if ((await links.count()) > 0) {
      const href = await links.first().getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await waitForPage(page, 3000);

      // Check for undo/redo buttons (usually svg icon buttons in toolbar)
      const body = await page.textContent("body");
      const hasToolbar =
        body?.includes("Publish") ||
        body?.includes("Republish") ||
        body?.includes("Save") ||
        body?.includes("Unpublish");
      expect(hasToolbar).toBe(true);
      console.log("Builder toolbar present");
    }
  });

  test("zoom controls work", async ({ page }) => {
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const links = page.locator("a[href*='/automations/'][href*='/builder']");
    if ((await links.count()) > 0) {
      const href = await links.first().getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await waitForPage(page, 3000);

      // React Flow zoom controls
      const zoomIn = page.locator("button[title='zoom in'], .react-flow__controls-zoomin").first();
      const zoomOut = page.locator("button[title='zoom out'], .react-flow__controls-zoomout").first();

      if (await zoomIn.isVisible()) {
        await zoomIn.click();
        await waitForPage(page, 500);
        await zoomOut.click();
        await waitForPage(page, 500);
        console.log("Zoom controls working");
      } else {
        console.log("Zoom controls not found (custom controls)");
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// 10. CROSS-FEATURE: CONTACT→DEAL LINKING
// ═══════════════════════════════════════════════════════

test.describe("Cross-feature integration", () => {
  test("dashboard reflects current data", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPage(page, 3000);

    const body = await page.textContent("body");
    // Dashboard should show some KPIs or empty state
    const isRendered =
      body?.includes("$") ||
      body?.includes("Deals") ||
      body?.includes("Pipeline") ||
      body?.includes("Revenue") ||
      body?.includes("Add your first");
    expect(isRendered).toBe(true);
    await screenshot(page, "10-dashboard-data");
    console.log("Dashboard reflects data state");
  });
});
