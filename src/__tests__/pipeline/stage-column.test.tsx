import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageColumn } from "@/components/pipeline/stage-column";
import type { Deal, Stage } from "@/types/crm";

// Mock @dnd-kit
vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: vi.fn() }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  verticalListSortingStrategy: {},
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

const mockStage: Stage = {
  id: "stage-1",
  pipeline_id: "pipeline-1",
  name: "Qualified",
  position: 1,
  color: "#3B82F6",
  created_at: "2026-01-10T10:00:00Z",
  updated_at: "2026-01-10T10:00:00Z",
};

const mockDeals: Deal[] = [
  {
    id: "deal-1",
    workspace_id: "ws-1",
    pipeline_id: "pipeline-1",
    stage_id: "stage-1",
    contact_id: "contact-1",
    title: "Deal Alpha",
    value: 25000,
    owner_id: "user-1",
    status: "open",
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
  },
  {
    id: "deal-2",
    workspace_id: "ws-1",
    pipeline_id: "pipeline-1",
    stage_id: "stage-1",
    contact_id: "contact-2",
    title: "Deal Beta",
    value: 35000,
    owner_id: "user-2",
    status: "open",
    created_at: "2026-02-03T10:00:00Z",
    updated_at: "2026-02-03T10:00:00Z",
  },
];

describe("StageColumn", () => {
  const getContactName = (id: string | null) =>
    id === "contact-1" ? "Sarah Chen" : id === "contact-2" ? "James Wilson" : null;
  const getOwnerInitials = (id: string | null) =>
    id === "user-1" ? "AF" : id === "user-2" ? "JS" : null;

  it("renders stage name", () => {
    render(
      <StageColumn
        stage={mockStage}
        deals={mockDeals}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("Qualified")).toBeInTheDocument();
  });

  it("renders correct deal count", () => {
    render(
      <StageColumn
        stage={mockStage}
        deals={mockDeals}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders correct total value", () => {
    render(
      <StageColumn
        stage={mockStage}
        deals={mockDeals}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("$60,000")).toBeInTheDocument();
  });

  it("renders all deal cards", () => {
    render(
      <StageColumn
        stage={mockStage}
        deals={mockDeals}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("Deal Alpha")).toBeInTheDocument();
    expect(screen.getByText("Deal Beta")).toBeInTheDocument();
  });

  it("renders zero total for empty stage", () => {
    render(
      <StageColumn
        stage={mockStage}
        deals={[]}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
