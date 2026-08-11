import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentResultPanel } from "@/components/agent/result-panel";
import type { AgentResult } from "@/lib/agent/agui-client";

afterEach(cleanup);

const fullResult: AgentResult = {
  summary: "Acme is a mid-size dev-tools company; Jordan is a warm lead.",
  facts: ["Raised a $30M Series B in 2026", "~200 employees"],
  suggested_actions: ["Send the follow-up email", "Book a demo call"],
  draft_message: {
    subject: "Great meeting you at SaaStr",
    body: "Hi Jordan,\n\nThanks for the chat about onboarding automation.",
  },
};

describe("AgentResultPanel", () => {
  it("renders summary, facts, and suggested actions", () => {
    render(<AgentResultPanel result={fullResult} />);

    expect(
      screen.getByText(/Acme is a mid-size dev-tools company/)
    ).toBeInTheDocument();
    expect(screen.getByText("Key facts")).toBeInTheDocument();
    expect(screen.getByText("Raised a $30M Series B in 2026")).toBeInTheDocument();
    expect(screen.getByText("~200 employees")).toBeInTheDocument();
    expect(screen.getByText("Suggested next actions")).toBeInTheDocument();
    expect(screen.getByText("Send the follow-up email")).toBeInTheDocument();
    expect(screen.getByText("Book a demo call")).toBeInTheDocument();
  });

  it("renders the drafted message with subject, body, and copy button", () => {
    render(<AgentResultPanel result={fullResult} />);

    expect(screen.getByText("Drafted message")).toBeInTheDocument();
    expect(screen.getByText("Great meeting you at SaaStr")).toBeInTheDocument();
    expect(screen.getByText(/Thanks for the chat about onboarding/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("omits optional sections when absent", () => {
    render(
      <AgentResultPanel
        result={{ summary: "Just a summary.", facts: [], suggested_actions: [] }}
      />
    );

    expect(screen.getByText("Just a summary.")).toBeInTheDocument();
    expect(screen.queryByText("Key facts")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggested next actions")).not.toBeInTheDocument();
    expect(screen.queryByText("Drafted message")).not.toBeInTheDocument();
  });
});
