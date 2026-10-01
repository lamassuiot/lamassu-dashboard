import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { WfxWorkflow } from '@/lib/wfx-api';
import { WorkflowGraph } from './WorkflowGraph';

const workflow: WfxWorkflow = {
    name: 'CMP enrollment',
    states: [
        { name: 'requested', description: 'Request received' },
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

describe('WorkflowGraph', () => {
    it('preserves label colors on traversed edges', () => {
        const { container } = render(
            <WorkflowGraph
                workflow={workflow}
                followedStates={['requested', 'validated', 'approved', 'issued']}
            />,
        );

        const [device, admin] = Array.from(container.querySelectorAll('[data-slot="workflow-edge-label"]'));
        expect(device).toHaveTextContent('Device');
        expect(device).toHaveClass('border-emerald-500/30');
        expect(admin).toHaveTextContent('Admin');
        expect(admin).toHaveClass('border-amber-500/30');
    });

    it('only labels transitions that someone other than the backend performs', () => {
        const { container } = render(<WorkflowGraph workflow={workflow} />);

        expect(container.querySelectorAll('[data-slot="workflow-edge-label"]')).toHaveLength(2);
    });

    it('marks the last followed state as current', () => {
        const { container } = render(<WorkflowGraph workflow={workflow} followedStates={['requested', 'validated']} />);

        expect(container.querySelector('[data-state-id="validated"]')).toHaveAttribute('aria-current', 'step');
        expect(container.querySelector('[data-state-id="requested"]')).not.toHaveAttribute('aria-current');
        expect(container.querySelector('[data-state-id="issued"]')).not.toHaveAttribute('data-active');
    });

    it('renders an empty workflow without crashing', () => {
        render(<WorkflowGraph workflow={{ name: 'empty', states: [], transitions: [] }} />);

        expect(screen.getByText('This workflow defines no states.')).toBeInTheDocument();
    });
});
