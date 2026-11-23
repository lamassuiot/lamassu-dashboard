// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The About dialog's build details, in place of upstream's __KW_BUILD__
// (a vite.config.ts define). Here: the vendored unkernel release. `linux` is
// the "Linux version" string of the npm package's dist/unkernel.wasm (update
// it with the package; without it About reads "Linux ?").
export const KW_BUILD: { linux: string; kernel: string; commit: string; date: string } = {
	linux: "7.3.4",
	kernel: "v0.2.0-261119-97d7945",
	commit: "97d7945",
	date: "",
};
