'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type CoachHelpQuestionRow = {
  id: string;
  user_id: string;
  video_key: string;
  body: string;
  created_at: string;
  answer_text: string | null;
  answered_at: string | null;
  answered_by: string | null;
};

type Props = {
  videoKey: string;
  currentUserId: string;
  isAdmin: boolean;
  initialQuestions: CoachHelpQuestionRow[];
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function CoachHelpQuestions({ videoKey, currentUserId, isAdmin, initialQuestions }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [questions, setQuestions] = useState(initialQuestions);

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);

  function refreshList() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coach-help/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoKey, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not post question.');
        return;
      }
      if (data?.question) setQuestions((q) => [data.question as CoachHelpQuestionRow, ...q]);
      setBody('');
      refreshList();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAnswer(id: string, answerText: string) {
    setSavingAnswerId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/coach-help/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not save answer.');
        return;
      }
      if (data?.question) {
        const row = data.question as CoachHelpQuestionRow;
        setQuestions((qs) => qs.map((q) => (q.id === row.id ? row : q)));
      }
      refreshList();
    } finally {
      setSavingAnswerId(null);
    }
  }

  return (
    <div className="space-y-4 border-t border-border/60 pt-4 mt-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Questions</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Ask something about this tutorial. Other coaches can read the thread; an admin can reply when needed.
        </p>
      </div>

      <form onSubmit={onAsk} className="space-y-2">
        <Label htmlFor="coach-help-q">Your question</Label>
        <Textarea
          id="coach-help-q"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. On iPhone, where do I find “Add to Home Screen”?"
          rows={3}
          maxLength={5000}
          className="min-h-[88px] resize-y"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={submitting || !body.trim()} className="min-h-[44px]">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Post question
        </Button>
      </form>

      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet — you can be the first.</p>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <li key={q.id} className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="text-foreground whitespace-pre-wrap">{q.body}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {q.user_id === currentUserId ? 'You' : 'Coach'} · {formatDate(q.created_at)}
              </p>
              {q.answer_text ? (
                <div className="mt-3 rounded border border-accent/30 bg-background/80 p-3">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">Answer</p>
                  <p className="text-foreground whitespace-pre-wrap">{q.answer_text}</p>
                  {q.answered_at ? (
                    <p className="text-xs text-muted-foreground mt-2">{formatDate(q.answered_at)}</p>
                  ) : null}
                </div>
              ) : null}
              {isAdmin ? (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs" htmlFor={`ans-${q.id}`}>
                    {q.answer_text ? 'Update answer' : 'Reply (admin)'}
                  </Label>
                  <Textarea
                    id={`ans-${q.id}`}
                    rows={3}
                    value={answerDrafts[q.id] ?? q.answer_text ?? ''}
                    onChange={(e) => setAnswerDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder="Type an answer for coaches…"
                    className="min-h-[72px] text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[40px]"
                      disabled={savingAnswerId === q.id}
                      onClick={() =>
                        saveAnswer(q.id, (answerDrafts[q.id] ?? q.answer_text ?? '').trim())
                      }
                    >
                      {savingAnswerId === q.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      Save answer
                    </Button>
                    {q.answer_text ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-[40px]"
                        disabled={savingAnswerId === q.id}
                        onClick={() => {
                          setAnswerDrafts((d) => ({ ...d, [q.id]: '' }));
                          void saveAnswer(q.id, '');
                        }}
                      >
                        Clear answer
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
