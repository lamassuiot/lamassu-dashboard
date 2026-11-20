// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The page: the stage (the terminal, the splash card), the key bar, the
// status line at the bottom, and over them the dialog, the paste dialog and
// the toast. Also the page-wide behaviour: the keyboard shortcuts
// (shortcuts.ts), when the key bar shows, and the pinch that sets the font
// size on phones.
//
// Dashboard port: rendered by mount.tsx into the shell's root element (the
// dock sizes it: `relative h-full` instead of a fixed, full-viewport #app);
// no guest display, preview or launcher; the shortcuts and the pinch act
// only inside `root`, and the visual-viewport sizing of #app is left out
// (the dock owns the size), keeping the terminal at its bottom on resizes.
import { memo, useEffect } from "react";
import { trackBottom } from "../bottom.ts";
import { KW } from "../kw.ts";
import { installShortcuts } from "../shortcuts.ts";
import { ui$, useStore } from "../store.ts";
import { Bar } from "./Bar.tsx";
import { Keys } from "./Keys.tsx";
import { Confirm, PasteDialog, ResumeCard, Splash, Toast } from "./Overlays.tsx";
import { Panel } from "./Panel.tsx";

/**
 * The terminals' hosts. #term is window 0's (boot.ts): wterm renders the
 * rows as DOM text in it, which is also the scroll container, and sets its
 * own class. windows.ts adds the other windows to #terms, each over the
 * same box. React renders these once and never touches them again.
 */
const TermHost = memo(() => <div id="terms" className="relative h-full w-full"><div id="term" /></div>);

export function App({ root }: { root: HTMLElement }) {
	const cfg = KW.config;
	const state = useStore((s) => s.state);

	useBottom(root);
	useKeyBar(cfg.mobile);
	usePinchFont(cfg.mobile, root);
	useEffect(() => installShortcuts(root), [root]);

	return (
		<>
			<div id="app" data-state={state} className={`relative flex h-full flex-col ${cfg.mobile ? "mobile" : ""}`}>
				<main id="stage" className="relative min-h-0 min-w-0 flex-1 pt-[max(8px,var(--st))] pr-[max(12px,var(--sr))] pb-1 pl-[max(12px,var(--sl))]">
					<TermHost />
					<Splash />
					<ResumeCard />
				</main>
				<Keys />
				<Bar />
			</div>
			<Panel />
			<PasteDialog />
			<Confirm />
			<Toast />
		</>
	);
}

/**
 * Keep window 0's terminal at its bottom when it gets shorter (the
 * keyboard, the key bar, the dock resized): bottom.ts, set up here at
 * mount, before boot.ts makes wterm. windows.ts does the same for the
 * other windows.
 */
function useBottom(root: HTMLElement) {
	useEffect(() => {
		const bottom = trackBottom(root.querySelector<HTMLElement>("#term")!), vv = window.visualViewport;
		vv?.addEventListener("resize", bottom.keep);
		addEventListener("resize", bottom.keep);
		return () => {
			bottom.dispose();
			vv?.removeEventListener("resize", bottom.keep);
			removeEventListener("resize", bottom.keep);
		};
	}, [root]);
}

/**
 * The key bar: phones only, and only while the on-screen keyboard is up: the
 * terminal has the focus and the visual viewport is well below the tallest
 * seen at this width (the keyboard takes that space; a hardware keyboard
 * takes none, and then the bar is not needed). A rotation starts the
 * measuring over.
 */
function useKeyBar(mobile: boolean) {
	useEffect(() => {
		if (!mobile) return;
		let tallest = 0, tallestW = 0;
		const update = () => {
			const h = visualViewport?.height ?? innerHeight;
			if (innerWidth !== tallestW) { tallest = 0; tallestW = innerWidth; }
			tallest = Math.max(tallest, h);
			const on = h < tallest - 120 && !!document.activeElement?.closest("#terms");
			if (ui$().get().keysOn !== on) ui$().set({ keysOn: on });
		};
		const later = () => setTimeout(update, 0); // after focus lands elsewhere
		update();
		visualViewport?.addEventListener("resize", update);
		addEventListener("resize", update);
		document.addEventListener("focusin", update);
		document.addEventListener("focusout", later);
		return () => {
			visualViewport?.removeEventListener("resize", update);
			removeEventListener("resize", update);
			document.removeEventListener("focusin", update);
			document.removeEventListener("focusout", later);
		};
	}, [mobile]);
}

/**
 * Phones: a pinch on the terminal sets the font size (whole px, 9 to 24,
 * kept like the Font size option) and never zooms the page. iOS ignores
 * user-scalable=no: cancelling Safari's gesture events and every two-finger
 * touchmove is what stops its zoom. Linear and damped: 1 px of font per
 * PINCH_STEP px the fingers move apart or together (a ratio of finger
 * distances swings straight to the limits). The start is taken when the
 * second finger lands, not at the first move. Dashboard port: listened to
 * on the shell's root, so the rest of the page keeps its own pinch zoom.
 */
function usePinchFont(mobile: boolean, root: HTMLElement) {
	useEffect(() => {
		if (!mobile) return;
		const PINCH_STEP = 30;
		const span = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
		let pinch: { d: number; size: number; on: boolean } | null = null;
		const startPinch = (e: TouchEvent) => {
			pinch = { d: span(e.touches), size: ui$().get().fontSize, on: !!(e.target as Element | null)?.closest?.("#stage") };
		};
		const start = (e: TouchEvent) => { if (e.touches.length === 2) startPinch(e); };
		const move = (e: TouchEvent) => {
			if (e.touches.length < 2) return;
			if (e.cancelable) e.preventDefault(); // no page zoom
			if (!pinch) startPinch(e);
			if (!pinch!.on) return;
			const n = Math.min(24, Math.max(9, Math.round(pinch!.size + (span(e.touches) - pinch!.d) / PINCH_STEP)));
			if (n !== ui$().get().fontSize) KW.ui!.setFont(String(n));
		};
		const end = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
		const gesture = (e: Event) => e.preventDefault();
		root.addEventListener("touchstart", start, { passive: true });
		root.addEventListener("touchmove", move, { passive: false });
		root.addEventListener("touchend", end);
		root.addEventListener("touchcancel", end);
		for (const type of ["gesturestart", "gesturechange", "gestureend"]) root.addEventListener(type, gesture, { passive: false });
		return () => {
			root.removeEventListener("touchstart", start);
			root.removeEventListener("touchmove", move);
			root.removeEventListener("touchend", end);
			root.removeEventListener("touchcancel", end);
			for (const type of ["gesturestart", "gesturechange", "gestureend"]) root.removeEventListener(type, gesture);
		};
	}, [mobile, root]);
}
