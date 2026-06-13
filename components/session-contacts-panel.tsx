'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Cake, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContactInfoRow } from '@/components/contact-info-row';
import { SessionPhonesCopyButtons } from '@/components/session-phones-copy-buttons';
import { ageFromDob, formatBirthdayWithCountdown, isBirthdaySoon } from '@/lib/age-from-dob';
import { cn } from '@/lib/utils';

interface Contact {
  participantId: string;
  athlete: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    dateOfBirth: string | null;
    weightClass: string | null;
  } | null;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  } | null;
}

interface SessionContactsPanelProps {
  sessionId: string;
  participantCount?: number;
  className?: string;
}

export function SessionContactsPanel({ sessionId, participantCount = 0, className }: SessionContactsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    setContacts([]);
    setFetched(false);
    setExpanded(false);
  }, [sessionId]);

  useEffect(() => {
    if (expanded && !fetched) {
      setLoading(true);
      fetch(`/api/sessions/${sessionId}/contacts`)
        .then((res) => res.json())
        .then((data) => {
          setContacts(data.contacts ?? []);
          setFetched(true);
        })
        .catch(() => {
          setContacts([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [expanded, fetched, sessionId]);

  const displayCount = Math.max(participantCount, contacts.length);

  if (displayCount === 0 && !expanded) {
    return null;
  }

  return (
    <div className={cn('border-t border-border mt-3 pt-3', className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="w-full justify-between text-muted-foreground hover:text-foreground h-8 px-2"
      >
        <span className="text-sm">
          {displayCount} registered — {expanded ? 'Hide' : 'Show'} contact info
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {expanded && (
        <div className="mt-2 space-y-4">
          <SessionPhonesCopyButtons sessionId={sessionId} />
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No contact info available</p>
          ) : (
            contacts.map((contact) => {
              const athlete = contact.athlete;
              const parent = contact.parent;
              const age = athlete?.dateOfBirth ? ageFromDob(athlete.dateOfBirth) : null;
              const birthdayDisplay = athlete?.dateOfBirth ? formatBirthdayWithCountdown(athlete.dateOfBirth) : null;
              const birthdaySoon = athlete?.dateOfBirth ? isBirthdaySoon(athlete.dateOfBirth, 7) : false;

              return (
                <div key={contact.participantId} className="bg-muted/50 rounded-lg p-3 space-y-1">
                  {athlete && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {athlete.firstName} {athlete.lastName}
                          {age !== null && (
                            <span className="text-muted-foreground font-normal ml-1">
                              ({age}y{athlete.weightClass ? ` · ${athlete.weightClass}` : ''})
                            </span>
                          )}
                        </span>
                      </div>
                      {birthdayDisplay && (
                        <div
                          className={cn(
                            'flex items-center gap-1.5 text-xs',
                            birthdaySoon ? 'text-accent font-medium' : 'text-muted-foreground'
                          )}
                        >
                          <Cake className="h-3 w-3" />
                          {birthdayDisplay}
                        </div>
                      )}
                    </>
                  )}

                  {parent && parent.phone && (
                    <ContactInfoRow
                      label="Parent"
                      name={`${parent.firstName} ${parent.lastName}`}
                      phone={parent.phone}
                    />
                  )}

                  {athlete?.phone && <ContactInfoRow label="Athlete" phone={athlete.phone} />}

                  {parent?.phone && athlete?.phone && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      Prefer texting the parent for scheduling and rebooks when both numbers are listed.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
