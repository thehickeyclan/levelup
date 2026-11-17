import { describe, expect, it } from 'vitest';
import { classifyListingFiling, comparePhotoIdentification } from './filing-check';

const catalog = [
  { brand: 'Adidas', model: 'Combat Speed', model_aliases: [] },
  { brand: 'Adidas', model: 'Combat Speed 4', model_aliases: ['Combat Speed IV'] },
  { brand: 'Cronin', model: 'Combat Speed', model_aliases: [] },
  { brand: 'Asics', model: 'Dan Gable Ultimate', model_aliases: ['DGU'] },
  { brand: 'Asics', model: 'Dan Gable Classic', model_aliases: [] },
  { brand: 'Asics', model: 'Dave Schultz', model_aliases: ['Asics Dave Schultz'] },
  { brand: 'Asics', model: 'Silver Series', model_aliases: ['Asics Dave Schultz'] },
  { brand: 'Nike', model: 'Speedsweep VII', model_aliases: ['Split Sol'] },
];

describe('classifyListingFiling', () => {
  it('accepts an exact catalog filing as canonical', () => {
    expect(classifyListingFiling('Asics', 'Dan Gable Classic', catalog)).toEqual({
      status: 'canonical',
    });
    expect(classifyListingFiling('adidas', 'combat speed 4', catalog)).toEqual({
      status: 'canonical',
    });
  });

  it('maps a legacy alias to its canonical row', () => {
    expect(classifyListingFiling('Adidas', 'Combat Speed IV', catalog)).toEqual({
      status: 'legacy_alias',
      refileTo: { brand: 'Adidas', model: 'Combat Speed 4' },
    });
  });

  it('corrects a generic brand through the alias', () => {
    // Legacy listings filed under "Other" with a pre-merge model name.
    expect(classifyListingFiling('Other', 'Split Sol', catalog)).toEqual({
      status: 'legacy_alias',
      refileTo: { brand: 'Nike', model: 'Speedsweep VII' },
    });
  });

  it('declares an alias on two rows ambiguous — never picks a side', () => {
    const r = classifyListingFiling('Asics', 'Asics Dave Schultz', catalog);
    expect(r.status).toBe('ambiguous_alias');
    if (r.status === 'ambiguous_alias') {
      expect(r.candidates).toHaveLength(2);
    }
  });

  it('uses the filed brand to split same-named models across brands', () => {
    expect(classifyListingFiling('Cronin', 'Combat Speed', catalog)).toEqual({
      status: 'canonical',
    });
  });

  it('flags a real-brand conflict instead of refiling across brands', () => {
    const r = classifyListingFiling('Adidas', 'Dan Gable Ultimate', catalog);
    expect(r.status).toBe('ambiguous_alias');
  });

  it('never upgrades by containment — decorated names stay unfiled', () => {
    // "Combat Speed (Vintage West Germany)" must not silently become the
    // bare Combat Speed row, or worse a generation (standards §1.5).
    expect(
      classifyListingFiling('Adidas', 'Combat Speed (Vintage West Germany)', catalog)
    ).toEqual({ status: 'unfiled' });
  });
});

describe('comparePhotoIdentification', () => {
  const filed = { brand: 'Asics', model: 'Dan Gable Ultimate' };

  it('low confidence is not evidence either way', () => {
    const r = comparePhotoIdentification({
      filed,
      filedCatalogId: 'row-1',
      photo: { brand: 'Asics', model: 'Dan Gable Classic', confidence: 0.4 },
      photoCatalogId: 'row-2',
    });
    expect(r.verdict).toBe('inconclusive');
  });

  it('catalog row identity decides when both sides have one', () => {
    expect(
      comparePhotoIdentification({
        filed,
        filedCatalogId: 'row-1',
        photo: { brand: 'Asics', model: 'Gable Ultimate', confidence: 0.9 },
        photoCatalogId: 'row-1',
      }).verdict
    ).toBe('agrees');
    expect(
      comparePhotoIdentification({
        filed,
        filedCatalogId: 'row-1',
        photo: { brand: 'Asics', model: 'Dan Gable Classic', confidence: 0.9 },
        photoCatalogId: 'row-2',
      }).verdict
    ).toBe('disagrees');
  });

  it('a catalog-anchored photo ID condemns an unfiled name', () => {
    const r = comparePhotoIdentification({
      filed: { brand: 'Other', model: 'Nidrogen GenOne' },
      filedCatalogId: null,
      photo: { brand: 'Nike', model: 'Inflict 3', confidence: 0.8 },
      photoCatalogId: 'row-7',
    });
    expect(r.verdict).toBe('disagrees');
  });

  it('two un-anchored names disagreeing is inconclusive, not a finding', () => {
    const r = comparePhotoIdentification({
      filed: { brand: 'Other', model: 'Mystery Shoe' },
      filedCatalogId: null,
      photo: { brand: 'Other', model: 'Different Mystery', confidence: 0.8 },
      photoCatalogId: null,
    });
    expect(r.verdict).toBe('inconclusive');
  });
});
