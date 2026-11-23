import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_KEY, loadSettings, readConfig, saveSettings } from "./config.ts";
import { createKW } from "./kw.ts";
import { ui$ } from "./store.ts";
import { createUi } from "./ui.ts";

const DEFAULT_WISP = "wss://w.example/";

describe("readConfig wisp default", () => {
	// happy-dom has no crossOriginIsolated, which readConfig reads for the worker default.
	beforeEach(() => {
		vi.stubGlobal("crossOriginIsolated", false);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("seeds wisp from defaults without reporting it as a setting", () => {
		const cfg = readConfig("", {}, { wisp: DEFAULT_WISP });
		expect(cfg.wisp).toEqual([DEFAULT_WISP]);
		expect(cfg.net).toBe(true);
		expect(cfg.settings.wisp).toBeUndefined();
	});

	it("lets a saved wisp win over the default", () => {
		const cfg = readConfig("", { wisp: "wss://saved/" }, { wisp: DEFAULT_WISP });
		expect(cfg.wisp).toEqual(["wss://saved/"]);
		expect(cfg.settings.wisp).toBe("wss://saved/");
	});

	it("lets the URL win over saved and default", () => {
		const cfg = readConfig("?wisp=wss://url/", { wisp: "wss://saved/" }, { wisp: DEFAULT_WISP });
		expect(cfg.wisp).toEqual(["wss://url/"]);
	});

	it("lets ?net=0 disable the network despite the default", () => {
		const cfg = readConfig("?net=0", {}, { wisp: DEFAULT_WISP });
		expect(cfg.net).toBe(false);
		expect(cfg.wisp).toBeNull();
	});

	it("lets a saved wisp=0 disable the network despite the default", () => {
		const cfg = readConfig("", { wisp: "0" }, { wisp: DEFAULT_WISP });
		expect(cfg.net).toBe(false);
		expect(cfg.wisp).toBeNull();
	});

	it("lets a saved net=0 disable the network despite the default", () => {
		const cfg = readConfig("", { net: "0" }, { wisp: DEFAULT_WISP });
		expect(cfg.net).toBe(false);
		expect(cfg.wisp).toBeNull();
	});

	it("treats an empty saved or URL wisp as unset, so the default still applies", () => {
		const saved = readConfig("", { wisp: "" }, { wisp: DEFAULT_WISP });
		expect(saved.wisp).toEqual([DEFAULT_WISP]);
		expect(saved.settings.wisp).toBeUndefined();
		const url = readConfig("?wisp=", { wisp: "wss://saved/" }, { wisp: DEFAULT_WISP });
		expect(url.wisp).toEqual([DEFAULT_WISP]);
		expect(url.settings.wisp).toBeUndefined();
		expect(readConfig("", { wisp: " , " }, { wisp: DEFAULT_WISP }).wisp).toEqual([DEFAULT_WISP]);
	});

	it("falls back to the upstream servers when the default is empty or missing", () => {
		expect(readConfig("", {}, { wisp: "" }).wisp).toBeNull();
		expect(readConfig("", {}, { wisp: undefined }).wisp).toBeNull();
		expect(readConfig("", {}, {}).wisp).toBeNull();
		expect(readConfig("", {}).wisp).toBeNull();
	});
});

describe("Options with the operator's wisp default", () => {
	beforeEach(() => {
		vi.stubGlobal("crossOriginIsolated", false);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const optionsFor = (search: string, saved: Record<string, string>) => {
		const kw = createKW(readConfig(search, saved, { wisp: DEFAULT_WISP }));
		kw.ui = createUi(kw.config);
		return kw.ui;
	};

	it("ignores an invalid saved font and maps Ctrl-pipe to FS", () => {
		localStorage.setItem("kw.font", "invalid");
		const ui = optionsFor("", {});
		expect(ui$().get().fontSize).toBe(11);
		ui.setCtrl(true);
		expect(ui.applyCtrl("|")).toBe("\x1c");
		localStorage.removeItem("kw.font");
	});

	it("does not report a saved wisp list with spaces as changed", () => {
		const ui = optionsFor("", { wisp: "wss://a/, wss://b/" });
		expect(ui.optionsChanged()).toBe(false);
	});

	it("shows the default as the default servers, so Reboot does not save it", () => {
		const ui = optionsFor("", {});
		expect(ui$().get().options.net).toBe("default");
		expect(ui.nextSettings().wisp).toBeUndefined();
		expect(ui.optionsChanged()).toBe(false);
	});

	it("keeps a saved wisp as custom servers", () => {
		const ui = optionsFor("", { wisp: "wss://saved/" });
		expect(ui$().get().options).toMatchObject({ net: "custom", wisp: "wss://saved/" });
		expect(ui.nextSettings().wisp).toBe("wss://saved/");
		expect(ui.optionsChanged()).toBe(false);
	});

	it("saves nothing for custom servers left empty, so the default applies on the next boot", () => {
		const ui = optionsFor("", {});
		ui.setOption("net", "custom");
		ui.setOption("wisp", "  ");
		expect(ui.nextSettings().wisp).toBeUndefined();
	});
});

describe("settings storage robustness", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("loadSettings returns {} when localStorage.getItem throws", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("denied");
			},
		});
		expect(loadSettings()).toEqual({});
	});

	it("loadSettings returns {} for invalid JSON", () => {
		localStorage.setItem(SETTINGS_KEY, "not json");
		expect(loadSettings()).toEqual({});
	});

	it("saveSettings returns false when setItem throws", () => {
		vi.stubGlobal("localStorage", {
			setItem: () => {
				throw new Error("quota");
			},
			removeItem: () => {},
		});
		expect(saveSettings({ wisp: "wss://x/" })).toBe(false);
	});
});
