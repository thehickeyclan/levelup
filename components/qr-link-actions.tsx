'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, Download } from 'lucide-react';

export function QrLinkActions({
  targetUrl,
  qrDataUrl,
  downloadFileName = 'guild-qr.png',
}: {
  targetUrl: string;
  qrDataUrl: string;
  downloadFileName?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this URL:', targetUrl);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <Button type="button" variant="secondary" size="sm" className="gap-2" onClick={copyUrl}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button type="button" variant="outline" size="sm" className="gap-2" asChild>
        <a href={qrDataUrl} download={downloadFileName}>
          <Download className="h-4 w-4" />
          Download QR (PNG)
        </a>
      </Button>
    </div>
  );
}
