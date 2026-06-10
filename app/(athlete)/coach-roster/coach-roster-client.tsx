'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Copy, ExternalLink, Share2, Users } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { formatPhoneForSmsPaste } from '@/lib/phone';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import type { CoachRosterEntry, NextSessionShare } from '@/lib/coach-roster';

function pasteDisplay(e164: string | null): string {
  if (!e164) return '—';
  return formatPhoneForSmsPaste(e164);
}

function linesForCopy(texts: (string | null)[]): string {
  const parts = texts
    .filter((t): t is string => Boolean(t && t.trim()))
    .map((t) => formatPhoneForSmsPaste(t))
    .filter((line) => line.length > 0);
  return [...new Set(parts)].join('\r\n');
}

/** One row: parent # first, then kid # (if different). */
function rowPhonesParentFirst(e: CoachRosterEntry): string {
  const lines: string[] = [];
  if (e.parentPhone?.trim()) lines.push(formatPhoneForSmsPaste(e.parentPhone));
  if (e.kidPhone?.trim()) {
    const k = formatPhoneForSmsPaste(e.kidPhone);
    if (k && k !== lines[0]) lines.push(k);
  }
  return lines.join('\r\n');
}

/** Unique phones in roster order: every parent cell first, then every kid cell (skips duplicates). */
function linesForCopyParentsThenKids(entries: CoachRosterEntry[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  const push = (raw: string | null) => {
    if (!raw?.trim()) return;
    const fmt = formatPhoneForSmsPaste(raw);
    if (!fmt || seen.has(fmt)) return;
    seen.add(fmt);
    lines.push(fmt);
  };
  for (const e of entries) push(e.parentPhone);
  for (const e of entries) push(e.kidPhone);
  return lines.join('\r\n');
}

function lineCount(multiline: string): number {
  if (!multiline.trim()) return 0;
  return multiline.split(/\r?\n/).filter(Boolean).length;
}

/** Safe for TSV / Sheets paste — strip tabs and newlines inside a cell. */
function tsvCell(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
}

function buildRosterTsv(entries: CoachRosterEntry[], formatSessionDate: (iso: string) => string): string {
  const header = [
    'Parent name',
    'Wrestler',
    'Parent phone',
    'Kid phone',
    'Last session',
    'Sessions with you',
  ].join('\t');
  const lines = entries.map((e) => {
    const parentNm = tsvCell(
      [e.parentFirstName, e.parentLastName].filter(Boolean).join(' ').trim() || 'Parent'
    );
    const kidNm = tsvCell(
      [e.kidFirstName, e.kidLastName].filter(Boolean).join(' ').trim() || 'Wrestler'
    );
    const pPhone = e.parentPhone ? formatPhoneForSmsPaste(e.parentPhone) : '';
    const kPhone = e.kidPhone ? formatPhoneForSmsPaste(e.kidPhone) : '';
    return [
      parentNm,
      kidNm,
      pPhone,
      kPhone,
      tsvCell(formatSessionDate(e.lastSessionAt)),
      String(e.sessionCount),
    ].join('\t');
  });
  return [header, ...lines].join('\n');
}

export function CoachRosterClient({
  entries,
  nextSession,
}: {
  entries: CoachRosterEntry[];
  nextSession: NextSessionShare | null;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const flash = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const onCopy = async (key: string, text: string, emptyMessage = 'Nothing to copy.') => {
    if (!text.trim()) {
      window.alert(emptyMessage);
      return;
    }
    const ok = await copyTextToClipboard(text);
    if (!ok) window.alert('Could not copy. Try again or copy manually.');
    else flash(key);
  };

  const allParentPhones = linesForCopy(entries.map((e) => e.parentPhone));
  const allKidPhones = linesForCopy(entries.map((e) => e.kidPhone));
  const allPhonesParentsFirst = linesForCopyParentsThenKids(entries);
  const nParents = lineCount(allParentPhones);
  const nKids = lineCount(allKidPhones);
  const nAll = lineCount(allPhonesParentsFirst);

  const kidName = (e: CoachRosterEntry) =>
    [e.kidFirstName, e.kidLastName].filter(Boolean).join(' ').trim() || 'Wrestler';
  const parentName = (e: CoachRosterEntry) =>
    [e.parentFirstName, e.parentLastName].filter(Boolean).join(' ').trim() || 'Parent';

  const tsvBlob = buildRosterTsv(entries, (iso) => formatEST(new Date(iso), 'MMM d, yyyy'));

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm leading-relaxed">
        <span className="text-foreground font-medium">Every parent and wrestler</span> who has ever been on your session
        roster (private, partner, or group). Use copy buttons for weekly texts about new sessions — phones are one per
        line; the table paste works in Google Sheets or Excel.
      </p>

      {nextSession && (
        <Card className="border-accent/30 bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-4 w-4 text-accent" />
              Share your next session
            </CardTitle>
            <CardDescription>
              {formatEST(new Date(nextSession.scheduledDatetime), 'EEEE, MMM d · h:mm a')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] touch-manipulation"
              onClick={() => onCopy('reg', nextSession.registrationUrl, 'No link to copy.')}
            >
              {copiedKey === 'reg' ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />}
              {copiedKey === 'reg' ? 'Copied' : 'Copy registration link'}
            </Button>
            {nextSession.joinUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] touch-manipulation"
                onClick={() => onCopy('join', nextSession.joinUrl!, 'No link to copy.')}
              >
                {copiedKey === 'join' ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />}
                {copiedKey === 'join' ? 'Copied' : 'Copy join / invite link'}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation" asChild>
              <Link href={`/sessions/${nextSession.sessionId}`} prefetch={false}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Open session
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground uppercase tracking-wide">1 · Parent cells</p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            className="min-h-[44px] touch-manipulation bg-[#D4AF37] hover:bg-[#B8963C] text-black font-medium"
            disabled={!allParentPhones}
            onClick={() => onCopy('all-parents', allParentPhones, 'No parent numbers on file.')}
          >
            {copiedKey === 'all-parents' ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copiedKey === 'all-parents'
              ? 'Copied'
              : `Copy all parent #s${nParents ? ` (${nParents})` : ''}`}
          </Button>
        </div>
        <p className="text-xs font-medium text-foreground uppercase tracking-wide pt-1">2 · Kid / athlete cells</p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] touch-manipulation border-[#D4AF37]/50"
            disabled={!allKidPhones}
            onClick={() => onCopy('all-kids', allKidPhones, 'No kid / athlete numbers on file.')}
          >
            {copiedKey === 'all-kids' ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />}
            {copiedKey === 'all-kids'
              ? 'Copied'
              : `Copy all kid / athlete #s${nKids ? ` (${nKids})` : ''}`}
          </Button>
        </div>
        <p className="text-xs font-medium text-foreground uppercase tracking-wide pt-1">All in one (parents first, then kids)</p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] touch-manipulation"
            disabled={!allPhonesParentsFirst}
            onClick={() => onCopy('all', allPhonesParentsFirst, 'No phone numbers on file.')}
          >
            {copiedKey === 'all' ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />}
            {copiedKey === 'all'
              ? 'Copied'
              : `Copy every # (parents first)${nAll ? ` (${nAll})` : ''}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px] touch-manipulation text-muted-foreground"
            disabled={entries.length === 0}
            onClick={() => onCopy('tsv', tsvBlob, 'No roster rows yet.')}
          >
            {copiedKey === 'tsv' ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />}
            {copiedKey === 'tsv' ? 'Copied' : `Table for Sheets (names + #s)${entries.length ? ` (${entries.length} rows)` : ''}`}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Numbers come from what families saved in The Guild. Same cell twice only appears once. Paste into Messages{' '}
          <strong className="text-foreground/90">To</strong> — one number per line (not commas). The gold button is every
          parent number for weekly texts.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm space-y-2">
            <Users className="h-10 w-10 mx-auto opacity-50" />
            <p>No families yet. When parents book your sessions, they&apos;ll show up here.</p>
            <Link href="/coach-sessions/create" className="text-accent font-medium underline inline-block">
              Create a session
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const rowKey = e.youthWrestlerId;
            const rowCopy = rowPhonesParentFirst(e);
            return (
              <Card key={rowKey}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-foreground">{kidName(e)}</p>
                      <p className="text-sm text-muted-foreground">{parentName(e)}</p>
                      <p className="text-xs text-muted-foreground">
                        Last session: {formatEST(new Date(e.lastSessionAt), 'MMM d, yyyy')} · {e.sessionCount} session
                        {e.sessionCount !== 1 ? 's' : ''} with you
                      </p>
                      <div className="flex flex-col gap-1 text-sm pt-1">
                        <span className="font-medium text-foreground">
                          Parent: <span className="font-mono">{pasteDisplay(e.parentPhone)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Kid: <span className="font-mono text-foreground">{pasteDisplay(e.kidPhone)}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="min-h-[40px] touch-manipulation bg-[#D4AF37] hover:bg-[#B8963C] text-black"
                        disabled={!e.parentPhone}
                        onClick={() =>
                          onCopy(
                            `p-${rowKey}`,
                            e.parentPhone ? formatPhoneForSmsPaste(e.parentPhone) : '',
                            'No parent number on file.'
                          )
                        }
                      >
                        {copiedKey === `p-${rowKey}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        <span className="ml-1">Parent</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-[40px] touch-manipulation"
                        disabled={!e.kidPhone}
                        onClick={() =>
                          onCopy(`k-${rowKey}`, e.kidPhone ? formatPhoneForSmsPaste(e.kidPhone) : '', 'No kid number on file.')
                        }
                      >
                        {copiedKey === `k-${rowKey}` ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        <span className="ml-1">Kid</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="min-h-[40px] touch-manipulation"
                        disabled={!rowCopy}
                        onClick={() => onCopy(`r-${rowKey}`, rowCopy, 'No numbers on file for this row.')}
                      >
                        {copiedKey === `r-${rowKey}` ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        <span className="ml-1">Parent + kid</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
