// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The unkernel mark: a prompt on a black tile (also the favicon, index.html).

export function Mark({ size = 20, className }: { size?: number; className?: string }) {
	return (
		<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
			<rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="#000" stroke="#333" />
			<path d="M9 11l5.5 5L9 21" stroke="#ededed" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M16.5 21.5H23" stroke="#ededed" strokeWidth="2.4" strokeLinecap="round" />
		</svg>
	);
}
