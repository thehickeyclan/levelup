import { redirect } from 'next/navigation';

/** Legacy market messages URL → unified inbox. */
export default async function GuildMessagesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.thread ? `?thread=${encodeURIComponent(sp.thread)}` : '';
  redirect(`/messages${q}`);
}
