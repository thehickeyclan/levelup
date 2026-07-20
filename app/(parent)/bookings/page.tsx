import { redirect } from 'next/navigation';

export const metadata = { title: 'My training' };

export default function MyBookingsPage() {
  redirect('/training?tab=mine');
}
