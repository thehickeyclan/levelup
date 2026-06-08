import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      sessionId, 
      youthWrestlerId, // Optional - if selecting existing wrestler
      wrestlerName, 
      parentName,
      parentEmail,
      parentPhone,
      amountPaid, 
      paymentMethod,
      tenantSlug = 'guild' 
    } = body;

    if (!sessionId || (!wrestlerName && !youthWrestlerId) || amountPaid === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient(tenantSlug);

    // Get the session to verify it exists and get coach info
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, athlete_id, current_participants, max_participants')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get current count (admins can override capacity for drop-ins)
    const current = session.current_participants ?? 0;

    // If youth wrestler ID provided, get their parent_id
    let parentId: string | null = null;
    if (youthWrestlerId) {
      const { data: wrestler } = await supabase
        .from('youth_wrestlers')
        .select('parent_id')
        .eq('id', youthWrestlerId)
        .single();
      parentId = wrestler?.parent_id || null;
    }
    
    // Insert the session participant - link to existing wrestler if provided
    const { error: insertError } = await supabase.from('session_participants').insert({
      session_id: sessionId,
      youth_wrestler_id: youthWrestlerId || null,
      parent_id: parentId,
      paid: true,
      amount_paid: amountPaid,
      payment_method: paymentMethod || 'cash',
      status: 'confirmed',
    });

    if (insertError) {
      console.error('Drop-in insert error:', insertError);
      return NextResponse.json({ error: 'Failed to record drop-in' }, { status: 500 });
    }

    // Update session participant count
    await supabase
      .from('sessions')
      .update({ 
        current_participants: current + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    // Store drop-in details in a separate table or notes
    // For now, we'll create a simple log entry
    // You could also add a 'drop_in_notes' column to session_participants
    
    console.log('Drop-in recorded:', { 
      sessionId, 
      wrestlerName, 
      parentName,
      parentEmail,
      parentPhone,
      amountPaid, 
      paymentMethod 
    });

    return NextResponse.json({ 
      success: true, 
      message: `Drop-in recorded: ${wrestlerName} - $${amountPaid} (${paymentMethod})` 
    });

  } catch (e) {
    const err = e as Error;
    console.error('Drop-in API error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
