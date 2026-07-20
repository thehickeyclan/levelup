'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/cart-context';

/** Keeps an active booking cart visible without spending a permanent bottom-nav slot. */
export function ParentHeaderCart() {
  const { count } = useCart();

  if (count === 0) return null;

  const countLabel = count > 9 ? '9+' : String(count);

  return (
    <Link
      href="/cart"
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
      aria-label={`View cart with ${count} ${count === 1 ? 'item' : 'items'}`}
      title="Cart"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden />
      <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-black ring-2 ring-primary">
        {countLabel}
      </span>
    </Link>
  );
}
