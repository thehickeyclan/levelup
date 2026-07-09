import { redirect } from 'next/navigation';

/** Legacy route — stats, reviews, and playbook live on Earnings now. */
export default function CoachDashboardPage() {
  redirect('/coach-earnings');
}
