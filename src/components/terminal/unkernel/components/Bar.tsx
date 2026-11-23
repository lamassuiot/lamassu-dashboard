// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The status line at the bottom, tmux style. Left: the
// windows (a terminal icon and a name: con, the console, then the terminal
// windows 1 to 9, tty N, and last + for a new window;
// the current one is inverted; terminal windows have a × while
// current or under the pointer), and the prefix: ^A, faint, which opens the
// Keys tab, or while it is armed, highlighted with what it takes. Right, in
// groups: the data disk's used
// space (opens System) and kernel memory (opens Environment); Errors with
// their count, only while there are any; Suspend (a pause icon while the
// system runs; a play icon, Resume, once suspended) and Reboot; the About
// triangle (About.tsx); and last the Kernel log and System, which also shows
// the state in its colour. Below sm, all but Errors move into a ⋯ menu (More). The windows and icons
// are buttons, so phones get around by tapping; on touch the line is taller
// and its buttons wider (--bar-h, style.css).
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { KW } from "../kw.ts";
import { PREFIX, PREFIX_SHORT, closeWindow, newWindow, selectWindow } from "../shortcuts.ts";
import { MAX_WINDOWS, useStore, type Tab } from "../store.ts";
import { About, openAbout } from "./About.tsx";

/**
 * A mouse click leaves no focus behind (closing the dialog then returns to
 * the terminal); keyboard activation (detail 0) keeps it, so focus comes
 * back to this button when the dialog closes (ui.ts).
 */
const mouseBlur = (e: MouseEvent<HTMLElement>) => { if (e.detail) e.currentTarget.blur(); };

/** The item's key after the prefix, shown on it while the prefix is armed (which-key style). */
function Hint({ k }: { k: string }) {
	const armed = useStore((s) => s.prefix);
	if (!armed) return null;
	return <kbd className="mr-1.5 inline-grid h-4 min-w-4 place-items-center bg-warn px-0.5 font-mono text-[11px] font-semibold text-black">{k}</kbd>;
}

/**
 * A status line segment: plain, or inverted while current. With onClose it
 * has a × after it, shown while it is current or under the pointer.
 */
function Seg({ id, on, title, label, hint, onClick, onClose, closeTitle, children, className = "" }: {
	id?: string; on?: boolean; title: string; label?: string; hint?: string; onClick: () => void;
	onClose?: () => void; closeTitle?: string; children: ReactNode; className?: string;
}) {
	const colors = on ? "bg-fg text-black" : "text-muted hover:bg-hover hover:text-fg";
	const main = (
		<button
			id={id} type="button" title={hint ? `${title} (${PREFIX} ${hint})` : title} aria-label={label ?? title} aria-pressed={on}
			className={`inline-flex h-full flex-none items-center whitespace-nowrap transition-colors ${onClose ? "pl-1.5" : `px-1.5 ${colors}`} ${className}`}
			onClick={(e) => { mouseBlur(e); onClick(); }}
		>{hint && <Hint k={hint} />}{children}</button>
	);
	if (!onClose) return main;
	return (
		<span className={`group inline-flex h-full flex-none items-stretch transition-colors ${colors}`}>
			{main}
			<button
				type="button" title={closeTitle} aria-label={closeTitle}
				className={`inline-flex items-center pr-1.5 pl-1 hover:opacity-100 focus-visible:opacity-100 ${on ? "opacity-60" : "opacity-0 group-hover:opacity-60"}`}
				onClick={(e) => { mouseBlur(e); onClose(); }}
			>×</button>
		</span>
	);
}

