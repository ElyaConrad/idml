import type * as Template from './serial-types';

/**
 * Encoders for Bluepic Serial `Value`s. Every Serial property is an expression
 * string ({ type:'expression', value }). These match the conventions seen in
 * real serials: numbers as bare strings ("50"), strings/colors/enums in
 * backticks ("`#B92808FF`"), arrays as "[0, 0]", and object literals (image
 * value, rich-text runs) as JS-literal source with backtick strings.
 */

export type V = Template.Value;

/** Wrap a raw expression source string. */
export function exprRaw(value: string): V {
  return { type: 'expression', value };
}

export function num(n: number): V {
  // Avoid scientific notation / NaN leaking into the expression source.
  return exprRaw(Number.isFinite(n) ? String(n) : '0');
}

export function bool(b: boolean): V {
  return exprRaw(b ? 'true' : 'false');
}

function escapeBacktickString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

export function str(s: string): V {
  return exprRaw('`' + escapeBacktickString(s) + '`');
}

export function numArray(arr: number[]): V {
  return exprRaw('[' + arr.map((n) => (Number.isFinite(n) ? String(n) : '0')).join(', ') + ']');
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Encode an arbitrary JS value as expression source (recursive). Used for the
 * image value object and rich-text run arrays. Strings become backtick
 * literals so they survive the expression evaluator.
 */
export function literal(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return '`' + escapeBacktickString(value) + '`';
  if (Array.isArray(value)) return '[' + value.map((v) => literal(v)).join(', ') + ']';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
      const key = IDENTIFIER.test(k) ? k : '`' + escapeBacktickString(k) + '`';
      return `${key}: ${literal(v)}`;
    });
    return '{ ' + entries.join(', ') + ' }';
  }
  return 'null';
}

/** Encode an object/array literal as a Value. */
export function obj(value: unknown): V {
  return exprRaw(literal(value));
}
