import { redirect } from "next/navigation";

// The Automations section is temporarily hidden while the feature matures.
// All /automations/* routes redirect to the dashboard. Delete this layout
// (and restore the sidebar nav item) to bring the section back.
export default function AutomationsLayout() {
  redirect("/dashboard");
}
