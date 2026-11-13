import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
