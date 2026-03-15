import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DealCard } from "@/components/pipeline/deal-card";
import type { Deal } from "@/types/crm";

// Mock @dnd-kit/sortable
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

afterEach(cleanup);

const mockDeal: Deal = {
  id: "deal-1",
  workspace_id: "ws-1",
  pipeline_id: "pipeline-1",
  stage_id: "stage-1",
  contact_id: "contact-1",
  title: "Acme Corp - CRM Integration",
  value: 25000,
  owner_id: "user-1",
  status: "open",
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-01T10:00:00Z",
};

describe("DealCard", () => {
  it("renders deal title", () => {
    render(
      <DealCard deal={mockDeal} contactName="Sarah Chen" ownerInitials="AF" />
    );
    expect(
      screen.getByText("Acme Corp - CRM Integration")
    ).toBeInTheDocument();
  });

  it("renders formatted deal value", () => {
    render(
      <DealCard deal={mockDeal} contactName="Sarah Chen" ownerInitials="AF" />
    );
    expect(screen.getByText("$25,000")).toBeInTheDocument();
  });

  it("renders contact name", () => {
    render(
      <DealCard deal={mockDeal} contactName="Sarah Chen" ownerInitials="AF" />
    );
    expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
  });

  it("renders owner initials", () => {
    render(
      <DealCard deal={mockDeal} contactName="Sarah Chen" ownerInitials="AF" />
    );
    expect(screen.getByText("AF")).toBeInTheDocument();
  });

  it("does not render contact name when null", () => {
    render(
      <DealCard deal={mockDeal} contactName={null} ownerInitials="AF" />
    );
    expect(screen.queryByText("Sarah Chen")).not.toBeInTheDocument();
  });

  it("does not render owner initials when null", () => {
    render(
      <DealCard deal={mockDeal} contactName="Sarah Chen" ownerInitials={null} />
    );
    expect(screen.getByText("Acme Corp - CRM Integration")).toBeInTheDocument();
    expect(screen.getByText("$25,000")).toBeInTheDocument();
  });
});
