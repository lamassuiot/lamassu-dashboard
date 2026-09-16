import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  PreconditionRows,
  cleanPreconditionRows,
  emptyPreconditionRow,
  hasPreconditionErrors,
  preconditionKind,
  preconditionRowError,
  preconditionTargetLabel,
  preconditionTargetValue,
  preconditionWithKind,
} from './precondition-rows';
import type { CampaignPrecondition, ReusableSoftwareModule, UpdatePack } from '@/types/iot';

// What these cover, and why each matters:
//
//  - kind is asked FIRST and the second picker only ever lists that kind. The previous single
//    dropdown mixed sets and module keys under group headings, which hid the choice until the menu
//    was open; these assert the two lists never bleed into each other.
//  - a row's kind survives having no target yet. It is not a field on the wire — it is recovered
//    from which of the two mutually exclusive target fields is PRESENT — so an empty row switched to
//    "software module" has to keep showing the module picker rather than snapping back.
//  - switching kind drops the other kind's target. The backend rejects a rule carrying both, so a
//    row edited from a set to a module must not ship the abandoned set name.
//  - cleanPreconditionRows keeps module-targeted rules. They were previously filtered out by a
//    `required_pack_name &&` check, which silently dropped every module rule on submit.

const PACKS = [
  { id: 'p1', name: 'gateway-release', version: '2.0.0', group_id: 'g1' },
  { id: 'p2', name: 'sensor-release', version: '1.4.0', group_id: 'g2' },
  // Same NAME in another group / at another version: a rule names a set by that string alone, so
  // this must not become a second, indistinguishable option.
  { id: 'p3', name: 'gateway-release', version: '1.0.0', group_id: 'g2' },
] as unknown as UpdatePack[];

const MODULES = [
  { key: 'os:bootloader', type: 'os', name: 'bootloader', version: '2.1.0' },
  { key: 'application:agent', type: 'application', name: 'agent', version: '1.0.0' },
  // Same key at another version: the picker requires ONE option per key, since "os:bootloader at
  // >= X" means the same requirement whichever version row it came from.
  { key: 'os:bootloader', type: 'os', name: 'bootloader', version: '2.2.0' },
] as unknown as ReusableSoftwareModule[];