/** 13 px stroke icons in currentColor. */
const Icon = ({ children }: { children: ReactNode }) => (
	<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
/** A gear: a ring with eight teeth and a hub. */
const SysIcon = () => <Icon><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2.5" /><path d="M18.5 12H21M12 18.5V21M5.5 12H3M12 5.5V3M16.6 16.6l1.8 1.8M7.4 16.6l-1.8 1.8M7.4 7.4 5.6 5.6M16.6 7.4l1.8-1.8" /></Icon>;
const LogIcon = () => <Icon><path d="M4 5h16M4 10h16M4 15h10M4 20h7" /></Icon>;
const MemIcon = () => <Icon><rect x="5" y="5" width="14" height="14" rx="1.5" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></Icon>;
const DiskIcon = () => <Icon><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Icon>;
const PauseIcon = () => <Icon><path d="M9 5v14M15 5v14" /></Icon>;
/** A circular arrow. */
const RebootIcon = () => <Icon><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" /></Icon>;
const PlayIcon = () => <Icon><path d="M7 4.5v15L19.5 12 7 4.5Z" /></Icon>;
const ErrIcon = () => <Icon><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5M12 17.5h0" /></Icon>;
/** A prompt in a window: the console and the terminal windows. */
const TermIcon =() => <Icon><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12.5 15H17" /></Icon>;


/** Bytes, short: 512K, 37M, 1.5G. */
const fmtSize = (n: number) =>
	n >= 1073741824 ? `${+(n / 1073741824).toFixed(1)}G` : n >= 1048576 ? `${Math.round(n / 1048576)}M` : `${Math.round(n / 1024)}K`;

type Item = [string, ReactNode, () => void];

/**
 * Narrow screens (below sm): the right side keeps only Errors, and the rest moves into this menu, in groups: System,
 * the data disk, memory; Kernel log, Keys; Suspend or Resume, Reboot;
 * About. Esc, a pick or a tap outside closes it.
 */
function More() {
	const ui = KW.ui!;
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const state = useStore((s) => s.state);
	const suspended = useStore((s) => s.suspended);
	const disk = useStore((s) => s.disk);
	const mem = KW.memActualMiB || KW.config.memMiB;
	useEffect(() => {
		if (!open) return;
		box.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
		const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
		const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
		document.addEventListener("pointerdown", down, true);
		document.addEventListener("keydown", key, true);
		return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
	}, [open]);
	const pick = (run: () => void) => () => { setOpen(false); run(); };
	// A separator between groups.
	const groups: Item[][] = [
		[
			["System", <SysIcon />, () => ui.openPanel("status")],
			...(disk ? [[`Data disk ${fmtSize(disk.used)}/${fmtSize(disk.size)}`, <DiskIcon />, () => ui.openPanel("guest")] as Item] : []),
			[`Memory ${mem >= 1024 ? `${+(mem / 1024).toFixed(1)}G` : `${mem}M`}`, <MemIcon />, () => ui.openPanel("env")],
		],
		[
			["Kernel log", <LogIcon />, () => ui.openPanel("log")],
			["Keyboard shortcuts", <span className="w-[13px] text-center text-[10px]">{PREFIX_SHORT}</span>, () => ui.openPanel("keys")],
		],
		[
			...(suspended ? [["Resume", <PlayIcon />, ui.resume] as Item]
				: state === "running" && KW.suspend ? [["Suspend", <PauseIcon />, () => void ui.confirmSuspend()] as Item] : []),
			["Reboot", <RebootIcon />, () => void ui.confirmReboot()],
		],
		[["About", <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1Z" fill="currentColor" /></svg>, openAbout]],
	];
	return (
		<div ref={box} className="flex flex-none items-stretch sm:hidden">
			<button id="bar-more" type="button" title="More" aria-label="More" aria-haspopup="menu" aria-expanded={open}
				className={`inline-flex h-full flex-none items-center px-1.5 transition-colors hover:bg-hover ${open ? "bg-hover text-fg" : "text-muted"}`}
				onClick={(e) => { mouseBlur(e); setOpen(!open); }}>⋯</button>
			{open && (
				<div id="bar-menu" role="menu" aria-label="More"
					className="absolute right-[max(4px,var(--sr))] bottom-full z-30 mb-1 flex min-w-48 flex-col border border-line-strong bg-bg py-1 shadow-[0_16px_48px_rgba(0,0,0,.8)]">
					{groups.map((group, i) => [
						i > 0 && <div key={`sep-${i}`} role="separator" className="my-1 border-t border-line" />,
						...group.map(([name, icon, run]) => (
							<button key={name} type="button" role="menuitem" onClick={pick(run)}
								className="flex items-center gap-2.5 px-3 py-2.5 text-left text-muted hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-none">
								<span className="inline-flex w-[13px] justify-center">{icon}</span>{name}
							</button>
						)),
					])}
				</div>
			)}
		</div>
	);
}

export function Bar() {
	const ui = KW.ui!;
	const label = useStore((s) => s.label);
	const state = useStore((s) => s.state);
	const suspended = useStore((s) => s.suspended);
	const errors = useStore((s) => s.errors.length);
	const panel = useStore((s) => (s.panelOpen ? s.tab : null));
	const prefix = useStore((s) => s.prefix);
	const disk = useStore((s) => s.disk);
	const win = useStore((s) => s.win);
	const wins = useStore((s) => s.wins);
	const mem = KW.memActualMiB || KW.config.memMiB;
	const term = !panel;
	const tab = (t: Tab) => () => ui.togglePanel(t);
	const canOpen = wins.length < MAX_WINDOWS && state !== "halted" && state !== "error";

	return (
		<footer id="bar" aria-label="Status line" className="relative flex min-h-[calc(var(--bar-h)+var(--sb))] flex-none items-stretch gap-2 border-t border-line bg-surface pr-[max(4px,var(--sr),var(--sc))] pb-(--sb) pl-[max(var(--sl),var(--sc))] font-mono text-[12px] leading-none select-none">
			<div className="flex min-w-0 flex-1 items-stretch gap-px overflow-hidden">
				<Seg id="bar-win-0" on={term && win === 0} title="Console (hvc0), window 0" hint="0" onClick={() => selectWindow(0)}><span className="mr-1 inline-flex"><TermIcon /></span>con</Seg>
				{wins.map((w) => (
					<Seg
						key={w.n} id={`bar-win-${w.n}`} on={term && win === w.n} hint={String(w.n)} onClick={() => selectWindow(w.n)}
						onClose={() => void closeWindow(w.n)} closeTitle={`Close terminal window ${w.n} (${PREFIX} x)`}
						title={`Terminal window ${w.n}${w.state === "opening" ? ", starting" : w.state === "ended" ? `, ended: ${w.note}` : ""}`}
						className={w.state === "ended" && win !== w.n ? "text-err" : w.state === "opening" && win !== w.n ? "text-faint" : ""}
					><span className="mr-1 inline-flex"><TermIcon /></span>{w.fg || w.name}</Seg>
				))}
				{canOpen && <Seg id="bar-new" title="New terminal window" label="New terminal window" hint="n" onClick={newWindow} className="ml-1.5 text-faint">+</Seg>}
				{prefix ? (
					<>
						<span className="flex flex-none items-center bg-warn px-1.5 font-semibold text-black">{PREFIX_SHORT}</span>
						<span className="flex items-center truncate px-1.5 text-faint max-sm:hidden">n new · x close · y copy · z suspend · r reboot · ? keys · esc cancel</span>
					</>
				) : <Seg on={panel === "keys"} title={`Keyboard shortcuts: ${PREFIX}, then a key (${PREFIX} ?)`} label="Keyboard shortcuts" onClick={() => ui.togglePanel("keys")} className="text-[11px] opacity-50 hover:opacity-100 max-sm:hidden">{PREFIX_SHORT}</Seg>}
			</div>
			<div className="flex flex-none items-stretch gap-px">
				{disk && (
					<Seg hint="g" onClick={tab("guest")} className="gap-1.5 tabular-nums max-md:hidden"
						title={`Data disk (/data): ${fmtSize(disk.used)} of ${fmtSize(disk.size)} in use${disk.saved ? ", saved in this browser" : ", in memory only"}. Counts blocks ever written; df in the guest is exact. Opens Guest.`}>
						<DiskIcon />{fmtSize(disk.used)}<span className="opacity-60">/{fmtSize(disk.size)}</span>
					</Seg>
				)}
				<Seg hint="i" onClick={tab("env")} className="gap-1.5 tabular-nums max-md:hidden" title={`Kernel memory: ${mem} MiB. Opens Environment.`}>
					<MemIcon />{mem >= 1024 ? `${+(mem / 1024).toFixed(1)}G` : `${mem}M`}
				</Seg>
				{(errors > 0 || panel === "errors") && (
					<Seg id="bar-errors" on={panel === "errors"} title="Errors" hint="e" label={`Errors: ${errors}`} onClick={tab("errors")}>
						<span className={`inline-flex items-center gap-1 ${panel === "errors" ? "" : "text-err"}`}><ErrIcon />{errors > 0 && errors}</span>
					</Seg>
				)}
				{suspended
					? <Seg id="bar-resume" title="Resume the suspended system" label="Resume" onClick={ui.resume} className="text-ok max-sm:hidden"><PlayIcon /></Seg>
					: state === "running" && KW.suspend && <Seg id="bar-suspend" title="Suspend: save the system in this browser and stop it" hint="z" label="Suspend" onClick={() => void ui.confirmSuspend()} className="max-sm:hidden"><PauseIcon /></Seg>}
				<Seg id="bar-reboot" title="Reboot (asks first while the system runs)" hint="r" label="Reboot" onClick={() => void ui.confirmReboot()} className="max-sm:hidden"><RebootIcon /></Seg>
				<About hint={<Hint k="a" />} className="max-sm:hidden" />
				<More />
				<Seg id="bar-log" on={panel === "log"} title="Kernel log" hint="l" label="Show the kernel log" onClick={tab("log")} className="max-sm:hidden"><LogIcon /></Seg>
				{/* System: the icon is red on an error and dim once halted (style.css);
				    the state's name is only in the tooltip and for screen readers. */}
				<button
					id="status" type="button" aria-pressed={panel === "status"} aria-haspopup="dialog" aria-controls="panel"
					title={`System: ${label} (${PREFIX} s)`} aria-label={`Status: ${label}`}
					className="relative inline-flex h-full flex-none items-center gap-1.5 px-1.5 transition-colors hover:bg-hover aria-pressed:bg-hover max-sm:hidden"
					onClick={(e) => { mouseBlur(e); ui.togglePanel("status"); }}
				>
					<Hint k="s" />
					<SysIcon />
					<span id="status-label" className="sr-only">{label}</span>
				</button>
			</div>
		</footer>
	);
}
