import { expect, test, describe, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import Button from "./Button";
import { faCoffee } from "@fortawesome/free-solid-svg-icons";

describe("Button Component", () => {
  test("should render with default props", () => {
    render(<Button />);
    const buttonElement = screen.getByRole("button");
    expect(buttonElement).toHaveTextContent("Submit"); // Default text
    expect(buttonElement).toHaveClass("button button__solid--primary"); // Default class
  });

  test("renders with custom text", () => {
    render(<Button text="Click Me" />);
    expect(screen.getByRole("button")).toHaveTextContent("Click Me");
  });

  test("renders FontAwesome icon on the left", () => {
    render(<Button icon={faCoffee} iconPosition="left" />);
    const buttonElement = screen.getByRole("button");
    const iconElement = buttonElement.querySelector(".button__icon-left svg");
    expect(iconElement).toBeInTheDocument();
  });

  test("handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test("renders with disabled state", () => {
    render(<Button disabled />);
    const buttonElement = screen.getByRole("button");
    expect(buttonElement).toBeDisabled();
  });

  test("renders with different variants and colors", () => {
    render(<Button variant="outlined" color="secondary" />);
    const buttonElement = screen.getByRole("button");
    expect(buttonElement).toHaveClass("button button__outlined--secondary");
  });
});
