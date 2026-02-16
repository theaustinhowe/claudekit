import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@devkit/ui/components/label", () => ({
  // biome-ignore lint/a11y/noLabelWithoutControl: test mock
  Label: ({ children, ...props }: { children: ReactNode }) => <label {...props}>{children}</label>,
}));

vi.mock("@devkit/ui/components/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

import { CreateIssueDialog } from "@/components/issues/create-issue-dialog";

describe("CreateIssueDialog", () => {
  afterEach(() => cleanup());

  it("renders trigger button", () => {
    render(<CreateIssueDialog onSubmit={vi.fn()} />);
    expect(screen.getAllByText("Create Issue").length).toBeGreaterThanOrEqual(1);
  });

  it("shows dialog title", () => {
    render(<CreateIssueDialog onSubmit={vi.fn()} />);
    expect(screen.getByText("Create New Issue")).toBeInTheDocument();
  });

  it("shows form fields", () => {
    render(<CreateIssueDialog onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText(/issue title/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe the issue/i)).toBeInTheDocument();
  });

  it("shows labels field", () => {
    render(<CreateIssueDialog onSubmit={vi.fn()} />);
    expect(screen.getByText("Labels")).toBeInTheDocument();
  });

  it("has submit button", () => {
    render(<CreateIssueDialog onSubmit={vi.fn()} />);
    expect(screen.getAllByText("Create Issue").length).toBeGreaterThanOrEqual(2);
  });
});
