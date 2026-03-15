import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import type { Deal, Stage } from "@/types/crm";

// Mock @dnd-kit
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  closestCorners: () => null,
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

const mockStages: Stage[] = [
  {
    id: "stage-1",
    pipeline_id: "pipeline-1",
    name: "Lead",
    position: 0,
    color: "#6B7280",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
  },
  {
    id: "stage-2",
    pipeline_id: "pipeline-1",
    name: "Qualified",
    position: 1,
    color: "#3B82F6",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
  },
  {
    id: "stage-3",
    pipeline_id: "pipeline-1",
    name: "Proposal",
    position: 2,
    color: "#F59E0B",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
  },
];

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
    stage_id: "stage-2",
    contact_id: "contact-2",
    title: "Deal Beta",
    value: 48000,
    owner_id: "user-2",
    status: "open",
    created_at: "2026-02-03T10:00:00Z",
    updated_at: "2026-02-03T10:00:00Z",
  },
];

describe("KanbanBoard", () => {
  const getContactName = () => "Test Contact";
  const getOwnerInitials = () => "TC";

  it("renders all stage columns", () => {
    render(
      <KanbanBoard
        stages={mockStages}
        initialDeals={mockDeals}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("Proposal")).toBeInTheDocument();
  });

  it("renders deals in correct stages", () => {
    render(
      <KanbanBoard
        stages={mockStages}
        initialDeals={mockDeals}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("Deal Alpha")).toBeInTheDocument();
    expect(screen.getByText("Deal Beta")).toBeInTheDocument();
  });

  it("renders empty stage columns", () => {
    render(
      <KanbanBoard
        stages={mockStages}
        initialDeals={[]}
        getContactName={getContactName}
        getOwnerInitials={getOwnerInitials}
      />
    );
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("Proposal")).toBeInTheDocument();
  });
});
