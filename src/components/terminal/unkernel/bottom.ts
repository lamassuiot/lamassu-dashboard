// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// Keep a terminal's view at its bottom when it gets shorter (the on-screen
// keyboard, the key bar). On a resize wterm decides whether to follow the
// bottom from the element's geometry at that moment, which is already the
// shorter one, so it would keep scrollTop and show the top of the screen
// with the prompt behind the keyboard. So whether the view is at the bottom
// is tracked from scroll events (a shrink fires none), and after a shrink
// the view is put back at the bottom before wterm refits: from a
// ResizeObserver made before wterm's (so its callback runs first), and
// from keep(), which the caller runs synchronously in the viewport events
// (before wterm's refit in the next animation frame).

export interface Bottom {
	/** Put the view back at the bottom if it was there and the element got shorter. */
	keep(): void;
	dispose(): void;
}

/** Call before wterm is created on `term`. */
export function trackBottom(term: HTMLElement): Bottom {
	let atBottom = true, termH = term.clientHeight;
	const onScroll = () => { atBottom = term.scrollHeight - term.scrollTop - term.clientHeight < 5; };
	const keep = () => {
		const h = term.clientHeight;
		if (h < termH && atBottom) term.scrollTop = term.scrollHeight;
		termH = h;
	};
	const ro = new ResizeObserver(keep);
	ro.observe(term);
	term.addEventListener("scroll", onScroll, { passive: true });
	return {
		keep,
		dispose() {
			ro.disconnect();
			term.removeEventListener("scroll", onScroll);
		},
	};
}
