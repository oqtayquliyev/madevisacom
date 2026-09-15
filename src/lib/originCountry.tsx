import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { allCountries } from '@/data/allCountries';
import { getStoredCountry, resolveCountry, setStoredCountry } from '@/lib/geolocation';

type OriginCountryContextValue = {
  countryCode: string | null;
  countryName: string | null;
  /** true while we're still checking the cookie / calling the IP lookup */
  loading: boolean;
  /** true if this came from IP auto-detection rather than a manual pick */
  isAutoDetected: boolean;
  setCountry: (code: string) => void;
};

const OriginCountryContext = createContext<OriginCountryContextValue | null>(null);

function nameFor(code: string | null): string | null {
  if (!code) return null;
  return allCountries.find((c) => c.code === code)?.name ?? code;
}

export function OriginCountryProvider({ children }: { children: ReactNode }) {
  const [countryCode, setCountryCode] = useState<string | null>(() => getStoredCountry());
  const [loading, setLoading] = useState(countryCode === null);
  const [isAutoDetected, setIsAutoDetected] = useState(false);

  useEffect(() => {
    if (countryCode) return; // already have a cookie value, nothing to resolve

    let cancelled = false;

    resolveCountry().then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setCountryCode(resolved);
        setIsAutoDetected(true);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCountry = (code: string) => {
    setCountryCode(code);
    setIsAutoDetected(false);
    setStoredCountry(code);
  };

  return (
    <OriginCountryContext.Provider
      value={{ countryCode, countryName: nameFor(countryCode), loading, isAutoDetected, setCountry }}
    >
      {children}
    </OriginCountryContext.Provider>
  );
}

export function useOriginCountry() {
  const ctx = useContext(OriginCountryContext);
  if (!ctx) throw new Error('useOriginCountry must be used within an OriginCountryProvider');
  return ctx;
}
