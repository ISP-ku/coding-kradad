import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TopicForm from "./TopicForm";

const onSubmitted = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); onSubmitted.mockReset(); });

const fill = (title: string, description: string) => {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: description } });
};

describe("TopicForm", () => {
  it("asks for both a title and a description before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<TopicForm onSubmitted={onSubmitted} />);
    fill("When is the midterm?", "  ");
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill in both the title and the description.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the trimmed topic and reports success", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    render(<TopicForm onSubmitted={onSubmitted} />);
    fill("  When is the midterm?  ", " Is it week 8? ");
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledWith("/api/faq", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ title: "When is the midterm?", description: "Is it week 8?" });
  });

  it("asks a signed-out person to sign in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    render(<TopicForm onSubmitted={onSubmitted} />);
    fill("T", "D");
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please sign in to create a topic.");
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("explains that topics wait for a lecturer", () => {
    render(<TopicForm onSubmitted={onSubmitted} />);
    expect(screen.getByText(/only appear on the board after a lecturer approves them/)).toBeInTheDocument();
  });
});
