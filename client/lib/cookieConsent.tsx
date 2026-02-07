import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

export interface CookiePreferences {
  necessary: boolean; // always true
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

interface CookieConsentContextValue {
  preferences: CookiePreferences | null;
  hasConsented: boolean;
  acceptAll: () => void;
  rejectOptional: () => void;
  savePreferences: (prefs: Omit<CookiePreferences, "necessary">) => void;
  visitorId: string;
}

const STORAGE_KEY = "cookie_consent";
const CONSENT_EXPIRY_DAYS = 365;

function generateVisitorId(): string {
  return "v_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getVisitorId(): string {
  const stored = localStorage.getItem("visitor_id");
  if (stored) return stored;
  const id = generateVisitorId();
  localStorage.setItem("visitor_id", id);
  return id;
}

interface StoredConsent {
  preferences: CookiePreferences;
  timestamp: number;
}

function getStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: StoredConsent = JSON.parse(raw);
    const ageMs = Date.now() - data.timestamp;
    const maxAgeMs = CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function storeConsent(preferences: CookiePreferences) {
  const data: StoredConsent = { preferences, timestamp: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const visitorId = useRef(getVisitorId()).current;
  const [preferences, setPreferences] = useState<CookiePreferences | null>(() => {
    const stored = getStoredConsent();
    return stored ? stored.preferences : null;
  });

  const hasConsented = preferences !== null;

  const save = useCallback(
    (prefs: CookiePreferences) => {
      setPreferences(prefs);
      storeConsent(prefs);
    },
    []
  );

  const acceptAll = useCallback(() => {
    save({ necessary: true, functional: true, analytics: true, marketing: true });
  }, [save]);

  const rejectOptional = useCallback(() => {
    save({ necessary: true, functional: false, analytics: false, marketing: false });
  }, [save]);

  const savePreferences = useCallback(
    (prefs: Omit<CookiePreferences, "necessary">) => {
      save({ necessary: true, ...prefs });
    },
    [save]
  );

  return (
    <CookieConsentContext.Provider
      value={{ preferences, hasConsented, acceptAll, rejectOptional, savePreferences, visitorId }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error("useCookieConsent must be used within CookieConsentProvider");
  return ctx;
}

// Hook to conditionally load Yandex.Metrika
const YM_COUNTER_ID = "00000000"; // Replace with actual counter ID

export function useYandexMetrika() {
  const { preferences } = useCookieConsent();
  const loaded = useRef(false);

  useEffect(() => {
    if (!preferences?.analytics || loaded.current) return;

    // Load Yandex.Metrika script
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `
      (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
      (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
      ym(${YM_COUNTER_ID}, "init", {
        clickmap:true,
        trackLinks:true,
        accurateTrackBounce:true,
        webvisor:true
      });
    `;
    document.head.appendChild(script);
    loaded.current = true;

    return () => {
      // Cleanup is not strictly needed since Yandex.Metrika doesn't support unloading,
      // but we can remove the script tag
    };
  }, [preferences?.analytics]);

  // Return helper to manually disable if consent is revoked
  const isActive = preferences?.analytics ?? false;

  return { isActive };
}
