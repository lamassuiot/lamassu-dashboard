import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { WfxWorkflow } from '@/lib/wfx-api';
import { WorkflowGraph } from './WorkflowGraph';

const workflow: WfxWorkflow = {
    name: 'CMP enrollment',
    states: [
        { name: 'requested' },
        { name: 'validated' },
        { name: 'approved' },
        { name: 'issued' },
    ],
    transitions: [
        { from: 'requested', to: 'validated', eligible: 'CLIENT', description: 'device' },
        { from: 'validated', to: 'approved', eligible: 'WFX', description: 'admin' },
        { from: 'approved', to: 'issued', eligible: 'WFX' },
    ],
};

function expectLabelClasses(label: string, rectClasses: string, textClasses: string) {
    const text = screen.getByText(label, { selector: 'text' });
    const rect = text.previousElementSibling;

    expect(rect).toHaveClass(...rectClasses.split(' '));
    expect(text).toHaveClass(...textClasses.split(' '));
}

describe('WorkflowGraph', () => {
    it('preserves label colors on traversed edges', () => {
        render(
            <WorkflowGraph
                workflow={workflow}
                followedStates={['requested', 'validated', 'approved', 'issued']}
            />,
        );

        expectLabelClasses('Device', 'fill-card stroke-emerald-500', 'fill-emerald-600');
        expectLabelClasses('Admin', 'fill-card stroke-amber-500', 'fill-amber-600');
        expectLabelClasses('WFX', 'fill-card stroke-border', 'fill-muted-foreground');
    });
});
