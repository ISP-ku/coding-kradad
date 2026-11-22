import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsultationForm from "./ConsultationForm";

describe("ConsultationForm", () => {
  it("shows a validation error for every empty required field (SRS-14)", () => {
    render(<ConsultationForm preview />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consultation" }));
    expect(screen.getByText("Please pick the date.")).toBeInTheDocument();
    expect(screen.getByText(/whole number of minutes/)).toBeInTheDocument();
    expect(screen.getByText("Please enter the topic.")).toBeInTheDocument();
    expect(screen.getByText("Please enter who took part.")).toBeInTheDocument();
  });

  it("does not save in preview mode", () => {
    render(<ConsultationForm preview />);
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "SQL joins" } });
    fireEvent.change(screen.getByLabelText("Participants"), { target: { value: "Group 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consultation" }));
    expect(screen.getByRole("status")).toHaveTextContent(/not saved/);
  });
  it("starts on today and fills common values with one click", () => {
    render(<ConsultationForm preview />);
    expect(screen.getByLabelText("Date")).toHaveValue(new Date().toLocaleDateString("en-CA"));
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    const y = new Date();
    y.setDate(y.getDate() - 1);
    expect(screen.getByLabelText("Date")).toHaveValue(y.toLocaleDateString("en-CA"));
    fireEvent.click(screen.getByRole("button", { name: "45 min" }));
    expect(screen.getByLabelText("Duration (minutes)")).toHaveValue(45);
  });

});

describe("ConsultationForm saving", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fill = () => {
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-20" } });
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: " SQL joins " } });
    fireEvent.change(screen.getByLabelText("Participants"), { target: { value: "Group 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consultation" }));
  };

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("POSTs the trimmed session and returns to the history", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const fetcher = vi.fn().mockResolvedValue(json({ id: 1 }, 201));
    vi.stubGlobal("fetch", fetcher);
    render(<ConsultationForm preview={false} />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/consultations?saved=1"));
    expect(fetcher).toHaveBeenCalledWith("/api/consultations", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      session_date: "2026-11-20", duration_minutes: 30, topic: "SQL joins", participants: "Group 1",
    });
  });

  it.each([
    [json({}, 401), "Your session has ended. Please sign in again."],
    [new Response("<html>", { status: 500 }), "Could not save right now. Please try again."],
  ])("explains a refused save", async (response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    render(<ConsultationForm preview={false} />);
    fill();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<ConsultationForm preview={false} />);
    fill();
    expect(await screen.findByText("Could not reach the server. Please try again.")).toBeInTheDocument();
  });
});
