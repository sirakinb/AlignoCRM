import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PipelinePage from "@/app/pipeline/page";

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
