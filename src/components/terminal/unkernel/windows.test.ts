import { describe, expect, it } from "vitest";
import { TERM_OPTIONS, normalizeInput, pasteText, setTermFont, termText } from "./windows.ts";

type Bridge = NonNullable<Parameters<typeof termText>[0]["bridge"]>;
const termWith = (bridge: Partial<Bridge> | null) => ({ bridge }) as unknown as Parameters<typeof termText>[0];

describe("normalizeInput", () => {
	it("turns the line breaks of a paste into CR", () => {
		expect(normalizeInput("a\r\nb\nc")).toBe("a\rb\rc");
	});

	it("leaves a single key alone (Enter is CR, Ctrl+J is LF)", () => {
		expect(normalizeInput("\r")).toBe("\r");
		expect(normalizeInput("\n")).toBe("\n");
	});
});

describe("pasteText", () => {
	it("converts newlines to CR without brackets by default", () => {
		const term = termWith({ bracketedPaste: () => false });
		expect(pasteText(term, "a\nb")).toBe("a\rb");
	});

	it("brackets the paste and strips ESC when the application asked for it", () => {
		const term = termWith({ bracketedPaste: () => true });
		expect(pasteText(term, "a\x1b[201~b")).toBe("\x1b[200~a[201~b\x1b[201~");
	});

	it("does not bracket when there is no bridge yet", () => {
		expect(pasteText(termWith(null), "x")).toBe("x");
	});
});

describe("termText", () => {
	it("is empty before the terminal has a bridge", () => {
		expect(termText(termWith(null))).toBe("");
	});

	it("reads scrollback (oldest first) and the screen, a line per row, trimmed", () => {
		const line = (s: string) => [...s].map((ch) => ({ char: ch.codePointAt(0)!, width: 1 }));
		const history = [line("new  "), line("old  ")]; // scrollback offset 0 is the newest line
		const screen = [line("tty  ")];
		const term = termWith({
			getScrollbackCount: () => history.length,
			getRows: () => screen.length,
			getCols: () => 5,
			getScrollbackLineLen: (off: number) => history[off]!.length,
			getScrollbackCell: (off: number, col: number) => history[off]![col]!,
			getCell: (row: number, col: number) => screen[row]![col]!,
		} as unknown as Partial<Bridge>);
		expect(termText(term)).toBe("old\nnew\ntty");
	});
});

describe("setTermFont", () => {
	it("sets the font size and the row height at wterm's own ratio", () => {
		const el = document.createElement("div");
		setTermFont(el, 10);
		expect(el.style.getPropertyValue("--term-font-size")).toBe("10px");
		expect(el.style.getPropertyValue("--term-row-height")).toBe("12px");
	});
});

describe("TERM_OPTIONS", () => {
	it("keeps the scrollback every terminal on the page shares", () => {
		expect(TERM_OPTIONS.scrollbackLines).toBe(5000);
	});
});
