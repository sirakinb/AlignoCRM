import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

describe("Sample test", () => {
  it("renders a greeting", () => {
    render(<Greeting name="Aligno" />);
    expect(screen.getByText("Hello, Aligno!")).toBeInTheDocument();
  });
});
