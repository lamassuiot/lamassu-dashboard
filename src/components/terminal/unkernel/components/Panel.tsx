// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The dialog: a terminal-style window over the stage, above the status
// line, with its title in the top border. Tabs: System (Options), Guest
// (the terminal font size, the data disk), Environment (the checks), Kernel log,
// Errors (the fatal one first, with its title) and Keys (the shortcuts). Footer: the keys that work here, Copy diagnostics,
// Suspend and Reboot. shortcuts.ts drives it from the keyboard.
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { KW } from "../kw.ts";
import { APPLE, CHORD, COMMANDS, DIALOG_KEYS, PREFIX, codeLabel } from "../shortcuts.ts";
import { useStore, type Check, type Tab } from "../store.ts";
import { fmtT } from "../ui.ts";
import { FontSize, Options } from "./Options.tsx";

const TABS: Array<[Tab, string, string]> = [["status", "s", "System"], ["guest", "g", "Guest"], ["env", "i", "Environment"], ["log", "l", "Kernel log"], ["errors", "e", "Errors"], ["keys", "?", "Keys"]];
const TITLE: Record<Tab, string> = { status: "system", guest: "guest", env: "environment", log: "kernel log", errors: "errors", keys: "keys" };

export function Panel() {
	const ui = KW.ui!;
	const open = useStore((s) => s.panelOpen);
	const tab = useStore((s) => s.tab);
	const errors = useStore((s) => s.errors.length);
	const options = useStore((s) => s.options);
	const body = useRef<HTMLDivElement>(null);

	const panel = useRef<HTMLElement>(null);
	// A new tab starts at the top; the kernel log at its end (LogPane). Focus on a
	// tab follows the selection (arrows, shortcuts), as tabs do.
	useEffect(() => {
		if (body.current) body.current.scrollTop = 0;
		if ((document.activeElement as HTMLElement | null)?.getAttribute("role") === "tab")
			panel.current?.querySelector<HTMLElement>(`#tab-${tab}`)?.focus();
	}, [tab]);
	const pane = (id: Tab) => ({ id: `pane-${id}`, role: "tabpanel", "aria-labelledby": `tab-${id}`, hidden: tab !== id });

	const changed = open && ui.optionsChanged();
	void options; // re-render (the Reboot label) when an option changes

	return (
		<>
			<div id="scrim" aria-hidden="true" className={open ? "open" : ""} onClick={() => ui.closePanel()} />
			<aside id="panel" ref={panel} className={`${open ? "open" : ""} font-mono text-[12.5px] outline-none`} role="dialog" aria-modal="true" aria-labelledby="panel-title" aria-hidden={!open} inert={!open} tabIndex={-1}>
				{/* The title and the close button sit in the top border. */}
				<h2 id="panel-title" className="absolute -top-2 left-3 bg-bg px-1.5 text-[12px] leading-4 text-fg">
					<span className="text-faint">┤</span> unkernel<span className="text-faint">:</span>{TITLE[tab]} <span className="text-faint">├</span>
				</h2>
				<button id="panel-close" type="button" aria-label="Close panel" title="Close (Esc)" onClick={() => ui.closePanel()}
					className="absolute -top-2 right-3 bg-bg px-1.5 text-[12px] leading-4 text-muted hover:text-fg">[×]</button>

				<div className="tabs flex flex-none flex-wrap gap-1 border-b border-line px-3 pt-4 pb-2 select-none" role="tablist" aria-label="Dialog tabs">
					{TABS.map(([id, key, label]) => (
						<button
							key={id} id={`tab-${id}`} type="button" role="tab" data-tab={id} aria-selected={tab === id} aria-controls={`pane-${id}`}
							tabIndex={tab === id ? 0 : -1} aria-keyshortcuts={key}
							className="inline-flex h-6 items-center gap-1.5 px-2 text-muted transition-colors hover:bg-hover hover:text-fg aria-selected:bg-fg aria-selected:text-black"
							onClick={() => ui.selectTab(id)}
						>
							<KeyLabel k={key} label={label} />
							{id === "errors" && errors > 0 && <span id="err-count" className={tab === "errors" ? "" : "text-err"}>{errors}</span>}
						</button>
					))}
				</div>

				<div id="pbody" ref={body} className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-4">
					<section data-pane="status" {...pane("status")}>
						<H3>Options</H3>
						<Options />
					</section>
					<section data-pane="guest" {...pane("guest")}>
						<H3>Terminal</H3>
						<FontSize />
						<H3>Data disk</H3>
						<DataDisk />
					</section>
					<section data-pane="env" {...pane("env")}>{open && tab === "env" && <Checks />}</section>
					<section data-pane="log" {...pane("log")}>
						{open && tab === "log" ? <LogPane body={body} /> : <pre id="log" />}
					</section>
					<section data-pane="errors" {...pane("errors")}>{open && <Errors />}</section>
					<section data-pane="keys" {...pane("keys")}><KeysHelp /></section>
					<CopyArea />
				</div>

				<div className="flex flex-none items-center gap-2 border-t border-line px-3 py-2 select-none">
					<p className="min-w-0 flex-1 truncate text-[11.5px] text-faint max-md:hidden">
						<K>esc</K> close <K>s g i l e ?</K> tabs <K>c</K> copy <K>z</K> suspend <K>r</K> reboot
					</p>
					<button id="copy" type="button" className="btn btn-sm max-md:flex-1" onClick={() => ui.copyDiagnostics()}>Copy diagnostics</button>
					{/* The SMP kernel cannot be saved (no parking): no Suspend with several CPUs. */}
					{KW.config.cpus < 2 && <button id="suspend" type="button" className="btn btn-sm max-md:flex-1" title="Save the running system in this browser and stop it; the next load offers to resume it"
						onClick={() => void ui.confirmSuspend()}>Suspend</button>}
					<button id="reboot" type="button" className="btn btn-sm btn-primary max-md:flex-1" onClick={() => ui.reboot()}>{changed ? "Reboot to apply" : "Reboot"}</button>
				</div>
			</aside>
		</>
	);
}

