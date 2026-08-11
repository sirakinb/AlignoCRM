import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PipelinePage from "@/app/(dashboard)/pipeline/page";

// Mock next/navigation (the page uses useRouter for deep-linking)
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock @dnd-kit
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  closestCorners: () => null,
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
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

// ---------------------------------------------------------------------------
// Fetch mock data (the page now loads everything from /api routes)
// ---------------------------------------------------------------------------

const pipelines = [
  { id: "p-1", workspace_id: "ws-1", name: "Sales Pipeline", position: 0 },
  { id: "p-2", workspace_id: "ws-1", name: "Onboarding", position: 1 },
];

const stages = [
  { id: "s-1", pipeline_id: "p-1", name: "Lead", position: 0, color: "#ede9fe" },
  {
    id: "s-2",
    pipeline_id: "p-1",
    name: "Qualified",
    position: 1,
    color: "#ddd6fe",
  },
];

const deals = [
  {
    id: "d-1",
    workspace_id: "ws-1",
    pipeline_id: "p-1",
    stage_id: "s-1",
    contact_id: null,
    title: "Acme Corp - CRM Integration",
    value: 12000,
    owner_id: null,
    status: "open",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const contacts = [
  {
    id: "c-1",
    workspace_id: "ws-1",
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
  },
];

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/pipelines?pipelineId=")) {
        return jsonResponse({ stages });
      }
      if (url.startsWith("/api/pipelines")) {
        return jsonResponse({ pipelines });
      }
      if (url.startsWith("/api/deals")) {
        return jsonResponse({ deals });
      }
      if (url.startsWith("/api/contacts")) {
        return jsonResponse({ contacts });
      }
      return jsonResponse({});
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PipelinePage", () => {
  it("renders page title", async () => {
    render(<PipelinePage />);
    expect(await screen.findByText("Pipeline")).toBeInTheDocument();
  });

  it("renders pipeline selector with options", async () => {
    render(<PipelinePage />);
    const select = await screen.findByRole("combobox");
    const options = within(select).getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]).toHaveTextContent("Sales Pipeline");
  });

  it("renders stage columns for the default pipeline", async () => {
    render(<PipelinePage />);
    expect(await screen.findByText("Lead")).toBeInTheDocument();
    expect(await screen.findByText("Qualified")).toBeInTheDocument();
  });

  it("renders deal cards", async () => {
    render(<PipelinePage />);
    const cards = await screen.findAllByText("Acme Corp - CRM Integration");
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });
});
