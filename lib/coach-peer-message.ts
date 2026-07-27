/** Stable participant ordering prevents duplicate A→B and B→A coach conversations. */
export function canonicalCoachConversationPair(
  firstCoachId: string,
  secondCoachId: string
): [string, string] {
  if (!firstCoachId || !secondCoachId) {
    throw new Error('Two coach ids are required');
  }
  if (firstCoachId === secondCoachId) {
    throw new Error('A coach cannot message themselves');
  }
  return [firstCoachId, secondCoachId].sort() as [string, string];
}
