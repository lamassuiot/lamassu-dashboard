// @vitest-environment happy-dom
import * as React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

test("a profile menu opens from its Button trigger", () => {
  const triggerRef = React.createRef<HTMLButtonElement>();

  render(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef}>Profile</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );

  expect(triggerRef.current).toBeInstanceOf(HTMLButtonElement);
  fireEvent.pointerDown(triggerRef.current!, { button: 0, ctrlKey: false });
  expect(triggerRef.current?.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("menuitem", { name: "Logout" })).toBeTruthy();
});
