"use client";

import { useCallback, useEffect, useState } from "react";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

type UseDocumentLoaderOptions<T> = {
  enabled?: boolean;
  loader: () => Promise<T | null>;
  deps?: React.DependencyList;
};

type UseDocumentLoaderResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
};

export function useDocumentLoader<T>({
  enabled = true,
  loader,
  deps = [],
}: UseDocumentLoaderOptions<T>): UseDocumentLoaderResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const result = await loader();

      if (result === null) {
        setData(null);
        setNotFound(true);
        return;
      }

      setData(result);
    } catch (error: unknown) {
      setData(null);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [enabled, loader]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!enabled) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const result = await loader();

        if (!active) return;

        if (result === null) {
          setData(null);
          setNotFound(true);
          return;
        }

        setData(result);
      } catch (error: unknown) {
        if (!active) return;
        setData(null);
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [enabled, loader, ...deps]);

  return {
    data,
    loading,
    error,
    notFound,
    reload: load,
    setData,
  };
}