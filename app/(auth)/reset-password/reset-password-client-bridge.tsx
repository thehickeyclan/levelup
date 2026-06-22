'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import { PASSWORD_RESET_ERROR_MESSAGES } from '@/lib/password-recovery-redirect';
import { ResetPasswordForm } from './reset-password-form';
import { ResetPasswordInvalid } from './reset-password-invalid';

function parseRecoveryHash(): { access_token: string; refresh_token: string } | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

function ResetPasswordClientBridgeInner() {
  const tenant = useTenant();
  const searchParams = useSearchParams();
  const errorKey = searchParams.get('error');
  const codeParam = searchParams.get('code');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = createClient(tenant.slug);

    async function finishReady() {
      if (cancelled) return;
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setStatus('ready');
    }

    async function finishError(message: string) {
      if (cancelled) return;
      setErrorMessage(message);
      setStatus('error');
    }

    async function run() {
      try {
        if (codeParam) {
          const { data, error } = await client.auth.exchangeCodeForSession(codeParam);
          if (cancelled) return;
          if (error) {
            await finishError(
              error.message?.includes('code verifier') || /pkce/i.test(error.message)
                ? PASSWORD_RESET_ERROR_MESSAGES.pkce_browser
                : error.message || PASSWORD_RESET_ERROR_MESSAGES.exchange_failed
            );
            return;
          }
          if (data.session?.user) {
            await finishReady();
            return;
          }
        }

        const hashTokens = parseRecoveryHash();
        if (hashTokens) {
          const { data, error } = await client.auth.setSession(hashTokens);
          if (cancelled) return;
          if (error) {
            await finishError(error.message || PASSWORD_RESET_ERROR_MESSAGES.invalid_link);
            return;
          }
          if (data.session?.user) {
            await finishReady();
            return;
          }
        }

        for (let i = 0; i < 10; i++) {
          if (cancelled) return;
          const {
            data: { session },
          } = await client.auth.getSession();
          if (session?.user) {
            await finishReady();
            return;
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        if (errorKey) {
          await finishError(
            PASSWORD_RESET_ERROR_MESSAGES[errorKey] ??
              PASSWORD_RESET_ERROR_MESSAGES.invalid_link
          );
          return;
        }

        await finishError(PASSWORD_RESET_ERROR_MESSAGES.invalid_link);
      } catch {
        if (!cancelled) await finishError('Could not verify reset link.');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [tenant.slug, errorKey, codeParam]);

  if (status === 'loading') {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Verifying link…</p>
      </div>
    );
  }

  if (status === 'error') {
    return <ResetPasswordInvalid errorKey={errorKey} customMessage={errorMessage} />;
  }

  return <ResetPasswordForm />;
}

export function ResetPasswordClientBridge() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[50vh]">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <ResetPasswordClientBridgeInner />
    </Suspense>
  );
}