/** A tab's label with its key's letter underlined (System: S); a key not in the label (Keys: ?) goes before it. */
function KeyLabel({ k, label }: { k: string; label: string }) {
	const i = label.toLowerCase().indexOf(k);
	if (i < 0) return <><span className="opacity-60 max-sm:hidden">{k}</span>{label}</>;
	return <span>{label.slice(0, i)}<span className="underline underline-offset-2">{label[i]}</span>{label.slice(i + 1)}</span>;
}

/** A key, as the footer and the Keys tab show it. */
const K = ({ children }: { children: ReactNode }) => <kbd className="mx-0.5 font-mono text-muted">{children}</kbd>;

/** A section rule: ── Title ─────── */
const H3 = ({ children }: { children: ReactNode }) => (
	<h3 className="mt-5 mb-3 flex items-center gap-2 text-[11.5px] text-faint first:mt-3">
		<span className="w-3 border-t border-line" />{children}<span className="flex-1 border-t border-line" />
	</h3>
);

function DataDisk() {
	const ui = KW.ui!;
	const status = useStore((s) => s.dataStatus);
	const safeNote = useStore((s) => s.safeNote);
	const file = useRef<HTMLInputElement>(null);
	const safe = KW.config.root === "initramfs";
	return (
		<>
			<p id="data-status" className="text-muted">{status}</p>
			<p id="data-safe-note" hidden={!safeNote} className="mt-2 border-l-2 border-warn pl-3 text-fg">{safeNote}</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<button id="data-export" type="button" className="btn btn-sm" title="Download /data as a .kwsparse.gz file" onClick={() => ui.dataExport()}>Export</button>
				<button id="data-import" type="button" className="btn btn-sm" title="Replace /data with an exported file"
					onClick={async () => { if (await ui.dataImport() && file.current) { file.current.value = ""; file.current.click(); } }}>Import…</button>
				<button id="data-reset" type="button" className="btn btn-sm" title="Start /data again from an empty file system" onClick={() => ui.dataReset()}>Reset</button>
				<button id="data-safe" type="button" className="btn btn-sm"
					title={safe ? "Reboot with the overlay root and your changes on the data disk" : "Reboot with the plain image as the root (kw.root=initramfs), to repair an overlay root"}
					onClick={() => ui.safeModeToggle()}>{safe ? "Leave safe mode" : "Safe mode"}</button>
				<input ref={file} type="file" id="data-file" accept=".gz,.kwsparse,application/gzip,application/octet-stream" hidden
					onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void ui.dataImport(f); }} />
			</div>
		</>
	);
}

/** systemd-style markers. */
const MARK: Record<Check["r"], [string, string]> = {
	pass: ["  OK  ", "text-ok"], fail: ["FAILED", "text-err"], warn: [" WARN ", "text-warn"], info: [" INFO ", "text-faint"],
};

function Checks() {
	const checks = useStore((s) => s.checks);
	return (
		<ul id="checks" className="mt-3 space-y-1.5">
			{checks.map((c) => (
				<li key={c.id} data-r={c.r} className="grid grid-cols-[auto_minmax(88px,32%)_1fr] items-baseline gap-x-3">
					<span className="whitespace-pre text-faint" title={c.r} aria-hidden="true">[<span className={MARK[c.r][1]}>{MARK[c.r][0]}</span>]</span>
					<span className="sr-only">{MARK[c.r][0].trim()}:</span>
					<span className="text-muted">{c.label}</span>
					<span className="min-w-0 break-words">
						{c.value}
						{c.note && <small className={`block text-[11.5px] text-faint ${c.id === "ua" ? "break-all" : ""}`}>{c.note}</small>}
					</span>
				</li>
			))}
		</ul>
	);
}

