/** Prefix local paths only; leave external destinations and in-page anchors intact. */
export function applyBase(value: string, base = '/'): string {
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  const prefix = `/${base.split('/').filter(Boolean).join('/')}`;
  if (prefix === '/' || value === prefix || value.startsWith(`${prefix}/`)) return value;
  return `${prefix}${value}`;
}

export function sitePath(value: string): string {
  return applyBase(value, import.meta.env?.BASE_URL ?? '/');
}

export const communityUrl = 'https://liss.pythonanywhere.com/';

export function projectTalkUrl(slug: string): string {
  return `${communityUrl}projects/${encodeURIComponent(slug)}/talk/`;
}
