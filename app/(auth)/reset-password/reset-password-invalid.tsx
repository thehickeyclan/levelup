import Link from 'next/link';
import { PASSWORD_RESET_ERROR_MESSAGES } from '@/lib/password-recovery-redirect';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ResetPasswordInvalid({
  errorKey,
  customMessage,
}: {
  errorKey?: string | null;
  customMessage?: string | null;
}) {
  const message =
    customMessage ||
    (errorKey && PASSWORD_RESET_ERROR_MESSAGES[errorKey]) ||
    PASSWORD_RESET_ERROR_MESSAGES.invalid_link;

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[50vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground font-serif">Link invalid</CardTitle>
          <CardDescription className="text-sm leading-relaxed">{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" asChild>
            <Link href="/forgot-password">Request a new reset link</Link>
          </Button>
          <div className="text-center text-sm">
            <Link href="/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
