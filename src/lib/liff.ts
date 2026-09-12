let liffInstance: any = null;
let liffInitialized = false;
let initPromise: Promise<boolean> | null = null;

const CACHE_KEY = 'puijai_cached_liff_profile';

export interface LiffUserProfile {
  userId?: string;
  displayName?: string;
  pictureUrl?: string;
  statusMessage?: string;
}

/**
 * Dynamically import LIFF SDK only when needed
 */
async function getLiffInstance(): Promise<any> {
  if (liffInstance) return liffInstance;
  try {
    const mod = await import('@line/liff');
    liffInstance = mod.default || mod;
    return liffInstance;
  } catch (e) {
    console.warn('[LIFF] Failed to load @line/liff dynamically:', e);
    return null;
  }
}

/**
 * Retrieve cached profile immediately from LocalStorage (0ms)
 */
export function getCachedLiffProfile(): LiffUserProfile | null {
  // Check URL query parameters first (supports testing via ?userId=...&username=...)
  try {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const urlUserId = params.get('userId') || params.get('user_id');
      const urlUsername = params.get('username') || params.get('name') || params.get('displayName');
      const urlPicture = params.get('picture') || params.get('pictureUrl') || params.get('avatar');
      if (urlUserId || urlUsername) {
        return {
          userId: urlUserId || undefined,
          displayName: urlUsername || (urlUserId ? `User-${urlUserId.substring(0, 6)}` : undefined),
          pictureUrl: urlPicture || undefined,
        };
      }
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.displayName) {
        return parsed as LiffUserProfile;
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  return null;
}

/**
 * Save profile to LocalStorage cache
 */
export function saveCachedLiffProfile(profile: LiffUserProfile) {
  try {
    if (profile && profile.displayName) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    }
  } catch (e) {
    // Ignore localStorage errors
  }
}

/**
 * Initialize LINE LIFF SDK safely and lazily
 */
export async function initLiff(): Promise<boolean> {
  if (liffInitialized) return true;
  if (initPromise) return initPromise;

  const rawLiffId = (import.meta as any).env?.VITE_LIFF_ID || '2011043750-SsHmvV2G';
  const liffId = rawLiffId.replace(/^https?:\/\/liff\.line\.me\//, '').trim();

  if (!liffId) {
    return false;
  }

  initPromise = (async () => {
    try {
      const liff = await getLiffInstance();
      if (!liff) return false;

      // Filter out benign LIFF localhost endpoint mismatch warning during local dev
      const isLocalDev = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      if (isLocalDev) {
        const originalWarn = console.warn;
        console.warn = (...args: any[]) => {
          if (typeof args[0] === 'string' && (args[0].includes('liff.init()') || args[0].includes('endpoint URL'))) {
            return;
          }
          originalWarn.apply(console, args);
        };
        try {
          await liff.init({ liffId });
        } finally {
          console.warn = originalWarn;
        }
      } else {
        await liff.init({ liffId });
      }

      liffInitialized = true;
      return true;
    } catch (error) {
      console.warn('[LIFF] Init error (running in standard web environment):', error);
      liffInitialized = false;
      return false;
    }
  })();

  return initPromise;
}

// Pre-warm LIFF SDK asynchronously only when running inside LINE or idle
if (typeof window !== 'undefined') {
  const isLineOrLiff = 
    window.location.search.includes('liff') || 
    window.location.pathname.includes('liff') ||
    navigator.userAgent.includes('Line');

  if (isLineOrLiff) {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        initLiff().catch(() => {});
      });
    } else {
      setTimeout(() => {
        initLiff().catch(() => {});
      }, 500);
    }
  }
}

/**
 * Check if the app is currently running inside LINE App (LIFF Browser)
 */
export function isInLiffClient(): boolean {
  try {
    return liffInitialized && !!liffInstance?.isInClient?.();
  } catch {
    return false;
  }
}

/**
 * Ultra-fast profile fetcher:
 * 1. Immediately triggers onProfileCallback with cached profile if available (0ms)
 * 2. Reads synchronous Decoded ID Token upon LIFF init (sub-second without network lag)
 * 3. Fetches live LIFF profile in background and updates cache & callback if changed
 */