/** The kernel log: appended to, not re-rendered, as lines arrive (ui.logView). */
function LogPane({ body }: { body: RefObject<HTMLDivElement | null> }) {
	const pre = useRef<HTMLPreElement>(null);
	useEffect(() => {
		const el = pre.current!, view = KW.ui!.logView;
		let rendered = 0, empty = false;
		const render = (reset: boolean) => {
			const b = body.current!;
			const stick = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
			if (reset || empty) { el.textContent = ""; rendered = 0; empty = false; }
			if (!view.lines.length) { el.textContent = "Nothing logged yet."; empty = true; return; }
			const frag = document.createDocumentFragment();
			for (let i = rendered; i < view.lines.length; i++) {
				const l = view.lines[i]!;
				if (!l.cls) { frag.append(`${l.line}\n`); continue; }
				const s = document.createElement("span");
				s.className = l.cls === "e" ? "text-err" : "text-fg";
				s.textContent = `${l.line}\n`;
				frag.append(s);
			}
			el.append(frag);
			rendered = view.lines.length;
			if (stick) b.scrollTop = b.scrollHeight;
		};
		render(true);
		body.current!.scrollTop = body.current!.scrollHeight;
		return view.subscribe(render);
	}, [body]);
	return <pre id="log" ref={pre} className="mt-3 text-[11.5px] leading-normal break-words whitespace-pre-wrap text-muted" />;
}

/** The errors, oldest first; the one that stopped the system (the store's fatal) with its title, and highlighted. */
function Errors() {
	const errors = useStore((s) => s.errors);
	const f = useStore((s) => s.fatal);
	if (!errors.length) return <p id="errors-empty" className="py-10 text-center text-faint">No errors so far.</p>;
	const stop = f ? errors.findIndex((e) => e.fatal) : -1;
	return (
		<ul id="errors" className="mt-3 space-y-3">
			{errors.map((e, i) => (
				<li key={i} id={i === stop ? "fatal" : undefined} role={i === stop ? "alert" : undefined}
					className={`border-l-2 pl-3 ${i === stop ? "border-err bg-err/10 py-2 pr-3" : e.fatal ? "border-err" : "border-line-strong"}`}>
					<div className="mb-0.5 flex items-center gap-2 text-[11.5px] text-faint">
						<span className={e.fatal ? "text-err" : "text-fg"}>[{e.kind}]</span>
						<span className="tabular-nums">+{fmtT(e.t)}{e.fatal ? " · fatal" : ""}</span>
					</div>
					{i === stop && <b id="fatal-title" className="mb-0.5 block font-semibold text-err">✗ {f!.title}</b>}
					<div id={i === stop ? "fatal-msg" : undefined} className="break-words whitespace-pre-wrap">{e.message}</div>
					{i === stop ? <div id="fatal-hint" hidden={!e.hint} className="mt-1 text-[11.5px] text-muted">{e.hint}</div>
						: e.hint && <div className="mt-1 text-[11.5px] text-faint">{e.hint}</div>}
					{e.detail && (
						<details className="mt-1">
							<summary className="cursor-pointer text-[11.5px] text-faint hover:text-muted">details</summary>
							<pre className="mt-1 max-h-56 overflow-auto text-[11px] leading-[1.4] break-all whitespace-pre-wrap text-muted">{e.detail}</pre>
						</details>
					)}
				</li>
			))}
		</ul>
	);
}

function KeysHelp() {
	return (
		<>
			<H3>Anywhere: {PREFIX}, then a key</H3>
			<dl className="grid grid-cols-[minmax(84px,auto)_minmax(108px,auto)_1fr] gap-x-4 gap-y-1.5">
				{COMMANDS.map((c) => (
					<div key={c.label} className="contents">
						<dt>{c.keys.map((k) => <K key={k}>{k}</K>)}</dt>
						<dd className="text-faint">{[c.chord && `${CHORD}-${codeLabel(c.chord)}`].filter(Boolean).join(", ")}</dd>
						<dd className="text-muted">{c.label}</dd>
					</div>
				))}
				<dt><K>{PREFIX}</K></dt><dd /><dd className="text-muted">Send {PREFIX} itself to the guest</dd>
				{APPLE && <><dt><K>⌘A</K></dt><dd /><dd className="text-muted">The prefix too, as {PREFIX}; ⌘ may stay held for the key after it</dd></>}
				<dt><K>1</K>…<K>9</K></dt><dd className="text-faint">{CHORD}-1…9</dd><dd className="text-muted">Windows 1 to 9: terminal windows, each its own shell (n opens one; it closes when its shell exits)</dd>
			</dl>
			<H3>In this dialog</H3>
			<dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-4 gap-y-1.5">
				{DIALOG_KEYS.map(([k, label]) => (
					<div key={label} className="contents"><dt className="text-muted">{k}</dt><dd className="text-muted">{label}</dd></div>
				))}
			</dl>
			<H3>Terminal</H3>
			<p className="text-muted">With text selected, Ctrl-C copies instead of sending ^C; Ctrl-Shift-C always copies. On phones, pinch the terminal to change the font size; the extra keys show above the on-screen keyboard.</p>
		</>
	);
}

/** Copy diagnostics without the Clipboard API: the text, selected, to copy by hand. */
function CopyArea() {
	const text = useStore((s) => s.copyText);
	return (
		<textarea id="copy-area" readOnly hidden={text === null} value={text ?? ""} aria-label="Diagnostics text"
			className="field mt-3 h-40 w-full resize-y p-2 text-[11px]" />
	);
}
