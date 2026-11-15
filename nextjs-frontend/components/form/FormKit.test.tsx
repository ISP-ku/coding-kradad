import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceGroup, Field, FormActions, QuickPicks, fieldAria } from "./FormKit";

describe("Field", () => {
  it("links the label, hint and error to the input", () => {
    render(
      <Field id="title" label="Title" hint="Shown to students" error="Please enter a title.">
        <input id="title" {...fieldAria("title", "Please enter a title.", true)} />
      </Field>,
    );
    const input = screen.getByLabelText("Title");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Shown to students Please enter a title.");
  });

  it("marks optional fields and counts characters", () => {
    render(<Field id="d" label="Notes" optional count={{ value: "hello", max: 200 }}><input id="d" /></Field>);
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("5 / 200")).toBeInTheDocument();
  });
});

describe("ChoiceGroup", () => {
  it("is a labelled set of radio buttons", () => {
    const onChange = vi.fn();
    render(
      <ChoiceGroup legend="Type" name="type" value="lab" onChange={onChange}
        options={[{ value: "lab", label: "Lab session" }, { value: "deadline", label: "Deadline", hint: "Something due" }]} />,
    );
    expect(screen.getByRole("group", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Lab session" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Deadline/ }));
    expect(onChange).toHaveBeenCalledWith("deadline");
  });
});

describe("QuickPicks", () => {
  it("fills a value with one click", () => {
    const pick = vi.fn();
    render(<QuickPicks label="Quick dates" picks={[{ label: "Tomorrow", onPick: pick }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(pick).toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Quick dates" })).toBeInTheDocument();
  });
});

describe("FormActions", () => {
  it("shows the action, the busy label and a way out", () => {
    const { rerender } = render(<FormActions submitLabel="Save" busyLabel="Saving..." busy={false} cancelHref="/back" />);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/back");
    rerender(<FormActions submitLabel="Save" busyLabel="Saving..." busy cancelHref="/back" />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});
