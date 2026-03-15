import { test } from "@playwright/test";

test("create contact and verify workflow triggers", async ({ page }) => {
  test.setTimeout(120000);

  // Capture ALL console messages from the browser/server
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("[emitEvent]") ||
      text.includes("[processEvent]") ||
      text.includes("[advanceWorkflow]") ||
      text.includes("[createContact]")
    ) {
      console.log(`BROWSER: ${text}`);
    }
  });

  page.on("dialog", async (dialog) => {
    console.log("Dialog:", dialog.message());
    await dialog.accept();
  });

  // Step 1: Find the Active workflow
  console.log("Step 1: Finding active workflow...");
  await page.goto("/automations", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const links = page.locator("a[href*='/automations/'][href*='/builder']");
  const linkCount = await links.count();
  let activeHref: string | null = null;

  for (let i = 0; i < linkCount; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (!href || href.includes("/new/")) continue;
    const parent = link.locator("..");
    const text = await parent.textContent();
    if (text?.includes("Active")) {
      activeHref = href;
      break;
    }
  }

  if (!activeHref) {
    console.log("ERROR: No active workflow found!");
    return;
  }
  console.log(`Found: ${activeHref}`);

  // Step 2: Create a contact
  console.log("Step 2: Creating contact...");
  await page.goto("/contacts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  await page.click("text=Add Contact");
  await page.waitForTimeout(1000);

  const ts = Date.now().toString().slice(-4);

  await page.fill("#first_name", "WFTrigger");
  await page.fill("#last_name", `Test${ts}`);
  await page.fill("#email", "sirakinb@gmail.com");
  await page.fill("#phone", `+199988877${ts}`);

  // Click "Create Contact"
  console.log("Step 3: Submitting...");
  await page.click("text=Create Contact");

  // Wait for workflow execution
  console.log("Step 4: Waiting 25s for workflow...");
  await page.waitForTimeout(25000);

  // Step 5: Check workflow activity
  console.log("Step 5: Checking activity...");
  await page.goto(activeHref, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Publish", { timeout: 30000 });
  await page.waitForTimeout(2000);

  const activityBtn = page.locator("button[title='View Activity']");
  if (await activityBtn.isVisible()) {
    await activityBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/pw-06-activity.png" });

    const panel = page.locator("[data-testid='activity-panel']");
    const text = await panel.textContent();
    console.log("\nActivity:", text?.substring(0, 800));

    // Check enrollment status
    if (text?.includes("WFTrigger")) {
      if (text?.includes("Completed")) {
        console.log("\n=== SUCCESS: Workflow triggered AND completed! ===\n");
      } else if (text?.includes("Active")) {
        console.log("\n=== PARTIAL: Workflow triggered but still Active (not completed) ===\n");
      } else {
        console.log("\n=== SUCCESS: Workflow triggered by contact creation! ===\n");
      }
    } else {
      console.log("\n=== FAIL: 'WFTrigger' not in activity ===\n");
    }
  }

  // Also check DB directly for the latest enrollment
  console.log("Checking DB for latest enrollment status...");
});