beforeAll(() => {
  // Radix Select probes these before opening; happy-dom implements neither.
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

function renderRows(rows: CampaignPrecondition[], onChange = vi.fn()) {
  const utils = render(
    <PreconditionRows
      rows={rows}
      onChange={onChange}
      candidatePacks={PACKS}
      candidateModules={MODULES}
      emptyText="None yet."
    />,
  );
  return { ...utils, onChange };
}

/** The row's second control — the one listing whichever kind is selected. */
function targetPicker() {
  return screen.getByRole('combobox');
}

/** Option labels currently offered by the open picker. */
function openOptions(): string[] {
  fireEvent.click(targetPicker());
  return screen.getAllByRole('option').map((o) => o.textContent?.trim() ?? '');
}

describe('precondition row kind', () => {
  it('reads a filled row from whichever target field carries a value', () => {
    expect(preconditionKind({ required_pack_name: 'gateway-release', min_version: '1.0.0' })).toBe('pack');
    expect(preconditionKind({ required_module_key: 'os:bootloader', min_version: '1.0.0' })).toBe('module');
  });

  it('keeps an EMPTY row on the kind it was switched to', () => {
    // The whole reason switching writes '' to one field and drops the other: with both merely blank
    // there would be nothing left to say which picker the row is showing.
    const blankModule = { ...emptyPreconditionRow(), ...preconditionWithKind('module') };
    expect(preconditionKind(blankModule)).toBe('module');
    expect(preconditionTargetValue(blankModule)).toBe('');

    const blankPack = { ...blankModule, ...preconditionWithKind('pack') };
    expect(preconditionKind(blankPack)).toBe('pack');
  });

  it('a new row defaults to requiring a distribution set', () => {
    expect(preconditionKind(emptyPreconditionRow())).toBe('pack');
  });

  it('switching kind discards the other kind’s target', () => {
    const switched = { required_pack_name: 'gateway-release', min_version: '2.0.0', ...preconditionWithKind('module') };
    expect(switched.required_pack_name).toBeUndefined();
    expect(preconditionTargetValue(switched)).toBe('');
  });
});

describe('precondition validation and payload', () => {
  it('names the kind the operator still has to pick', () => {
    expect(preconditionRowError({ required_pack_name: '', min_version: '1.0.0' }))
      .toBe('Pick the required distribution set.');
    expect(preconditionRowError({ required_module_key: '', min_version: '1.0.0' }))
      .toBe('Pick the required software module.');
  });

  it('treats a wholly blank row as an unfinished add, not an error', () => {
    expect(preconditionRowError(emptyPreconditionRow())).toBeNull();
    expect(hasPreconditionErrors([emptyPreconditionRow()])).toBe(false);
  });

  it('requires a semver min version once a target is picked', () => {
    expect(preconditionRowError({ required_pack_name: 'gateway-release', min_version: '' }))
      .toBe('Min version is required.');
    expect(preconditionRowError({ required_module_key: 'os:bootloader', min_version: '2.1' }))
      .toBe('Use semver format (e.g. 1.2.0).');
    expect(preconditionRowError({ required_module_key: 'os:bootloader', min_version: '2.1.0' })).toBeNull();
  });

  it('submits module-targeted rules alongside set-targeted ones', () => {
    const cleaned = cleanPreconditionRows([
      { required_pack_name: 'gateway-release', min_version: ' 2.0.0 ' },
      { required_module_key: 'os:bootloader', min_version: '2.1.0' },
      emptyPreconditionRow(),
    ]);
    expect(cleaned).toEqual([
      { required_pack_name: 'gateway-release', min_version: '2.0.0' },
      { required_module_key: 'os:bootloader', min_version: '2.1.0' },
    ]);
    // Never both fields on one rule — the backend rejects that.
    for (const rule of cleaned) {
      expect(Boolean(rule.required_pack_name) && Boolean(rule.required_module_key)).toBe(false);
    }
  });

  it('labels whichever target a rule names', () => {
    expect(preconditionTargetLabel({ required_pack_name: 'gateway-release', min_version: '1.0.0' })).toBe('gateway-release');
    expect(preconditionTargetLabel({ required_module_key: 'os:bootloader', min_version: '1.0.0' })).toBe('os:bootloader');
  });
});

describe('PreconditionRows', () => {
  it('shows the empty text instead of a row when there is nothing declared', () => {
    renderRows([]);
    expect(screen.getByText('None yet.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('asks for the kind first, with distribution set selected for a new row', () => {
    renderRows([emptyPreconditionRow()]);
    expect(screen.getByRole('radio', { name: 'Distribution set' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'Software module' })).toHaveAttribute('data-state', 'off');
    expect(targetPicker()).toHaveTextContent('Select a distribution set');
  });

  it('offers ONLY distribution sets while that kind is selected', () => {
    renderRows([emptyPreconditionRow()]);
    expect(openOptions()).toEqual(['gateway-release', 'sensor-release']);
  });

  it('offers ONLY software modules, deduplicated by key, once switched', () => {
    renderRows([{ ...emptyPreconditionRow(), ...preconditionWithKind('module') }]);
    expect(screen.getByRole('radio', { name: 'Software module' })).toHaveAttribute('data-state', 'on');
    expect(targetPicker()).toHaveTextContent('Select a software module');
    expect(openOptions()).toEqual(['application:agent', 'os:bootloader']);
  });

  it('switching the kind clears the target already picked for the old kind', () => {
    const { onChange } = renderRows([{ required_pack_name: 'gateway-release', min_version: '2.0.0' }]);
    fireEvent.click(screen.getByRole('radio', { name: 'Software module' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0][0] as CampaignPrecondition[];
    expect(next.required_pack_name).toBeUndefined();
    expect(next.required_module_key).toBe('');
    // The version the operator already typed is theirs to keep — only the target was kind-specific.
    expect(next.min_version).toBe('2.0.0');
  });

  it('writes a picked module to the module field only', () => {
    const { onChange } = renderRows([{ ...emptyPreconditionRow(), ...preconditionWithKind('module') }]);
    fireEvent.click(targetPicker());
    fireEvent.click(screen.getByRole('option', { name: 'os:bootloader' }));
    const [next] = onChange.mock.calls[0][0] as CampaignPrecondition[];
    expect(next).toMatchObject({ required_module_key: 'os:bootloader' });
    expect(next.required_pack_name).toBeUndefined();
  });

  it('renders a stored module rule on the module kind, showing its key', () => {
    renderRows([{ required_module_key: 'os:bootloader', min_version: '2.1.0' }]);
    expect(screen.getByRole('radio', { name: 'Software module' })).toHaveAttribute('data-state', 'on');
    expect(targetPicker()).toHaveTextContent('os:bootloader');
    expect(screen.getByDisplayValue('2.1.0')).toBeInTheDocument();
  });

  it('still offers a stored target that has since left the list', () => {
    renderRows([{ required_pack_name: 'retired-release', min_version: '1.0.0' }]);
    // Rendered rather than silently blank — a blank row would lose the value on the next save.
    expect(targetPicker()).toHaveTextContent('retired-release');
    expect(openOptions()).toContain('retired-release');
  });

  it('offers a set name once, however many rows carry it', () => {
    renderRows([emptyPreconditionRow()]);
    expect(openOptions()).toEqual(['gateway-release', 'sensor-release']);
  });

  it('says "Loading…" while the sets are still being fetched, and stays enabled', () => {
    // null means in-flight; [] means "fetched, nothing there". Collapsing the two is what painted a
    // disabled "No distribution sets yet" over a fleet that had plenty.
    render(
      <PreconditionRows
        rows={[emptyPreconditionRow()]}
        onChange={vi.fn()}
        candidatePacks={null}
        candidateModules={MODULES}
        emptyText="None yet."
      />,
    );
    expect(targetPicker()).toHaveTextContent('Loading…');
  });

  it('says so when the chosen kind has nothing to offer', () => {
    render(
      <PreconditionRows
        rows={[{ ...emptyPreconditionRow(), ...preconditionWithKind('module') }]}
        onChange={vi.fn()}
        candidatePacks={PACKS}
        candidateModules={[]}
        emptyText="None yet."
      />,
    );
    expect(targetPicker()).toHaveTextContent('No software modules yet');
    expect(targetPicker()).toBeDisabled();
  });

  it('removes the row it is asked to remove, keeping the others', () => {
    const rows: CampaignPrecondition[] = [
      { required_pack_name: 'gateway-release', min_version: '2.0.0' },
      { required_module_key: 'os:bootloader', min_version: '2.1.0' },
    ];
    const onChange = vi.fn();
    render(
      <PreconditionRows
        rows={rows}
        onChange={onChange}
        candidatePacks={PACKS}
        candidateModules={MODULES}
        emptyText="None yet."
      />,
    );
    fireEvent.click(screen.getAllByTitle('Remove this requirement')[0]);
    expect(onChange).toHaveBeenCalledWith([rows[1]]);
  });

  it('labels the set being edited as the upgrade path, only in the set list', () => {
    render(
      <PreconditionRows
        rows={[emptyPreconditionRow()]}
        onChange={vi.fn()}
        candidatePacks={PACKS}
        candidateModules={MODULES}
        selfName="gateway-release"
        emptyText="None yet."
      />,
    );
    const options = openOptions();
    expect(options[0]).toContain('upgrade path');
    expect(options[1]).not.toContain('upgrade path');
  });

  it('flags the picker, not the version box, when only the target is missing', () => {
    renderRows([{ required_pack_name: '', min_version: '1.0.0' }]);
    expect(screen.getByText('Pick the required distribution set.')).toBeInTheDocument();
    // classList, not a substring of className: the input's base classes already mention
    // border-destructive inside an `aria-invalid:` variant, which a substring check would match.
    expect(targetPicker().classList.contains('border-destructive')).toBe(true);
    expect(screen.getByDisplayValue('1.0.0').classList.contains('border-destructive')).toBe(false);
  });
});
