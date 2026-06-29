import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PipelinePage from "@/app/(dashboard)/pipeline/page";

const mockPipelines = [
  { id: "p1", name: "Sales Pipeline", workspace_id: "ws1", position: 0, created_at: "", updated_at: "" },
  { id: "p2", name: "Partnerships", workspace_id: "ws1", position: 1, created_at: "", updated_at: "" },
];

const mockStages = [
  { id: "s1", pipeline_id: "p1", name: "Lead", position: 0, color: "#6C2BD9", created_at: "", updated_at: "" },
  { id: "s2", pipeline_id: "p1", name: "Qualified", position: 1, color: "#8A5DDE", created_at: "", updated_at: "" },
];

const mockDeals = [
  {
    id: "d1",
    workspace_id: "ws1",
    pipeline_id: "p1",
    stage_id: "s1",
    contact_id: null,
    title: "Acme Corp - CRM Integration",
    value: 12000,
    owner_id: null,
    status: "open" as const,
    created_at: "",
    updated_at: "",
  },
];

vi.mock("@/hooks/use-crm-data", () => ({
  usePipelines: () => ({
    data: mockPipelines,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
  useDeals: () => ({
    data: mockDeals,
    mutate: vi.fn(),
  }),
  useContacts: () => ({
    data: [],
  }),
  useStages: () => ({
    data: mockStages,
    mutate: vi.fn(),
  }),
}));

vi.mock("@/lib/api/crm", () => ({
  seedDefaultPipeline: vi.fn(),
  fetchStages: vi.fn(),
  moveDeal: vi.fn(),
  deleteDeal: vi.fn(),
}));

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

describe("PipelinePage", () => {
  it("renders page title", () => {
    render(<PipelinePage />);
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });

  it("renders pipeline selector with options", () => {
    render(<PipelinePage />);
    const select = screen.getByRole("combobox");
    const options = within(select).getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]).toHaveTextContent("Sales Pipeline");
  });

  it("renders stage columns for the default pipeline", () => {
    render(<PipelinePage />);
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Qualified")).toBeInTheDocument();
  });

  it("renders deal cards", () => {
    render(<PipelinePage />);
    expect(
      screen.getAllByText("Acme Corp - CRM Integration").length
    ).toBeGreaterThanOrEqual(1);
  });
});
