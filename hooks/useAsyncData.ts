"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAsyncDataResult<T> {
  data: T | null;
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const hasDataRef = useRef(false);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
