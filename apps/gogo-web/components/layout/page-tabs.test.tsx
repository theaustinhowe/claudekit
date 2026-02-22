import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { PageTabs } from "@/components/layout/page-tabs";

const tabs = [
  { id: "all", label: "All Jobs", count: 10 },
  { id: "active", label: "Active", count: 3 },
  { id: "completed", label: "Completed" },
];

describe("PageTabs", () => {
  afterEach(() => cleanup());

  it("renders all tab labels", () => {
    render(<PageTabs tabs={tabs} value="all" onValueChange={vi.fn()} />);
    expect(screen.getByText("All Jobs")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows count badges when provided", () => {
    render(<PageTabs tabs={tabs} value="all" onValueChange={vi.fn()} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onValueChange when tab clicked", () => {
    const onChange = vi.fn();
    render(<PageTabs tabs={tabs} value="all" onValueChange={onChange} />);
    fireEvent.click(screen.getByText("Active"));
    expect(onChange).toHaveBeenCalledWith("active");
  });

  it("renders actions when provided", () => {
    render(
      <PageTabs tabs={tabs} value="all" onValueChange={vi.fn()} actions={<button type="button">Filter</button>} />,
    );
    expect(screen.getByText("Filter")).toBeInTheDocument();
  });
});
