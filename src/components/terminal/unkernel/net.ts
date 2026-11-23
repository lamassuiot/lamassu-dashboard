// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The page's guest network: the SDK's NetStack over Wisp servers.
import { DEFAULT_WISP_SERVERS, NetStack, wispBackend, type NetSpec } from "./sdk.ts";

/**
 * The page's network: a NetStack whose backend is the fastest of the Wisp
 * servers (default: the SDK's DEFAULT_WISP_SERVERS; the project's server
 * accepts only page origins on its allow list), or none when `enabled` is
 * false (config.ts: `?net=0`, `?wisp=0`; `?wisp=URL[,URL...]` sets `servers`).
 */
export function browserNet(opts: { enabled: boolean; servers: string[] | null; log?: (m: string) => void }): NetStack | undefined {
	if (!opts.enabled) return undefined;
	const wisp = opts.servers ?? [...DEFAULT_WISP_SERVERS];
	return new NetStack({ backend: wispBackend(wisp, { log: opts.log }), log: opts.log });
}

/** The same network as a spec, for worker mode (?worker=1): the worker builds the NetStack and opens the WebSocket. */
export function browserNetSpec(opts: { enabled: boolean; servers: string[] | null }): NetSpec | undefined {
	if (!opts.enabled) return undefined;
	return { kind: "net", backend: { kind: "wisp", servers: opts.servers ?? [...DEFAULT_WISP_SERVERS] } };
}
