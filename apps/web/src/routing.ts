export function getSafeReturnPath(value: string | null | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function getLoginRedirect(path: string): string {
  return `/login?returnTo=${encodeURIComponent(getSafeReturnPath(path))}`;
}
