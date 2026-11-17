import { describe, expect, it } from 'vitest';
import { buildCaptionIndex, matchCaption, captionTokens } from './ig-caption-match';
import { getIgPriceHistory, igHistoryPromptLines } from './ig-price-history';

const rows = [
  { id: '1', brand: 'Asics', model: 'Medalist', model_aliases: [] },
  { id: '2', brand: 'Adidas', model: 'Combat Speed', model_aliases: [] },
  { id: '3', brand: 'Adidas', model: 'Combat Speed 4', model_aliases: ['Combat Speed IV'] },
  { id: '4', brand: 'Cronin', model: 'Combat Speed', model_aliases: [] },
  { id: '5', brand: 'Asics', model: 'Rulon', model_aliases: [] },
  { id: '6', brand: 'Asics', model: 'EX-EO', model_aliases: [] },
  { id: '7', brand: 'Nike', model: 'Inflict 3', model_aliases: [] },
  { id: '8', brand: 'Asics', model: 'Cael V3.0', model_aliases: [] },
  { id: '9', brand: 'Asics', model: 'Dan Gable Ultimate', model_aliases: ['Gable Ultimate (IG)'] },
  { id: '10', brand: 'Asics', model: 'Dave Schultz', model_aliases: ['Asics Dave Schultz'] },
  { id: '11', brand: 'Asics', model: 'Aggressor', model_aliases: [] },
];
const index = buildCaptionIndex(rows, {
  'Gable Ultimate': { brand: 'Asics', model: 'Dan Gable Ultimate' },
});

describe('captionTokens', () => {
  it('folds version dots so V3.0 matches V3', () => {
    expect(captionTokens('Cael V3.0')).toEqual(['cael', 'v3']);
  });
});

describe('matchCaption', () => {
  it('tolerates plural model names', () => {
    expect(matchCaption('ASICS Medalists (2000)', index)?.row.id).toBe('1');
    expect(matchCaption('Asics Rulons size 9', index)?.row.id).toBe('5');
  });

  it('prefers the longest name: Combat Speed 4 over Combat Speed', () => {
    expect(matchCaption('Adidas OG Combat Speed 4 Red/Black', index)?.row.id).toBe('3');
  });

  it('matches roman-numeral aliases', () => {
    expect(matchCaption('Adidas Combat Speed IV (2016)', index)?.row.id).toBe('3');
  });

  it('uses brand words to split same-named models across brands', () => {
    expect(matchCaption('Cronin Combat Speed re-make', index)?.row.id).toBe('4');
    expect(matchCaption('Adidas Combat Speeds size 10', index)?.row.id).toBe('2');
  });

  it('drops captions naming a numbered sibling we did not match', () => {
    // No "Inflict 4" row in this index — never bucket it under Inflict 3.
    expect(matchCaption('Nike Inflict 4 (2020)', index)).toBeNull();
    // A trailing year is not a sibling number.
    expect(matchCaption('NEW ASICS Aggressor (2017)', index)?.row.id).toBe('11');
  });

  it('matches collapsed spellings like EXEO for EX-EO', () => {
    expect(matchCaption('Asics EXEO Tokyo (2020)', index)?.row.id).toBe('6');
  });

  it('matches version numbers without the trailing .0', () => {
    expect(matchCaption('Asics Cael V3 (2007)', index)?.row.id).toBe('8');
  });

  it('applies extra aliases for caption-only spellings', () => {
    expect(matchCaption('ASICS Gable Ultimates (2012)', index)?.row.id).toBe('9');
  });

  it('returns null when two catalog rows tie', () => {
    // "Asics Dave Schultz" is an alias on two rows in prod (EX-EO sellers use
    // it too) — a tie must drop, never pick a side.
    const ambiguous = buildCaptionIndex([
      ...rows,
      { id: '12', brand: 'Asics', model: 'Silver Series', model_aliases: ['Asics Dave Schultz'] },
    ]);
    expect(matchCaption('Asics Dave Schultz (2014)', ambiguous)).toBeNull();
  });
});

describe('ig-price-history runtime lookup', () => {
  it('finds a model present in the generated ledger', () => {
    const h = getIgPriceHistory('Adidas', 'Combat Speed 4');
    expect(h).not.toBeNull();
    expect(h!.priced).toBeGreaterThan(50);
    expect(h!.median_usd).toBeGreaterThan(100);
  });

  it('returns null, and no prompt lines, for unknown models', () => {
    expect(getIgPriceHistory('Nike', 'Not A Shoe')).toBeNull();
    expect(igHistoryPromptLines(null)).toEqual([]);
  });

  it('labels the prompt lines as a secondary signal', () => {
    const lines = igHistoryPromptLines(getIgPriceHistory('Asics', 'Rulon'));
    expect(lines[0]).toContain('secondary signal');
    expect(lines[0]).toContain('eBay sold comps govern');
  });
});
