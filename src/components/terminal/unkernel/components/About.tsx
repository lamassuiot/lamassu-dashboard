// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The About dialog: credits and the build (build.ts's KW_BUILD:
// the base bundle's Linux release and where it came from; the distro image,
// the store's distro),
// opened by the triangle in the status line (the ⋯ menu's About on narrow
// screens) or the prefix, a (shortcuts.ts). A native
// modal <dialog> like Confirm (Overlays.tsx): Esc closes it, the page under
// it is inert.
import { useRef, type ReactNode } from "react";
import { KW_BUILD } from "../build.ts";
import { REPO } from "../config.ts";
import { KW } from "../kw.ts";
import { useStore } from "../store.ts";
import { PREFIX } from "../shortcuts.ts";

const B = KW_BUILD;

const Triangle = ({ size = 11 }: { size?: number }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1Z" fill="currentColor" /></svg>
);

const day = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

const A = ({ href, children }: { href: string; children: ReactNode }) => (
	<a href={href} target="_blank" rel="noopener" className="text-fg underline decoration-line-strong underline-offset-3 hover:decoration-fg">{children}</a>
);

function Row({ k, children }: { k: string; children: ReactNode }) {
	return (
		<>
			<dt className="text-faint">{k}</dt>
			<dd className="min-w-0 text-muted">{children}</dd>
		</>
	);
}

/** Dashboard port: where the focus was when About opened (showModal() restored it on close; show() does not). */
let returnTo: HTMLElement | null = null;

/** Open the About dialog (the status line's triangle, and the prefix, a). */
export function openAbout(): void {
	KW.ui?.closePanel();
	const d = document.getElementById("about") as HTMLDialogElement | null;
	if (!d || d.open) return;
	returnTo = document.activeElement as HTMLElement | null;
	d.show(); // not showModal(): a modal <dialog> covers the whole dashboard (unkernel.css)
	d.querySelector<HTMLButtonElement>("#about-close")?.focus();
}

/** hint: the which-key label the status line shows on the triangle while the prefix is armed; className: on the triangle (the status line hides it on narrow screens). */
export function About({ hint, className = "" }: { hint?: ReactNode; className?: string }) {
	const ref = useRef<HTMLDialogElement>(null);
	const close = () => ref.current?.close();
	const commit = B.commit.slice(0, 7);
	const distro = useStore((s) => s.distro);
	return (
		<>
			<button id="bar-about" type="button" title={`About unkernel (${PREFIX} a)`} aria-label="About unkernel" aria-haspopup="dialog"
				className={`inline-flex h-full flex-none items-center px-1.5 text-muted transition-colors hover:bg-hover hover:text-fg ${className}`}
				onClick={(e) => { if (e.detail) e.currentTarget.blur(); openAbout(); }}
			>{hint}<Triangle /></button>
			<dialog id="about" ref={ref} aria-labelledby="about-title"
				onClose={() => {
					// Dashboard port: back to where the focus was, as showModal() did (a focused Close
					// button in a closed dialog is not the body, so upstream's check alone kept it there).
					const r = returnTo;
					returnTo = null;
					if (r && r !== document.body && r.isConnected) r.focus();
					else KW.term?.focus();
				}}
				onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}
				onClick={(e) => { if (e.target === ref.current) close(); }}
				className="m-auto w-[min(440px,calc(100%-24px))] overflow-visible border border-line-strong bg-bg p-0 font-mono text-[12.5px] leading-relaxed text-fg shadow-[0_16px_48px_rgba(0,0,0,.8)] select-text backdrop:bg-black/65">
				<div className="px-4 pt-5 pb-4">
					<h2 id="about-title" className="absolute -top-2 left-3 bg-bg px-1.5 text-[12px] leading-4 font-normal"><span className="text-faint">┤</span> about <span className="text-faint">├</span></h2>
					<p className="text-muted"><b className="font-semibold text-fg">unkernel</b>: Linux compiled to WebAssembly,<br />running unmodified aarch64 user space in your browser tab.</p>
					<dl className="mt-4 grid grid-cols-[8ch_1fr] gap-x-4 gap-y-1 tabular-nums">
						<Row k="source"><A href={REPO}>github.com/pithings/unkernel</A></Row>
						<Row k="kernel">Linux {B.linux || "?"}{B.kernel && <span className="text-faint">, {B.kernel === "local" ? "local build" : <A href={`${REPO}/releases/tag/${B.kernel}`}>{B.kernel}</A>}</span>}</Row>
						<Row k="distro">{distro ? <>{distro.image || distro.name}<span className="text-faint">, {distro.url}</span></> : "none (base shell)"}</Row>
						<Row k="commit">{commit ? <A href={`${REPO}/commit/${B.commit}`}>{commit}</A> : "dev"}{B.date && <span className="text-faint">, {day(B.date)}</span>}</Row>
					</dl>
					<footer className="mt-4 border-t border-line pt-3">
						<p className="text-[12px] text-muted">
							Made with <span className="text-fg" aria-label="love">♥</span> by <A href="https://x.com/_pi0_">Pooya Parsa</A> (<A href="https://github.com/pi0">pi0</A>){" "}
							<span className="text-faint">· <A href={`${REPO}#-credits`}>full credits</A></span><br />
							sponsored by <A href="https://vercel.com/open-source-program"><span className="inline-flex items-center gap-1"><Triangle size={10} />Vercel</span></A>
						</p>
						<div className="mt-5 flex justify-end">
							<button id="about-close" type="button" className="btn btn-sm" onClick={close}>Close</button>
						</div>
					</footer>
				</div>
			</dialog>
		</>
	);
}