export async function getFastLiffProfile(
  onProfileCallback?: (profile: LiffUserProfile) => void
): Promise<LiffUserProfile | null> {
  // Phase 1: Instant cached profile
  const cached = getCachedLiffProfile();
  if (cached && onProfileCallback) {
    onProfileCallback(cached);
  }

  try {
    const initialized = await initLiff();
    if (!initialized || !liffInstance) return cached;

    if (liffInstance.isLoggedIn()) {
      // Phase 2: Instant decoded ID token
      try {
        const idToken: any = liffInstance.getDecodedIDToken();
        if (idToken && (idToken.name || idToken.picture)) {
          const fastProfile: LiffUserProfile = {
            userId: idToken.sub,
            displayName: idToken.name || cached?.displayName,
            pictureUrl: idToken.picture || cached?.pictureUrl,
          };
          saveCachedLiffProfile(fastProfile);
          if (onProfileCallback) {
            onProfileCallback(fastProfile);
          }
        }
      } catch (e) {}

      // Phase 3: Live API getProfile
      const liveProfile = await liffInstance.getProfile();
      const updatedProfile: LiffUserProfile = {
        userId: liveProfile.userId,
        displayName: liveProfile.displayName,
        pictureUrl: liveProfile.pictureUrl,
        statusMessage: liveProfile.statusMessage,
      };

      saveCachedLiffProfile(updatedProfile);
      if (onProfileCallback) {
        onProfileCallback(updatedProfile);
      }
      return updatedProfile;
    } else if (liffInstance.isInClient()) {
      liffInstance.login();
    }
  } catch (err) {
    console.warn('[LIFF] Fast profile resolution warning:', err);
  }

  return cached;
}

/**
 * Standard getProfile for backward compatibility
 */
export async function getLiffProfile(): Promise<LiffUserProfile | null> {
  return getFastLiffProfile();
}

/**
 * Send a summary notification message directly into LINE Chat via LIFF sendMessages
 */
export async function sendLiffSummaryMessage(cancellation: {
  id: string;
  username: string;
  category: string;
  reason: string;
  round?: number;
  notes?: string;
}): Promise<boolean> {
  try {
    const initialized = await initLiff();
    if (initialized && liffInstance && liffInstance.isInClient()) {
      await liffInstance.sendMessages([
        {
          type: 'text',
          text: `📋 [แจ้งเตือน: บันทึกขอยกเลิกสำเร็จ]\nรหัสอ้างอิงคำขอ: ${cancellation.id}\nหมวดหมู่: ${cancellation.category}\nเหตุผล: ${cancellation.reason}\n\nระบบได้รับคำขอยกเลิกและข้อเสนอแนะบริการ Puijai เรียบร้อยแล้ว ขอบคุณครับ 🙏`
        }
      ]);
      return true;
    }
  } catch (err) {
    console.warn('[LIFF] Could not send message to chat:', err);
  }
  return false;
}

/**
 * Close LIFF Window or return to LINE chat cleanly without sending any extra messages
 */
export function closeLiffWindow(): boolean {
  try {
    if (liffInstance && liffInstance.isInClient()) {
      liffInstance.closeWindow();
      return true;
    }
  } catch (e) {
    console.warn('[LIFF] Could not close LIFF window:', e);
  }

  // Fallback for regular browser: Close tab or go back
  try {
    if (window.opener) {
      window.close();
      return true;
    }
    if (window.history && window.history.length > 1) {
      window.history.back();
      return true;
    }
  } catch (e) {}

  // Fallback: Redirect to LINE Official Account Chat
  try {
    window.location.href = 'https://line.me/R/ti/p/@123xuwni';
  } catch (e) {}
  return false;
}

/**
 * Get the user's LINE App Version (e.g. "14.2.0") safely from LIFF or URL search params
 */
export function getLineAppVersion(url?: string): string | null {
  try {
    if (liffInitialized && liffInstance?.getLineVersion) {
      const ver = liffInstance.getLineVersion();
      if (ver) return ver;
    }
  } catch (e) {}

  try {
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    if (targetUrl) {
      const parsed = new URL(targetUrl, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
      return parsed.searchParams.get('lineAppVersion') || parsed.searchParams.get('line_version');
    }
  } catch (e) {}

  return null;
}

/**
 * Get full LIFF device and client context
 */
export function getLiffContext() {
  return {
    isInClient: isInLiffClient(),
    lineAppVersion: getLineAppVersion(),
    os: liffInitialized ? liffInstance?.getOS?.() : null,
    language: liffInitialized ? liffInstance?.getLanguage?.() : (typeof navigator !== 'undefined' ? navigator.language : 'th'),
    liffVersion: liffInitialized ? liffInstance?.getVersion?.() : null,
  };
}

/**
 * Get user's LINE ID Token for secure backend authentication & PDPA compliance verification
 */
export async function getLiffIdToken(): Promise<string | null> {
  try {
    const liff = await getLiffInstance();
    if (liff && liff.isLoggedIn()) {
      return liff.getIDToken() || null;
    }
  } catch (e) {
    console.warn('[LIFF] Failed to get ID token:', e);
  }
  return null;
}

