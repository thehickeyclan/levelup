import { redirect } from 'next/navigation';
import { IN_APP_MESSAGING_ENABLED, MESSAGES_HOME_PATH } from '@/lib/in-app-messaging';

/** Legacy Community inbox → unified Messages. */
export default function InboxRedirect() {
  if (!IN_APP_MESSAGING_ENABLED) redirect('/dashboard');
  redirect(MESSAGES_HOME_PATH);
}
