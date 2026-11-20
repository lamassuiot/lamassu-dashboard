// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The extra-keys bar: phones only, and only while the on-screen keyboard is
// up (App.tsx decides). Esc, Tab, a latching Ctrl, ^C, arrows, a few symbols
// and Paste.
import { useRef, type MouseEvent, type TouchEvent } from "react";
import { KW } from "../kw.ts";
import { useStore } from "../store.ts";

type K = { key: string; label: string; word?: boolean; aria?: string; title?: string } | "gap";
const KEYS: K[] = [
	{ key: "esc", label: "Esc", word: true }, { key: "tab", label: "Tab", word: true },
	{ key: "ctrl", label: "Ctrl", word: true }, { key: "^c", label: "^C", word: true, title: "Ctrl-C" },
	"gap",
	{ key: "left", label: "←", aria: "Left" }, { key: "up", label: "↑", aria: "Up" },
	{ key: "down", label: "↓", aria: "Down" }, { key: "right", label: "→", aria: "Right" },
	"gap",
	{ key: "|", label: "|" }, { key: "/", label: "/" }, { key: "-", label: "-" }, { key: "~", label: "~" },
	{ key: "paste", label: "Paste", word: true },
];

const keyOf = (e: { target: EventTarget }) => (e.target as Element | null)?.closest?.("button")?.getAttribute("data-key") ?? null;

export function Keys({ show, onPress, omit, className = "" }: {
	/** Shown (default: the terminal's bar, while its keyboard is up). */
	show?: boolean;
	/** Where presses go (default: the terminal). */
	onPress?: (k: string) => void;
	omit?: readonly string[];
	className?: string;
} = {}) {
	const ctrl = useStore((s) => s.ctrl);
	const keysOn = useStore((s) => s.keysOn);
	const on = show ?? keysOn;
	// Keep focus (and so the on-screen keyboard) on the terminal: a mouse
	// press is cancelled at mousedown; a tap is handled at touchend, whose
	// cancellation suppresses the tap's focus change and click. A touch that
	// moved is a horizontal scroll of the bar, not a key press.
	const touch0 = useRef<{ x: number; y: number } | null>(null);
	const press = (k: string | null) => { if (k) (onPress ?? KW.ui!.pressKey)(k); };
	return (
		<nav
			id={onPress ? undefined : "keys"} aria-label="Extra keys"
			className={`${on ? "flex" : "hidden"} ${className} flex-none gap-1 overflow-x-auto border-t border-line bg-bg pt-1.5 pr-[max(8px,var(--sr))] pb-1.5 pl-[max(8px,var(--sl))] select-none [scrollbar-width:none] max-[700px]:[mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)] [&::-webkit-scrollbar]:hidden`}
			style={{ touchAction: "pan-x" }}
			onMouseDown={(e: MouseEvent) => { if (keyOf(e)) e.preventDefault(); }}
			onTouchStart={(e: TouchEvent) => { touch0.current = e.touches.length === 1 ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } : null; }}
			onTouchEnd={(e: TouchEvent) => {
				const k = keyOf(e), t = e.changedTouches[0], t0 = touch0.current;
				if (!k || !t0 || !t || Math.abs(t.clientX - t0.x) > 10 || Math.abs(t.clientY - t0.y) > 10) return;
				touch0.current = null;
				if (e.cancelable) e.preventDefault();
				press(k);
			}}
			onClick={(e) => press(keyOf(e))}
		>
			{KEYS.filter((k) => k === "gap" || !omit?.includes(k.key)).map((k, i) => k === "gap"
				? <span key={i} className="mx-px my-2 w-px flex-none bg-line" />
				: (
					<button
						key={k.key} type="button" data-key={k.key} aria-label={k.aria} title={k.title}
						aria-pressed={k.key === "ctrl" ? ctrl : undefined}
						className={`h-9.5 min-w-9 flex-[1_0_auto] touch-manipulation border border-line bg-surface px-2 text-fg active:bg-hover aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-black ${k.word ? "text-[12.5px] font-medium" : "font-mono text-[16px]"}`}
					>{k.label}</button>
				))}
		</nav>
	);
}
