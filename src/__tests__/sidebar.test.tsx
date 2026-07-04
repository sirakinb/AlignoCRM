import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@/components/layout/sidebar";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/testimonials",
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@insforge/nextjs", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
  useUser: () => ({
    user: { email: "andre@test.com", profile: { name: "Andre Williams" } },
  }),
}));

afterEach(() => {
  cleanup();
});

describe("Sidebar", () => {
  it("renders the AlignoCRM logo", () => {
    render(<Sidebar />);
    expect(screen.getByText("AlignoCRM")).toBeInTheDocument();
    expect(screen.getByAltText("AlignoCRM")).toBeInTheDocument();
  });

  it("renders all navigation items", () => {
    render(<Sidebar />);
    const navLabels = ["Home", "Pipeline", "Contacts", "Testimonials", "Settings"];
    navLabels.forEach((label) => {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    });
  });

  it("highlights the active route", () => {
    render(<Sidebar />);
    const testimonialsLink = screen.getByRole("link", { name: "Testimonials" });
    expect(testimonialsLink.className).toContain("bg-[#efe7fb]");
  });

  it("does not highlight inactive routes", () => {
    render(<Sidebar />);
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink.className).not.toContain("bg-[#efe7fb]");
  });

  it("renders the user section", () => {
    render(<Sidebar />);
    expect(screen.getByText("Andre Williams")).toBeInTheDocument();
  });

  it("renders logout button", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("renders correct navigation links", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/pipeline"
    );
    expect(screen.getByRole("link", { name: "Testimonials" })).toHaveAttribute(
      "href",
      "/testimonials"
    );
  });
});
