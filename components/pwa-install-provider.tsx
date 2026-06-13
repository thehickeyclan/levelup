'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTenant } from '@/components/theme-provider';
import { detectPwaInstallContext, type PwaInstallContextInfo } from '@/lib/pwa-install-detect';
import { Smartphone, Copy, Check, X } from 'lucide-react';
import Image from 'next/image';

const BANNER_DISMISS_KEY = 'levelup_pwa_install_banner_v1';

type DeferredPrompt = { prompt: () => Promise<{ outcome: string }> };

type PwaInstallContextValue = {
  openDialog: () => void;
  showToolbarButton: boolean;
  /** Chrome / Edge fired beforeinstallprompt — real install button works */
  chromeInstallReady: boolean;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function usePwaInstall() {
  const v = useContext(PwaInstallContext);
  if (!v) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider');
  }
  return v;
}

export function usePwaInstallOptional(): PwaInstallContextValue | null {
  return useContext(PwaInstallContext);
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const productName = tenant.productName;

  const [ctx, setCtx] = useState<PwaInstallContextInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [installTried, setInstallTried] = useState(false);
  const [copied, setCopied] = useState(false);
  const [swRegistered, setSwRegistered] = useState(false);

  useEffect(() => {
    setCtx(detectPwaInstallContext());
  }, []);

  useEffect(() => {
    if (!swRegistered && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      setSwRegistered(true);
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [swRegistered]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as DeferredPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const chromeInstallReady = deferredPrompt !== null;

  const showToolbarButton = Boolean(
    ctx && !ctx.isStandalone && (ctx.isMobile || chromeInstallReady)
  );

  const openDialog = useCallback(() => setDialogOpen(true), []);

  const value = useMemo(
    () => ({
      openDialog,
      showToolbarButton,
      chromeInstallReady,
    }),
    [openDialog, showToolbarButton, chromeInstallReady]
  );

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    const { outcome } = await deferredPrompt.prompt();
    setDeferredPrompt(null);
    if (outcome === 'accepted') setInstallTried(true);
  }, [deferredPrompt]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <PwaInstallContext.Provider value={value}>
      {children}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(90vh,32rem)] overflow-y-auto sm:max-w-md">
          {!ctx ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <Image src="/apple-touch-icon.png" alt="" width={56} height={56} className="rounded-xl" />
            </div>
            <DialogTitle className="text-center">{`Add ${productName} to your home screen`}</DialogTitle>
            <DialogDescription className="text-center text-xs font-medium text-foreground/80 pt-1 space-y-1">
              <span className="block">{`This device: ${ctx.environmentLabel}`}</span>
              <span className="block text-muted-foreground font-normal">
                {`Not from the App Store — a free shortcut that opens full screen like an app.`}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm text-foreground">
            {deferredPrompt && (
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <p className="font-medium text-foreground">
                  {ctx.isMobile ? 'Install app (Chrome / Edge)' : 'Install as an app'}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {ctx.isAndroid
                    ? `${productName} can open like a normal app. Tap below, then confirm in the browser popup.`
                    : 'Your browser can install this site. Tap below and follow the prompt.'}
                </p>
                <Button
                  type="button"
                  className="w-full min-h-[44px] touch-manipulation bg-accent text-black hover:bg-accent-hover"
                  onClick={() => void handleInstallClick()}
                  disabled={installTried}
                >
                  {installTried
                    ? 'If you closed the popup, use the steps below.'
                    : `Install ${productName}`}
                </Button>
              </div>
            )}

            {ctx.isIOSInAppBrowser && (
              <div className="space-y-3 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-foreground">Step 1: Open in Safari</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {`You're in another app's browser. "Add to Home Screen" only works after you open this page in Safari.`}
                </p>
                <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed text-xs sm:text-sm">
                  <li>
                    Tap <strong className="text-foreground">⋯</strong> or <strong className="text-foreground">Share</strong>{' '}
                    in this app&apos;s toolbar.
                  </li>
                  <li>
                    Choose <strong className="text-foreground">Open in Safari</strong>
                    {` (or Open in Browser / Open in Chrome).`}
                  </li>
                  <li>
                    Come back to this screen and tap <strong className="text-foreground">Done</strong>, then use{' '}
                    <strong className="text-foreground">Share → Add to Home Screen</strong> in Safari.
                  </li>
                </ol>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-[44px] gap-2 touch-manipulation border-amber-600/50"
                  onClick={() => void handleCopyLink()}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      Copied — paste in Safari&apos;s address bar
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy link (if Safari won&apos;t open)
                    </>
                  )}
                </Button>
              </div>
            )}

            {ctx.isIOSSafari && (
              <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                <p className="text-sm font-semibold text-accent mb-2">Safari — 3 taps</p>
                <ol className="list-decimal pl-5 space-y-2.5 text-muted-foreground leading-relaxed text-xs sm:text-sm">
                  <li>
                    Tap <strong className="text-foreground">Share</strong>
                    <span className="text-foreground"> (square with arrow)</span> at the bottom.
                  </li>
                  <li>
                    Scroll if needed, then tap <strong className="text-foreground">Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong className="text-foreground">Add</strong>.
                  </li>
                </ol>
              </div>
            )}

            {ctx.isIOSOtherBrowser && (
              <div className="space-y-3">
                <p className="rounded-md bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-amber-950 dark:text-amber-100 text-xs leading-relaxed">
                  <strong className="text-foreground">Not Safari?</strong> On iPhone, only{' '}
                  <strong>Safari</strong> can add to the home screen. Copy the link, open Safari, paste, then Share → Add
                  to Home Screen.
                </p>
                <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed text-xs sm:text-sm">
                  <li>
                    Tap <strong className="text-foreground">Copy link</strong>.
                  </li>
                  <li>
                    Open <strong className="text-foreground">Safari</strong>.
                  </li>
                  <li>
                    Paste in the address bar, go, then <strong className="text-foreground">Share</strong> →{' '}
                    <strong className="text-foreground">Add to Home Screen</strong>.
                  </li>
                </ol>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-[44px] gap-2 touch-manipulation"
                  onClick={() => void handleCopyLink()}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      Copied — open Safari
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy link for Safari
                    </>
                  )}
                </Button>
              </div>
            )}

            {ctx.isAndroid && !deferredPrompt && (
              <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed text-xs sm:text-sm">
                <li>
                  Tap <strong className="text-foreground">⋮</strong> (menu) in Chrome.
                </li>
                <li>
                  Tap <strong className="text-foreground">Install app</strong> or{' '}
                  <strong className="text-foreground">Add to Home screen</strong>.
                </li>
                <li>Confirm.</li>
              </ol>
            )}

            {!ctx.isMobile && !deferredPrompt && (
              <p className="text-muted-foreground leading-relaxed text-xs sm:text-sm">
                In <strong className="text-foreground">Chrome</strong> or <strong className="text-foreground">Edge</strong>
                , use the install option in the address bar or menu. On Mac{' '}
                <strong className="text-foreground">Safari</strong>, try{' '}
                <strong className="text-foreground">File → Add to Dock</strong>.
              </p>
            )}
          </div>

          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px] touch-manipulation"
              onClick={() => setDialogOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PwaInstallContext.Provider>
  );
}

