import Link from 'next/link';
import { ArrowRight, Download, Smartphone } from 'lucide-react';

const APP_STORE_URL = 'https://apps.apple.com/us/app/the-wrestling-guild/id6792125037';

export function AppStoreLaunchBanner() {
  return (
    <section className="border-y border-accent/35 bg-accent px-5 py-5 text-black">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black text-accent sm:flex">
            <Smartphone className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em]">We&apos;re live on iPhone</p>
            <h2 className="mt-1 font-serif text-xl font-black sm:text-2xl">The Wrestling Guild app is here.</h2>
            <p className="mt-1 text-sm text-black/70">Book training, run your coaching business, and shop Guild Market from your phone.</p>
          </div>
        </div>
        <Link
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-black px-6 text-sm font-bold text-accent transition hover:bg-zinc-900 sm:w-auto"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download now
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
