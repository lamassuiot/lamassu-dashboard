// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// Options in the System tab: one control per setting (config.ts) except
// ?simulate. Reboot saves them in localStorage and reloads
// (ui.nextSettings()).
// Terminal style: on/off options are [x] check boxes, Network and Distro are
// (•) radio choices, CPUs and Memory are sliders over their counts and sizes.
// FontSize, in the Guest tab, is the same kind of slider; it applies at once
// and is kept in localStorage. The
// CPUs slider is disabled, with the reason, where the page cannot boot more
// than one (config.ts smpBlocker()). Distro (?distro=) lists the page's images and none.
//
// The fields are controlled by the store. Besides onChange, native listeners
// on the form (capture phase, so non-bubbling events count too) read every
// change: React drops an event whose value was set from script (autofill,
// the browser tests), and the store would miss it. A check box stores its
// data-on or data-off value, so the options keep the values nextSettings() reads.
import { useEffect, useRef, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { DEFAULT_CMDLINE, DEFAULT_DISTRO, DISTROS_OFFERED, webkitEngine } from "../config.ts";
import { KW } from "../kw.ts";
import { useStore, type Options as Opts } from "../store.ts";
import { autoFont } from "../ui.ts";

/** A field changed: the store's option of its name, or the font size (applied at once). */
function onField(e: Event | ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
	const t = e.target as HTMLInputElement | HTMLSelectElement;
	if (!t.name) return;
	let v = t.value;
	if (t instanceof HTMLInputElement && t.type === "checkbox") v = (t.checked ? t.dataset.on : t.dataset.off) ?? "";
	else if (t instanceof HTMLInputElement && t.type === "range") v = t.dataset.values?.split(",")[+t.value] ?? "";
	else if (t instanceof HTMLInputElement && t.type === "radio" && !t.checked) return;
	pick(t.name, v);
}

const pick = (name: string, v: string) => (name === "font" ? KW.ui!.setFont(v) : KW.ui!.setOption(name as keyof Opts, v as never));

function Field({ label, wide, hidden, id, children }: { label: string; wide?: boolean; hidden?: boolean; id?: string; children: ReactNode }) {
	return (
		<label id={id} hidden={hidden} className={`flex flex-col gap-1.5 text-[11.5px] text-faint ${wide ? "col-span-full" : ""}`}>
			{label}
			{children}
		</label>
	);
}

/**
 * [x] Label, with a note under it. The input is real (keyboard, screen readers), drawn as text.
 * A forced box is shown ticked and disabled, its stored value kept (Worker thread with several CPUs).
 */
function Check({ id, name, on, off, value, label, note, forced }: { id: string; name: keyof Opts; on: string; off: string; value: string; label: string; note?: string; forced?: boolean }) {
	const checked = forced || value === on;
	return (
		<label className={`group flex items-start gap-2 py-0.5 text-muted select-none ${forced ? "cursor-not-allowed" : "cursor-pointer hover:text-fg"}`}>
			<input id={id} name={name} type="checkbox" data-on={on} data-off={off} checked={checked} disabled={forced} onChange={onField} className="peer sr-only" />
			<span aria-hidden="true" className="whitespace-pre peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
				<span className="text-faint">[</span><span className={checked ? "text-ok" : ""}>{checked ? "x" : " "}</span><span className="text-faint">]</span>
			</span>
			<span>
				<span className={checked ? "text-fg" : ""}>{label}</span>
				{note && <small className="block text-[11.5px] text-faint">{note}</small>}
			</span>
		</label>
	);
}

/** (•) one of several. */
function Radio({ id, name, value, current, label }: { id: string; name: keyof Opts; value: string; current: string; label: string }) {
	const checked = value === current;
	return (
		<label className="flex cursor-pointer items-center gap-1.5 text-muted select-none hover:text-fg">
			<input id={id} name={name} type="radio" value={value} checked={checked} onChange={onField} className="peer sr-only" />
			<span aria-hidden="true" className="whitespace-pre peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
				<span className="text-faint">(</span><span className={checked ? "text-ok" : ""}>{checked ? "•" : " "}</span><span className="text-faint">)</span>
			</span>
			<span className={checked ? "text-fg" : ""}>{label}</span>
		</label>
	);
}

/** `warn`: a choice to try, not to keep (red when selected, with `warnNote` under the slider). */
type Stop = { value: string; tick: string; label: string; note?: string; warn?: boolean };

/**
 * A slider over a few stops (value: the stop's index; data-values maps it
 * back), with the current value beside the label and each stop's tick label
 * under it, plus an optional note under that (Memory: "auto" under the size
 * auto picks). A tick is clickable and lines up with the thumb's centre there.
 * A disabled slider (CPUs where only one is possible) says why in its note.
 */
function Slider({ id, name, label, value, stops, disabled, note, noteId, warnNote }: {
	id: string; name: string; label: string; value: string; stops: Stop[]; disabled?: boolean; note?: string; noteId?: string; warnNote?: string;
}) {
	const i = Math.max(0, stops.findIndex((s) => s.value === value)), last = stops.length - 1;
	const at = (k: number) => `calc(${last ? k / last : 0} * (100% - var(--thumb)) + var(--thumb) / 2)`;
	const cur = stops[i]!.label;
	const warn = !disabled && !!stops[i]!.warn;
	if (warn && warnNote) note = warnNote;
	return (
		<div className="flex flex-col gap-1.5 text-[11.5px] text-faint [--thumb:12px]">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={id}>{label}</label>
				<output htmlFor={id} className={`font-mono text-[12px] tabular-nums ${warn ? "text-err" : "text-fg"}`}>{cur}</output>
			</div>
			<input id={id} name={name} type="range" min={0} max={last} step={1} value={i} data-values={stops.map((s) => s.value).join(",")}
				disabled={disabled} aria-valuetext={cur} aria-describedby={note ? noteId : undefined} onChange={onField}
				className="slider w-full disabled:cursor-not-allowed disabled:opacity-50" style={{ "--fill": at(i), ...(warn ? { "--tone": "var(--color-err)" } : {}) } as never} />
			<div className={`relative font-mono text-[11px] leading-[14px] select-none ${stops.some((s) => s.note) ? "h-7" : "h-3.5"} ${disabled ? "opacity-50" : ""}`} aria-hidden="true">
				{stops.map((s, k) => (
					<span key={s.value} onClick={disabled ? undefined : () => pick(name, s.value)} style={{ left: at(k) }}
						className={`absolute top-0 flex -translate-x-1/2 flex-col items-center tabular-nums ${disabled ? "" : "cursor-pointer hover:text-fg"} ${k === i ? (warn ? "text-err" : "text-fg") : ""}`}>
						{s.tick}{s.note && <span className="text-[10px] text-ok">{s.note}</span>}
					</span>
				))}
			</div>
			{note && <small id={noteId} className={`text-[11.5px] ${warn ? "text-err" : "text-faint"}`}>{note}</small>}
		</div>
	);
}

const SIZES = [64, 128, 256, 512, 1024];
const CPU_COUNTS = [1, 2, 4, 8, 16];
const FONTS = [11, 12, 13, 14, 15, 16, 18];

export function Options() {
	const ui = KW.ui!, cfg = KW.config;
	const o = useStore((s) => s.options);
	const form = useRef<HTMLFormElement>(null);

	useEffect(() => {
		const f = form.current!;
		f.addEventListener("change", onField, true);
		f.addEventListener("input", onField, true);
		return () => {
			f.removeEventListener("change", onField, true);
			f.removeEventListener("input", onField, true);
		};
	}, []);

	// Memory stops: the sizes, the one auto picks on this device (marked, and
	// choosing it means auto) and a ?mem= that is none of them.
	const mib = (n: number) => (n < 1024 ? `${n} MiB` : `${+(n / 1024).toFixed(1)} GiB`);
	const sizes = [...new Set([...SIZES, cfg.memAutoMiB, ...(cfg.memParam ? [Number(cfg.memParam)] : [])])].sort((a, b) => a - b);
	const mem: Stop[] = sizes.map((n) => ({
		value: n === cfg.memAutoMiB ? "auto" : String(n),
		tick: n < 1024 ? String(n) : `${+(n / 1024).toFixed(1)}G`,
		label: n === cfg.memAutoMiB ? `Auto (${mib(n)})` : mib(n),
		note: n === cfg.memAutoMiB ? "auto" : undefined,
	}));
	const memValue = o.mem === String(cfg.memAutoMiB) ? "auto" : o.mem;

	// CPUs: 1, 2, 4, 8, 16 up to the host's threads, the host's threads themselves (the most
	// there is to try), the suggested count and a ?cpus= that is none of them. Past the
	// suggestion (one in WebKit) a count is there to try: red when selected.
	const cpuOk = cfg.cpuSuggested || 1;
	const cpus: Stop[] = [...new Set([...CPU_COUNTS.filter((n) => n <= cfg.cpuMax), cfg.cpuMax, ...(cfg.cpuSuggested ? [cfg.cpuSuggested] : []), cfg.smpParam])].sort((a, b) => a - b)
		.map((n) => {
			const sug = n === cfg.cpuSuggested && n > 1;
			return { value: String(n), tick: String(n), label: `${n} CPU${n > 1 ? "s" : ""}${sug ? " (suggested)" : ""}`, note: sug ? "suggested" : undefined, warn: n > cpuOk };
		});
	const cpuWarn = webkitEngine()
		? "To try: in Safari and on iOS, several CPUs ran slower than one."
		: `To try: more than ${cpuOk} CPU${cpuOk > 1 ? "s" : ""} leaves this device's threads busy (a busy host stalls the guest) and gains little; boot is slower and each CPU takes 8 MiB of guest memory. No Suspend.`;
	// More than one CPU runs each in a Web Worker (config.ts: worker), so Worker thread is ticked and locked.
	const smp = o.cpus !== "1" && !cfg.smpBlocked;
	const cpuNote = cfg.smpBlocked ? `One CPU on this page: ${cfg.smpBlocked}.`
		: cfg.smpWhy ? `This boot runs on one CPU: ${cfg.smpWhy}.`
		: "More than one boots the SMP kernel, each CPU in a Web Worker (as with Worker thread); no Suspend.";

	// Distro: the images (debian first) and none, the base shell.
	const mib1 = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MiB`;
	const distros = [...DISTROS_OFFERED.map((d) => ({ value: d.name, label: `${d.name[0]!.toUpperCase()}${d.name.slice(1)}`, title: `${d.url}, ${mib1(d.size)}, streamed` })),
		{ value: "none", label: "None (base shell)", title: "no distro image: the base initramfs's busybox shell" }];
	const distroNote = cfg.distroWhy ? `${cfg.distroWhy}.`
		: `A read-only image under the root overlay; its changes are kept per distro on the data disk. Default ${DEFAULT_DISTRO}.`;

	// Enter in a text field reboots, like the button.
	const enter = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); ui.reboot(); } };

	return (
		<form ref={form} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-4" onSubmit={(e) => e.preventDefault()}>
			<div className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-1.5">
				<Check id="opt-jit" name="jit" on="on" off="off" value={o.jit} label="JIT compiler" note="hot guest code to WebAssembly" />
				<Check id="opt-data" name="data" on="on" off="off" value={o.data} label="Data disk" note="/data, saved in this browser" />
				<Check id="opt-verbose" name="verbose" on="keep" off="clear" value={o.verbose} label="Verbose boot" note="show all kernel messages" />
				<Check id="opt-root" name="root" on="safe" off="overlay" value={o.root} label="Safe mode" note="boot without your changes" />
				<Check id="opt-worker" name="worker" on="on" off="off" value={o.worker} label="Worker thread" forced={smp}
					note={smp ? "always on with several CPUs" : "the kernel off the page's main thread"} />
			</div>

			<fieldset className="col-span-full flex flex-col gap-1.5">
				<legend className="mb-1.5 text-[11.5px] text-faint">Network</legend>
				<div className="flex flex-wrap gap-x-5 gap-y-1" role="radiogroup" id="opt-net">
					<Radio id="opt-net-default" name="net" value="default" current={o.net} label="Wisp" />
					<Radio id="opt-net-custom" name="net" value="custom" current={o.net} label="Wisp, custom servers" />
					<Radio id="opt-net-off" name="net" value="off" current={o.net} label="Off" />
				</div>
			</fieldset>
			<Field label="Wisp servers (comma-separated)" wide id="opt-wisp-row" hidden={o.net !== "custom"}>
				<input id="opt-wisp" name="wisp" type="text" inputMode="url" placeholder="wss://wisp.example.com/" autoCapitalize="off" autoComplete="off" spellCheck={false}
					value={o.wisp} onChange={onField} onKeyDown={enter} className="field h-8 px-2.5 text-[12.5px]" />
			</Field>

			<fieldset className="col-span-full flex flex-col gap-1.5">
				<legend className="mb-1.5 text-[11.5px] text-faint">Distro</legend>
				<div className="flex flex-wrap gap-x-5 gap-y-1" role="radiogroup" id="opt-distro">
					{distros.map((d) => (
						<span key={d.value} title={d.title || undefined}>
							<Radio id={`opt-distro-${d.value}`} name="distro" value={d.value} current={o.distro} label={d.label} />
						</span>
					))}
				</div>
				<small id="opt-distro-note" className="text-[11.5px] text-faint">{distroNote}</small>
			</fieldset>

			<div className="col-span-full mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-start gap-x-12 gap-y-5">
				<Slider id="opt-cpus" name="cpus" label="CPUs" value={o.cpus} stops={cpus} disabled={!!cfg.smpBlocked} note={cpuNote} noteId="opt-cpus-note" warnNote={cpuWarn} />
				<Slider id="opt-mem" name="mem" label="Memory" value={memValue} stops={mem} />
			</div>
			<Field label="Kernel command line" wide>
				<input id="opt-append" name="append" type="text" autoCapitalize="off" autoComplete="off" spellCheck={false} placeholder={DEFAULT_CMDLINE}
					value={o.append} onChange={onField} onKeyDown={enter} className="field h-8 px-2.5 text-[12.5px]" />
			</Field>
		</form>
	);
}

/** The terminal font size (Guest tab): applied at once, no reboot. Stops like Memory's: auto's size marked, and a size from a pinch. */
export function FontSize() {
	const fontPref = useStore((s) => s.fontPref);
	const autoPx = autoFont();
	const px = [...new Set([...FONTS, autoPx, ...(fontPref !== "auto" ? [Number(fontPref)] : [])])].sort((a, b) => a - b);
	const fonts: Stop[] = px.map((n) => ({
		value: n === autoPx ? "auto" : String(n), tick: String(n),
		label: n === autoPx ? `Auto (${n} px)` : `${n} px`, note: n === autoPx ? "auto" : undefined,
	}));
	const fontValue = fontPref === String(autoPx) ? "auto" : fontPref;
	return (
		<div className="max-w-sm">
			<Slider id="opt-font" name="font" label="Font size" value={fontValue} stops={fonts} />
		</div>
	);
}
