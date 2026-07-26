import { redirect } from 'next/navigation';

/** Preserve old athlete dashboard links while Training becomes the athlete home. */
export default function YouthDashboardPage() {
  redirect('/training');
}
