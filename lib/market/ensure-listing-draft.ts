/**
 * Prevents parallel draft POSTs (multi-photo pick / double-tap) from creating
 * orphan listings while photos upload to a different listing id.
 */
export function createListingDraftEnsurer(options: {
  getListingId: () => string | null;
  setListingId: (id: string) => void;
  createDraft: () => Promise<string>;
}): () => Promise<string> {
  let inflight: Promise<string> | null = null;

  return async function ensureListingDraft(): Promise<string> {
    const existing = options.getListingId();
    if (existing) return existing;

    if (!inflight) {
      inflight = options.createDraft().then((id) => {
        options.setListingId(id);
        return id;
      });
    }

    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };
}
