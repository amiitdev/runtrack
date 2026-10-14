/**
 * Tiny bridge so the API client (a plain module, not a React component)
 * can attach the Clerk Bearer token without prop-drilling.
 *
 * The root layout registers Clerk's getToken() once on mount; every
 * request then calls getAuthToken() transparently.
 */
let getTokenFn: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (!getTokenFn) return null;
  try {
    return await getTokenFn();
  } catch {
    return null;
  }
}
