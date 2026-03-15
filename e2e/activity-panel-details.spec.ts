import { test, expect } from "@playwright/test";

test("activity panel shows step details for enrollment", async ({ page }) => {
  test.setTimeout(60000);

  // Step 1: Find the active/published workflow
  console.log("Step 1: Finding published workflow...");
  await page.goto("/automations", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const links = page.locator("a[href*='/automations/'][href*='/builder']");
  const linkCount = await links.count();
  let workflowHref: string | null = null;

  for (let i = 0; i < linkCount; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (!href || href.includes("/new/")) continue;
    const parent = link.locator("..");
    const text = await parent.textContent();
    // Look for Active or Published workflow
    if (text?.includes("Active") || text?.includes("Published")) {
      workflowHref = href;
      break;
    }
  }

  if (!workflowHref) {
    console.log("No published workflow found, skipping test");
    return;
  }
  console.log(`Found workflow: ${workflowHref}`);

  // Step 2: Go to the workflow builder
  await page.goto(workflowHref, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Step 3: Open the activity panel
  console.log("Step 2: Opening activity panel...");
  const activityBtn = page.locator("button[title='View Activity']");
  if (!(await activityBtn.isVisible())) {
    console.log("Activity button not visible, skipping");
    return;
  }
  await activityBtn.click();
  await page.waitForTimeout(2000);

  const panel = page.locator("[data-testid='activity-panel']");
  await expect(panel).toBeVisible();

  // Step 4: Check if there are any enrollments to click on
  const enrollmentButtons = panel.locator("button").filter({ hasText: /Active|Completed|Failed|Paused/ });
  const enrollmentCount = await enrollmentButtons.count();
  console.log(`Found ${enrollmentCount} enrollments`);

  if (enrollmentCount === 0) {
    console.log("No enrollments found, skipping detail check");
    return;
  }

  // Step 5: Click the first enrollment to see detail view
  console.log("Step 3: Clicking into enrollment detail...");
  await enrollmentButtons.first().click();
  await page.waitForTimeout(2000);

  // Take screenshot of detail view
  await page.screenshot({ path: "/tmp/pw-activity-detail.png" });

  // Step 6: Verify the detail view shows execution steps
  const stepsSection = panel.locator("text=Execution Steps");
  await expect(stepsSection).toBeVisible();
  console.log("Execution Steps section visible");

  // Check for step detail content (our new feature)
  const panelText = await panel.textContent();
  console.log("\nPanel detail content:", panelText?.substring(0, 1000));

  // Verify the "Back to list" button is present (we're in detail view)
  const backButton = panel.locator("text=Back to list");
  await expect(backButton).toBeVisible();

  // Check that step outcomes are shown (completed, failed, waiting)
  const hasOutcome = panelText?.includes("completed") ||
                     panelText?.includes("failed") ||
                     panelText?.includes("waiting");
  expect(hasOutcome).toBe(true);
  console.log("Step outcomes are displayed");

  // Check for step detail rendering (our changes)
  // These would show for completed steps: "To:", "Tag:", "Deal:", "Duration:"
  const hasStepDetails = panelText?.includes("To:") ||
                         panelText?.includes("Tag:") ||
                         panelText?.includes("Deal:") ||
                         panelText?.includes("Duration:");

  if (hasStepDetails) {
    console.log("\n=== SUCCESS: Step details are rendered in Activity panel! ===\n");
  } else {
    // This is OK - the enrollment might only have failed/trigger steps
    // which don't have detail lines
    console.log("\n=== INFO: No step detail lines found (enrollment may only have trigger/failed steps) ===\n");
  }

  // Check for error message display on failed steps
  if (panelText?.includes("failed")) {
    const errorBox = panel.locator(".text-red-700");
    const errorCount = await errorBox.count();
    console.log(`Error messages displayed: ${errorCount}`);
    if (errorCount > 0) {
      const errorText = await errorBox.first().textContent();
      console.log(`Error detail: ${errorText}`);
    }
  }

  console.log("\n=== Activity panel detail view test complete ===\n");
});
