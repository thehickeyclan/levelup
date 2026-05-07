import type { ReactNode } from 'react';
import { redirectIfMissingUserCellPhone } from '@/lib/require-user-cell-phone';

export default async function BookLayout({ children }: { children: ReactNode }) {
  await redirectIfMissingUserCellPhone();
  return <>{children}</>;
}
