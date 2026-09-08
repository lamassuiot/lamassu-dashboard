import { describe, expect, it } from 'vitest';

import { parseModelJson } from './model-json';

describe('parseModelJson', () => {
  it('parses strict JSON', () => {
    expect(parseModelJson('{"type":"bar","data":[]}')).toEqual({
      data: [],
      type: 'bar',
    });
  });

  it.each([
    ["{type: 'bar', data: [],}", { data: [], type: 'bar' }],
    ['{/* chart */ type: "bar", data: []}', { data: [], type: 'bar' }],
    ["{assistant_response: 'Done', tool_calls: []}", {
      assistant_response: 'Done',
      tool_calls: [],
    }],
  ])('repairs common model JSON syntax: %s', (source, expected) => {
    expect(parseModelJson(source)).toEqual(expected);
  });

  it('does not evaluate JavaScript expressions', () => {
    expect(() => parseModelJson('{value: (() => 42)()}')).toThrow(
      'The model returned malformed structured data',
    );
  });
});
