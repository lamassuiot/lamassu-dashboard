"use client";

import React, { useEffect, useMemo, useState } from 'react';

import { fetchWorkflows, type WfxWorkflow } from '@/lib/wfx-api';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { TagInput } from '@/components/shared/TagInput';

import { GenericFilterBar, type GenericFilterField } from './GenericFilterBar';
import { createTextField } from './filter-field-helpers';

export interface JobFilterValues {
    stateFilter: string;
    groupFilter: string;
    clientIdFilter: string;
    tagFilter: string[];
    workflowFilter: string;
}

export const defaultJobFilterValues: JobFilterValues = {
    stateFilter: '',
    groupFilter: '',
    clientIdFilter: '',
    tagFilter: [],
    workflowFilter: '',
};

interface JobFilterBarProps {
    values: JobFilterValues;
    onChange: (key: Extract<keyof JobFilterValues, string>, value: unknown) => void;
    onClearAll: () => void;
    disabled?: boolean;
    actions?: React.ReactNode;
    hideFields?: Array<keyof JobFilterValues>;
}

export function JobFilterBar({
    values,
    onChange,
    onClearAll,
    disabled = false,
    actions,
    hideFields,
}: JobFilterBarProps) {
    const [workflows, setWorkflows] = useState<WfxWorkflow[]>([]);
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);

    useEffect(() => {
        setIsLoadingWorkflows(true);
        fetchWorkflows({ limit: 200 })
            .then((result) => setWorkflows(result.content ?? []))
            .catch(() => { /* silent – selector will just be empty */ })
            .finally(() => setIsLoadingWorkflows(false));
    }, []);

    const fields = useMemo<GenericFilterField<JobFilterValues>[]>(
        () => [
            createTextField<JobFilterValues>({
                key: 'stateFilter',
                label: 'State',
                placeholder: 'Filter by state…',
                visibility: 'advanced',
                changeTiming: 'timed',
                debounceMs: 300,
            }),
            createTextField<JobFilterValues>({
                key: 'groupFilter',
                label: 'Group',
                placeholder: 'Filter by group…',
                visibility: 'advanced',
                changeTiming: 'timed',
                debounceMs: 300,
            }),
            createTextField<JobFilterValues>({
                key: 'clientIdFilter',
                label: 'Device ID',
                placeholder: 'Filter by device ID…',
                visibility: 'advanced',
                changeTiming: 'timed',
                debounceMs: 300,
            }),
            {
                key: 'workflowFilter',
                label: 'Workflow',
                type: 'custom',
                visibility: 'advanced',
                disabled: isLoadingWorkflows,
                renderControl: ({ value, onValueChange, id, disabled: ctxDisabled }) => (
                    <Select
                        value={typeof value === 'string' && value ? value : '__all__'}
                        onValueChange={(v) => onValueChange(v === '__all__' ? '' : v)}
                        disabled={ctxDisabled || isLoadingWorkflows}
                    >
                        <SelectTrigger id={id} className="h-9">
                            <SelectValue placeholder="All Workflows" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Workflows</SelectItem>
                            {workflows.map((w) => (
                                <SelectItem key={w.name} value={w.name}>
                                    {w.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ),
                isActive: (value) => typeof value === 'string' && value.length > 0,
                getActiveBadges: (value, _values, helpers) => {
                    if (!value || typeof value !== 'string') return [];
                    return [
                        {
                            key: 'workflow-filter',
                            label: `Workflow: ${value}`,
                            onRemove: () => helpers.clearField('workflowFilter'),
                        },
                    ];
                },
                getClearValue: () => '',
            } satisfies GenericFilterField<JobFilterValues>,
            {
                key: 'tagFilter',
                label: 'Tags',
                type: 'custom',
                visibility: 'advanced',
                renderControl: ({ value, onValueChange, id, disabled: ctxDisabled }) => (
                    <TagInput
                        id={id}
                        value={Array.isArray(value) ? (value as string[]) : []}
                        onChange={(tags) => onValueChange(tags)}
                        placeholder="Add tag…"
                        showHint={false}
                        className={ctxDisabled ? 'pointer-events-none opacity-50' : ''}
                    />
                ),
                isActive: (value) => Array.isArray(value) && (value as string[]).length > 0,
                getActiveBadges: (value, _values, helpers) => {
                    const tags = Array.isArray(value) ? (value as string[]) : [];
                    return tags.map((tag) => ({
                        key: `tag-${tag}`,
                        label: `Tag: ${tag}`,
                        onRemove: () =>
                            helpers.setValue(
                                'tagFilter',
                                tags.filter((t) => t !== tag),
                            ),
                    }));
                },
                getClearValue: () => [],
            } satisfies GenericFilterField<JobFilterValues>,
        ],
        [isLoadingWorkflows, workflows],
    );

    const visibleFields = hideFields?.length
        ? fields.filter((f) => !hideFields.includes(f.key as keyof JobFilterValues))
        : fields;

    return (
        <GenericFilterBar<JobFilterValues>
            fields={visibleFields}
            values={values}
            onChange={onChange}
            onClearAll={onClearAll}
            disabled={disabled}
            actions={actions}
        />
    );
}
