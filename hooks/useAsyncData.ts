"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAsyncDataResult<T> {
  data: T | null;
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseAsyncDataOptions {
  // Unique key to cache data across navigations (stale-while-revalidate).
  // If omitted, no cross-navigation caching is applied.
  cacheKey?: string;
  // How long (ms) the cached value is considered fresh. Default: 30 s.
  cacheTtl?: number;
}

// Module-level cache so data survives page navigations inside the SPA.
// Navigating away and back shows the cached value instantly, then revalidates.
const PAGE_CACHE = new Map<string, { data: unknown; expiresAt: number }>();
const DEFAULT_TTL_MS = 30_000;

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: UseAsyncDataOptions = {}
): UseAsyncDataResult<T> {
  const { cacheKey, cacheTtl = DEFAULT_TTL_MS } = options;

  const getStale = (): T | null => {
    if (!cacheKey) return null;
    const entry = PAGE_CACHE.get(cacheKey);
    return entry ? (entry.data as T) : null;
  };

  const isFresh = (): boolean => {
    if (!cacheKey) return false;
    const entry = PAGE_CACHE.get(cacheKey);
    return !!entry && entry.expiresAt > Date.now();
  };

  const [data, setData] = useState<T | null>(getStale);
  const [isLoading, setIsLoading] = useState(!getStale());
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const hasDataRef = useRef(!!getStale());

  const refetch = useCallback(() => {
    if (cacheKey) PAGE_CACHE.delete(cacheKey);
    setTick((t) => t + 1);
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // If data is fresh (within TTL) and we have it, skip the fetch
      if (isFresh() && hasDataRef.current) {
        setIsLoading(false);
        return;
      }

      const hasData = hasDataRef.current;
      if (!hasData) {
        setIsLoading(true);
      } else {
        setIsValidating(true);
      }
      setError(null);

      try {
        const result = await fetcher();
        if (!cancelled) {
          setData(result);
          hasDataRef.current = true;
          if (cacheKey) {
            PAGE_CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + cacheTtl });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
          if (!hasData) setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, isLoading, isValidating, error, refetch };
}
