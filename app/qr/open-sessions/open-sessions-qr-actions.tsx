import { QrLinkActions } from '@/components/qr-link-actions';

export function OpenSessionsQrActions({
  targetUrl,
  qrDataUrl,
}: {
  targetUrl: string;
  qrDataUrl: string;
}) {
  return (
    <QrLinkActions
      targetUrl={targetUrl}
      qrDataUrl={qrDataUrl}
      downloadFileName="guild-open-sessions-qr.png"
    />
  );
}