export function PwaInstallBanner() {
  const tenant = useTenant();
  const productName = tenant.productName;
  const opt = usePwaInstallOptional();
  const [bannerReady, setBannerReady] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerCtx, setBannerCtx] = useState<PwaInstallContextInfo | null>(null);

  useEffect(() => {
    setBannerCtx(detectPwaInstallContext());
    try {
      setBannerDismissed(sessionStorage.getItem(BANNER_DISMISS_KEY) === '1');
    } catch {
      setBannerDismissed(false);
    }
    setBannerReady(true);
  }, []);

  if (!bannerReady || !opt?.showToolbarButton || bannerDismissed) return null;

  const { openDialog, chromeInstallReady } = opt;

  const sub = chromeInstallReady
    ? 'Chrome / Edge: tap Install for the system prompt.'
    : bannerCtx?.isIOSInAppBrowser
      ? 'Opened from another app? Tap How — open in Safari first.'
      : bannerCtx?.isIOSOtherBrowser
        ? 'On iPhone, home screen shortcuts need Safari. Tap How.'
        : 'iPhone (Safari): Share → Add to Home Screen. Tap How.';

  return (
    <div
      className="border-b border-accent/40 bg-zinc-950 text-white px-3 py-2.5 md:hidden"
      role="region"
      aria-label="Install app"
    >
      <div className="container mx-auto flex items-center gap-2">
        <Smartphone className="h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight">{`Install ${productName}`}</p>
          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="sm"
            className="h-9 min-h-[44px] sm:min-h-0 px-3 text-xs font-semibold bg-accent text-black hover:bg-accent-hover touch-manipulation"
            onClick={openDialog}
          >
            {chromeInstallReady ? 'Install' : 'How'}
          </Button>
          <button
            type="button"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-zinc-500 hover:text-white hover:bg-white/10"
            aria-label="Dismiss install banner"
            onClick={() => {
              try {
                sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
              } catch {
                /* ignore */
              }
              setBannerDismissed(true);
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
