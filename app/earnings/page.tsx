import { redirect } from 'next/navigation';

/** Marketing coach recruitment lives at /coaches; logged-in payout history is /coach-earnings. */
export default function EarningsPage() {
  redirect('/coaches');
}
