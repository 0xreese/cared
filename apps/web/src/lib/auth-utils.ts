/**
 * Utility functions for authentication pages
 */

import { useSearchParams } from 'next/navigation'

/**
 * Gets the current redirectTo parameter from URL search params
 * @param searchParams - URL search parameters
 * @returns The redirectTo value or default path
 */
export function getRedirectTo(searchParams: URLSearchParams): string {
  return searchParams.get('redirectTo') ?? '/'
}

/**
 * Creates a URL with redirectTo parameter preserved
 * @param path - The target path
 * @param redirectTo - The redirectTo value to preserve
 * @returns URL string with redirectTo parameter
 */
export function createAuthUrl(path: string, redirectTo: string): string {
  if (redirectTo === '/') {
    return path
  }
  return `${path}?redirectTo=${encodeURIComponent(redirectTo)}`
}

/**
 * Hook to get redirectTo from current URL and create auth URLs
 * @returns Object with redirectTo value and helper functions
 */
export function useAuthRedirect() {
  const searchParams = useSearchParams()

  const redirectTo = getRedirectTo(searchParams)
  const fullRedirectTo =
    typeof window !== 'undefined' ? window.location.origin + redirectTo : redirectTo

  const createAuthUrlFromClient = (path: string): string => {
    return createAuthUrl(path, redirectTo)
  }

  return {
    redirectTo,
    fullRedirectTo,
    createAuthUrl: createAuthUrlFromClient,
  }
}
