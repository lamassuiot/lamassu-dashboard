import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "./config.ts";
import { createKW } from "./kw.ts";
import { installShortcuts } from "./shortcuts.ts";
import { ui$ } from "./store.ts";
import { createUi } from "./ui.ts";

const ctrlA = () =>
  new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, bubbles: true, cancelable: true });

describe("installShortcuts(root)", () => {
  let root: HTMLElement;
  let inside: HTMLElement;
  let field: HTMLTextAreaElement;
  let outside: HTMLInputElement;

  beforeEach(() => {
    vi.stubGlobal("crossOriginIsolated", false);
    const kw = createKW(readConfig("", {}));
    kw.ui = createUi(kw.config);
    root = document.createElement("div");
    inside = document.createElement("div");
    field = document.createElement("textarea");
    root.append(inside, field);
    outside = document.createElement("input");
    document.body.append(root, outside);
  });

  afterEach(() => {
    root.remove();
    outside.remove();
    vi.unstubAllGlobals();
  });

  it("ignores Ctrl-A typed outside the shell root", () => {
    const dispose = installShortcuts(root);
    const e = ctrlA();
    outside.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(ui$().get().prefix).toBe(false);
    dispose();
  });

  it("arms the prefix for Ctrl-A typed inside the shell root", () => {
    const dispose = installShortcuts(root);
    const e = ctrlA();
    inside.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(ui$().get().prefix).toBe(true);
    dispose();
  });

  it("leaves Ctrl-A typed in a field of the shell root to the field (select all)", () => {
    const dispose = installShortcuts(root);
    const e = ctrlA();
    field.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(ui$().get().prefix).toBe(false);
    dispose();
  });

  it("ignores Ctrl-Shift chords typed outside the shell root", () => {
    const dispose = installShortcuts(root);
    const e = new KeyboardEvent("keydown", {
      key: "?", code: "Slash", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
    });
    outside.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(ui$().get().panelOpen).toBe(false);
    dispose();
  });

  it("stops handling keys once disposed", () => {
    const dispose = installShortcuts(root);
    dispose();
    const a = ctrlA();
    inside.dispatchEvent(a);
    const b = ctrlA();
    outside.dispatchEvent(b);
    expect(a.defaultPrevented).toBe(false);
    expect(b.defaultPrevented).toBe(false);
    expect(ui$().get().prefix).toBe(false);
  });
});
