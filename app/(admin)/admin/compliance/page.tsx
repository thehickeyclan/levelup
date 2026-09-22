import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { getAccountFootprint } from '@/lib/account-deletion';
import {
  ComplianceClient,
  type DeletionRequestRow,
  type ContentReportRow,
  type ReportMessage,
} from './compliance-client';

export const dynamic = 'force-dynamic';

/**
 * Apple compliance queues: account deletion requests (App Store 5.1.1(v),
 * 30-day window) and content reports (App Store 1.2, 24-hour review SLA).
 */
export default async function AdminCompliancePage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);

  // ----- Account deletion requests -----
  let deletionTableMissing = false;
  const deletionRequests: DeletionRequestRow[] = [];
  const { data: requestRows, error: requestsError } = await admin
    .from('account_deletion_requests')
    .select('id, user_id, email, role, status, requested_at, completed_at, notes')
    .order('requested_at', { ascending: false })
    .limit(300);
  if (requestsError) {
    console.error('deletion requests fetch:', requestsError.message);
    deletionTableMissing = true;
  } else {
    const rows = (requestRows ?? []) as {
      id: string;
      user_id: string;
      email: string;
      role: string | null;
      status: string;
      requested_at: string;
      completed_at: string | null;
      notes: string | null;
    }[];
    const pendingIds = rows.filter((r) => r.status === 'pending').map((r) => r.user_id);
    const nameById = new Map<string, string>();
    const existsById = new Set<string>();
    if (pendingIds.length > 0) {
      const { data: users } = await admin
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', pendingIds);
      for (const u of users ?? []) {
        const row = u as { id: string; first_name?: string | null; last_name?: string | null };
        existsById.add(row.id);
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
        if (name) nameById.set(row.id, name);
      }
      const { data: athletes } = await admin
        .from('athletes')
        .select('id, first_name, last_name')
        .in('id', pendingIds);
      for (const a of athletes ?? []) {
        const row = a as { id: string; first_name?: string | null; last_name?: string | null };
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
        if (name) nameById.set(row.id, name);
      }
    }
    for (const r of rows) {
      const pending = r.status === 'pending';
      deletionRequests.push({
        ...r,
        display_name: nameById.get(r.user_id) ?? null,
        account_exists: pending ? existsById.has(r.user_id) : true,
        footprint: pending ? await getAccountFootprint(admin, r.user_id) : null,
      });
    }
  }

  // ----- Content reports -----
  let reportsTableMissing = false;
  const contentReports: ContentReportRow[] = [];
  const { data: reportRows, error: reportsError } = await admin
    .from('content_reports')
    .select('id, target_type, target_id, reason, is_block, reported_by, reporter_email, status, created_at, resolved_at, resolution_notes')
    .order('created_at', { ascending: false })
    .limit(300);
  if (reportsError) {
    console.error('content reports fetch:', reportsError.message);
    reportsTableMissing = true;
  } else {
    const reports = (reportRows ?? []) as {
      id: string;
      target_type: string;
      target_id: string;
      reason: string;
      is_block: boolean;
      reported_by: string | null;
      reporter_email: string;
      status: string;
      created_at: string;
      resolved_at: string | null;
      resolution_notes: string | null;
    }[];

    // Enrich open incidents (and blocks lightly) with target context.
    const enrich = reports.filter((r) => r.status === 'pending' && !r.is_block).slice(0, 30);

    const threadIdByReport = new Map<string, string>();
    const summaryByReport = new Map<string, string>();
    for (const r of enrich) {
      if (r.target_type === 'thread') threadIdByReport.set(r.id, r.target_id);
      if (r.target_type === 'message') {
        const { data: msg } = await admin
          .from('guild_messages')
          .select('thread_id, body')
          .eq('id', r.target_id)
          .maybeSingle();
        if (msg) {
          threadIdByReport.set(r.id, (msg as { thread_id: string }).thread_id);
          summaryByReport.set(r.id, `Reported message: “${(msg as { body: string }).body.slice(0, 140)}”`);
        } else {
          summaryByReport.set(r.id, 'Reported message no longer exists');
        }
      }
      if (r.target_type === 'listing') {
        const { data: listing } = await admin
          .from('market_listings')
          .select('title, brand, model, status')
          .eq('id', r.target_id)
          .maybeSingle();
        if (listing) {
          const l = listing as { title: string; brand: string; model: string; status: string };
          const label = l.title || [l.brand, l.model].filter(Boolean).join(' ') || 'untitled';
          summaryByReport.set(r.id, `Listing “${label}” (${l.status})`);
        } else {
          summaryByReport.set(r.id, 'Listing no longer exists');
        }
      }
      if (r.target_type === 'user') {
        const { data: target } = await admin
          .from('users')
          .select('email, first_name, last_name, role')
          .eq('id', r.target_id)
          .maybeSingle();
        if (target) {
          const t = target as { email: string; first_name?: string | null; last_name?: string | null; role: string };
          const name = [t.first_name, t.last_name].filter(Boolean).join(' ').trim();
          summaryByReport.set(r.id, `User ${name ? `${name} — ` : ''}${t.email} (${t.role})`);
        } else {
          summaryByReport.set(r.id, 'User no longer exists');
        }
      }
    }

    // Load thread messages for thread/message targets in one pass.
    const messagesByReport = new Map<string, ReportMessage[]>();
    const threadIds = [...new Set(threadIdByReport.values())];
    if (threadIds.length > 0) {
      const { data: msgRows } = await admin
        .from('guild_messages')
        .select('id, thread_id, sender_id, body, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true })
        .limit(400);
      const messages = (msgRows ?? []) as {
        id: string;
        thread_id: string;
        sender_id: string;
        body: string;
        created_at: string;
      }[];
      const senderIds = [...new Set(messages.map((m) => m.sender_id))];
      const senderLabel = new Map<string, string>();
      if (senderIds.length > 0) {
        const { data: senders } = await admin
          .from('users')
          .select('id, email, first_name, last_name')
          .in('id', senderIds);
        for (const s of senders ?? []) {
          const row = s as { id: string; email: string; first_name?: string | null; last_name?: string | null };
          const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
          senderLabel.set(row.id, name || row.email);
        }
      }
      const byThread = new Map<string, ReportMessage[]>();
      for (const m of messages) {
        const list = byThread.get(m.thread_id) ?? [];
        list.push({
          id: m.id,
          sender: senderLabel.get(m.sender_id) ?? m.sender_id.slice(0, 8),
          body: m.body,
          created_at: m.created_at,
        });
        byThread.set(m.thread_id, list);
      }
      for (const [reportId, threadId] of threadIdByReport) {
        const list = byThread.get(threadId) ?? [];
        messagesByReport.set(reportId, list.slice(-30));
        if (!summaryByReport.has(reportId)) {
          summaryByReport.set(
            reportId,
            list.length === 0 ? 'Thread is empty (likely an accidental tap)' : `Thread with ${list.length} message${list.length === 1 ? '' : 's'}`
          );
        }
      }
    }

    for (const r of reports) {
      contentReports.push({
        id: r.id,
        target_type: r.target_type,
        target_id: r.target_id,
        reason: r.reason,
        is_block: r.is_block,
        reporter: r.reporter_email || r.reported_by?.slice(0, 8) || 'unknown',
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        resolution_notes: r.resolution_notes,
        target_summary: summaryByReport.get(r.id) ?? null,
        messages: messagesByReport.get(r.id) ?? null,
      });
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground">App Compliance</h1>
        <p className="text-muted-foreground mt-1">
          Account deletion requests (30-day window) and content reports (24-hour review SLA).
        </p>
      </div>
      <ComplianceClient
        deletionRequests={deletionRequests}
        deletionTableMissing={deletionTableMissing}
        contentReports={contentReports}
        reportsTableMissing={reportsTableMissing}
      />
    </div>
  );
}
