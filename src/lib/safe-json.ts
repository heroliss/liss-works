/**
 * Serialize data safely for embedding inside HTML <script type="application/json">
 * or <script type="application/ld+json"> tags, preventing </script> breakout and
 * legacy JS line-separator hazards.
 */
export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
