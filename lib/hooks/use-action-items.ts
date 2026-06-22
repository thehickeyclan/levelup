'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import { safeRealtimeSubscribe } from '@/lib/supabase/realtime-safe';

export interface ActionItem {
  id: string;
  workspace_id: string;
  content: string;
  description: string | null;
  status: 'pending' | 'completed';
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useActionItems(workspaceId: string) {
  const tenant = useTenant();
  const supabase = useMemo(() => createClient(tenant.slug), [tenant.slug]);

  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    let isMounted = true;

    async function fetchItems() {
      try {
        const { data, error } = await supabase
          .from('workspace_actions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (isMounted) setItems((data || []) as ActionItem[]);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err : new Error('Failed to load action items'));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchItems();

    const channel = safeRealtimeSubscribe(supabase, `workspace_actions:${workspaceId}`, (ch) =>
      ch.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_actions',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => fetchItems()
      )
    );

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [workspaceId, supabase]);

  return { items, loading, error };
}
