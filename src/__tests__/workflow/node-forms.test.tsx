import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TriggerForm } from "@/components/workflow/node-forms/trigger-form";
import { ConditionForm } from "@/components/workflow/node-forms/condition-form";
import { AiDraftForm } from "@/components/workflow/node-forms/ai-draft-form";
import { SendEmailForm } from "@/components/workflow/node-forms/send-email-form";
import type {
  TriggerConfig,
  ConditionConfig,
  AiDraftMessageConfig,
  SendEmailConfig,
} from "@/types/workflow";

afterEach(() => cleanup());

describe("TriggerForm", () => {
  it("renders trigger type selector with all options", () => {
    const onChange = vi.fn();
    const config: TriggerConfig = { triggerType: "contact_created" };

    render(<TriggerForm config={config} onChange={onChange} />);

    const select = screen.getByTestId("trigger-type-select");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("contact_created");

    // Check all options are present
    expect(screen.getByText("Contact Created")).toBeInTheDocument();
    expect(screen.getByText("Tag Added")).toBeInTheDocument();
    expect(screen.getByText("Deal Stage Changed")).toBeInTheDocument();
  });

  it("calls onChange when trigger type changes", () => {
    const onChange = vi.fn();
    const config: TriggerConfig = { triggerType: "contact_created" };

    render(<TriggerForm config={config} onChange={onChange} />);

    fireEvent.change(screen.getByTestId("trigger-type-select"), {
      target: { value: "tag_added" },
    });

    expect(onChange).toHaveBeenCalledWith({
      triggerType: "tag_added",
      filters: {},
    });
  });

  it("shows tag name filter when tag_added is selected", () => {
    const onChange = vi.fn();
    const config: TriggerConfig = { triggerType: "tag_added", filters: {} };

    render(<TriggerForm config={config} onChange={onChange} />);

    expect(screen.getByText("Tag Name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. VIP")).toBeInTheDocument();
  });
});

describe("ConditionForm", () => {
  const baseConfig: ConditionConfig = {
    conditionName: "Test",
    logicOperator: "AND",
    rules: [{ field: "contact.email", operator: "equals", value: "" }],
  };

  it("renders condition name and logic operator", () => {
    const onChange = vi.fn();
    render(<ConditionForm config={baseConfig} onChange={onChange} />);

    expect(screen.getByText("Condition Name")).toBeInTheDocument();
    expect(screen.getByText("Logic Operator")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
  });

  it("adds a rule when Add Rule is clicked", () => {
    const onChange = vi.fn();
    render(<ConditionForm config={baseConfig} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ Add Rule"));

    expect(onChange).toHaveBeenCalledWith({
      ...baseConfig,
      rules: [
        ...baseConfig.rules,
        { field: "contact.email", operator: "equals", value: "" },
      ],
    });
  });

  it("removes a rule when Remove is clicked", () => {
    const onChange = vi.fn();
    const configWithTwoRules: ConditionConfig = {
      ...baseConfig,
      rules: [
        { field: "contact.email", operator: "equals", value: "" },
        { field: "deal.value", operator: "greater_than", value: "100" },
      ],
    };

    render(<ConditionForm config={configWithTwoRules} onChange={onChange} />);

    expect(screen.getByTestId("condition-rule-0")).toBeInTheDocument();
    expect(screen.getByTestId("condition-rule-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("remove-rule-0"));

    expect(onChange).toHaveBeenCalledWith({
      ...configWithTwoRules,
      rules: [{ field: "deal.value", operator: "greater_than", value: "100" }],
    });
  });
});

describe("AiDraftForm", () => {
  const baseConfig: AiDraftMessageConfig = {
    promptTemplate: "",
    contextFields: [],
    outputFormat: "email",
    requireApproval: true,
  };

  it("renders prompt template textarea", () => {
    const onChange = vi.fn();
    render(<AiDraftForm config={baseConfig} onChange={onChange} />);

    expect(screen.getByText("Prompt Template")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "Write a brief, warm welcome email to {{contact.first_name}} at {{contact.company}}."
      )
    ).toBeInTheDocument();
  });

  it("renders output format selector", () => {
    const onChange = vi.fn();
    render(<AiDraftForm config={baseConfig} onChange={onChange} />);

    expect(screen.getByText("Output Format")).toBeInTheDocument();
    expect(screen.getByText("Email Draft (HTML)")).toBeInTheDocument();
  });

  it("renders require approval toggle", () => {
    const onChange = vi.fn();
    render(<AiDraftForm config={baseConfig} onChange={onChange} />);

    expect(screen.getByText("Require Human Approval")).toBeInTheDocument();
    const toggle = screen.getByTestId("require-approval-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggles approval when clicked", () => {
    const onChange = vi.fn();
    render(<AiDraftForm config={baseConfig} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("require-approval-toggle"));

    expect(onChange).toHaveBeenCalledWith({
      ...baseConfig,
      requireApproval: false,
    });
  });

  it("renders advanced model settings toggle", () => {
    const onChange = vi.fn();
    render(<AiDraftForm config={baseConfig} onChange={onChange} />);

    expect(screen.getByTestId("advanced-settings-toggle")).toBeInTheDocument();
    expect(screen.getByText(/Advanced Model Settings/)).toBeInTheDocument();
  });
});

describe("SendEmailForm", () => {
  const baseConfig: SendEmailConfig = {
    to: "",
    subject: "",
    body: "",
  };

  it("renders all email fields", () => {
    const onChange = vi.fn();
    render(<SendEmailForm config={baseConfig} onChange={onChange} />);

    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByText("Subject")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("{{contact.email}}")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email subject")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email body content...")).toBeInTheDocument();
  });

  it("calls onChange when to field changes", () => {
    const onChange = vi.fn();
    render(<SendEmailForm config={baseConfig} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("{{contact.email}}"), {
      target: { value: "test@example.com" },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...baseConfig,
      to: "test@example.com",
    });
  });

  it("renders Insert Variable buttons", () => {
    const onChange = vi.fn();
    render(<SendEmailForm config={baseConfig} onChange={onChange} />);

    const insertButtons = screen.getAllByText("Insert Variable");
    expect(insertButtons).toHaveLength(3); // one for To, Subject, Body
  });
});
