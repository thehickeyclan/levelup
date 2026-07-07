'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import type {
  RawCampInvoiceLine,
  RawCampInvoiceSessionSummary,
} from '@/lib/school-invoices/raw-team-camp-july-2026';
import {
  RAW_CAMP_INVOICE,
  RAW_CAMP_EXPECTED_SESSIONS_MIN,
  RAW_CAMP_EXPECTED_SESSIONS_MAX,
  RAW_CAMP_EXPECTED_SPOTS_MIN,
  RAW_CAMP_EXPECTED_SPOTS_MAX,
} from '@/lib/school-invoices/raw-team-camp-july-2026';

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

type Props = {
  tenantLogo: string;
  invoiceDateLabel: string;
  dueDateLabel: string;
  lines: RawCampInvoiceLine[];
  sessionSummaries: RawCampInvoiceSessionSummary[];
  totalUsd: number;
};

export function RawJuly2026InvoiceView({
  tenantLogo,
  invoiceDateLabel,
  dueDateLabel,
  lines,
  sessionSummaries,
  totalUsd,
}: Props) {
  const spotCount = lines.length;
  const sessionCount = sessionSummaries.length;
  const pendingSatPmCoach =
    spotCount >= RAW_CAMP_EXPECTED_SPOTS_MIN && spotCount < RAW_CAMP_EXPECTED_SPOTS_MAX;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="print:hidden border-b border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin">← Admin</Link>
        </Button>
        <Button
          type="button"
          className="bg-[#B89D60] hover:bg-[#9A8550] text-black"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8 print:py-6 print:max-w-none print:px-8">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 border-b border-border pb-6 mb-8 print:pb-4 print:mb-6">
          <div className="flex items-start gap-5">
            <div className="relative h-16 w-40 shrink-0 print:h-14 print:w-36">
              <Image
                src={tenantLogo}
                alt={RAW_CAMP_INVOICE.billFromName}
                fill
                className="object-contain object-left"
                sizes="160px"
                priority
              />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {RAW_CAMP_INVOICE.billFromName}
              </p>
              <h1 className="text-3xl font-bold tracking-tight print:text-2xl">Invoice</h1>
              <p className="text-muted-foreground mt-1 text-sm">{RAW_CAMP_INVOICE.title}</p>
            </div>
          </div>
          <div className="text-sm space-y-1 sm:text-right shrink-0">
            <p>
              <span className="text-muted-foreground">Invoice #</span>{' '}
              <span className="font-semibold tabular-nums">{RAW_CAMP_INVOICE.number}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Invoice date</span>{' '}
              <span className="font-medium">{invoiceDateLabel}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Due date</span>{' '}
              <span className="font-medium">{dueDateLabel}</span>
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8 print:mb-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Bill from
            </p>
            <p className="font-semibold text-base">{RAW_CAMP_INVOICE.billFromName}</p>
            <p className="text-muted-foreground mt-1">{RAW_CAMP_INVOICE.billFromWebsite}</p>
            <p className="text-muted-foreground">{RAW_CAMP_INVOICE.billFromEmail}</p>
            <p className="text-muted-foreground">{RAW_CAMP_INVOICE.billFromPhone}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Bill to
            </p>
            <p className="font-semibold text-base">{RAW_CAMP_INVOICE.billToName}</p>
            <p className="text-muted-foreground">{RAW_CAMP_INVOICE.billToOrg}</p>
            <p className="text-muted-foreground mt-2">{RAW_CAMP_INVOICE.billToNote}</p>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm print:bg-transparent print:border print:rounded-none">
          <p className="font-medium">{RAW_CAMP_INVOICE.facilityName}</p>
          <p className="text-muted-foreground">{RAW_CAMP_INVOICE.facilityAddress}</p>
          <p className="text-muted-foreground mt-1">{RAW_CAMP_INVOICE.scheduleNote}</p>
        </section>

        {spotCount < RAW_CAMP_EXPECTED_SPOTS_MIN && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm print:hidden">
            Found {spotCount} athlete spots; expected at least {RAW_CAMP_EXPECTED_SPOTS_MIN}. Refresh
            after roster alignment.
          </div>
        )}

        {pendingSatPmCoach && (
          <div className="mb-6 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm print:hidden">
            Sat 4 PM coach session not rostered yet ({spotCount}/{RAW_CAMP_EXPECTED_SPOTS_MAX}{' '}
            spots). Invoice total will increase by $90 when Group B is added to that session.
          </div>
        )}

        {sessionCount < RAW_CAMP_EXPECTED_SESSIONS_MIN && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm print:hidden">
            Found {sessionCount} coach sessions; expected at least {RAW_CAMP_EXPECTED_SESSIONS_MIN}.
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden print:border print:rounded-none mb-8 print:mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="py-3 px-3 font-semibold">Description</th>
                <th className="py-3 px-3 font-semibold text-right w-16">Qty</th>
                <th className="py-3 px-3 font-semibold text-right w-28">Rate</th>
                <th className="py-3 px-3 font-semibold text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sessionSummaries.map((session) => (
                <tr key={session.sessionId} className="border-b border-border/80">
                  <td className="py-3 px-3">
                    <p className="font-medium">
                      Small group team training — {session.sessionDateLabel} at{' '}
                      {session.sessionTimeLabel}
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Coach {session.coachName} ·{' '}
                      {session.facilityName ?? RAW_CAMP_INVOICE.facilityName}
                    </p>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">{session.athleteCount}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{money(session.unitPriceUsd)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium">
                    {money(session.lineTotalUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td colSpan={3} className="py-3 px-3 text-right font-semibold">
                  Total due
                </td>
                <td className="py-3 px-3 text-right tabular-nums font-bold text-lg text-[#B89D60] print:text-base">
                  {money(totalUsd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded-lg border border-border overflow-hidden print:border print:rounded-none mb-8 print:mb-6">
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Session detail — athlete roster by day
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/80 text-left">
                <th className="py-2 px-3 font-semibold">Date</th>
                <th className="py-2 px-3 font-semibold">Athlete</th>
                <th className="py-2 px-3 font-semibold hidden sm:table-cell">Coach</th>
                <th className="py-2 px-3 font-semibold text-right">Fee</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 px-3 text-center text-muted-foreground">
                    No roster rows found for Jul 10–12. Run alignment scripts first.
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <tr
                    key={`${line.sessionId}-${line.email}`}
                    className="border-b border-border/60"
                  >
                    <td className="py-2 px-3 whitespace-nowrap">
                      {line.sessionDateLabel}
                      <span className="block text-xs text-muted-foreground">{line.sessionTimeLabel}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-medium">{line.wrestlerName}</span>
                      <span className="block text-xs text-muted-foreground sm:hidden">
                        {line.coachName}
                      </span>
                    </td>
                    <td className="py-2 px-3 hidden sm:table-cell text-muted-foreground">
                      {line.coachName}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{money(line.unitPriceUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="border-t border-border pt-6 text-sm space-y-3 print:pt-4">
          <div>
            <p className="font-semibold">{RAW_CAMP_INVOICE.paymentTerms}</p>
            <p className="text-muted-foreground mt-1">{RAW_CAMP_INVOICE.paymentInstructions}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Reference invoice {RAW_CAMP_INVOICE.number} on payment. Sessions remain marked unpaid in
            The Guild until payment is recorded.
          </p>
        </footer>
      </div>
    </div>
  );
}
