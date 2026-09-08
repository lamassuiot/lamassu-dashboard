import JSON5 from 'json5';

/**
 * Parses structured model output without executing it.
 *
 * Models, especially smaller local ones, occasionally emit JSON-shaped output
 * with single-quoted strings, unquoted property names, comments, or trailing
 * commas. JSON5 accepts those harmless syntax variations; callers must still
 * validate the returned value against their own schema.
 */
export function parseModelJson<T = unknown>(source: string): T {
  const candidate = source.trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      return JSON5.parse(candidate) as T;
    } catch (error) {
      throw new SyntaxError(
        'The model returned malformed structured data. Please retry the request.',
        { cause: error },
      );
    }
  }
}
