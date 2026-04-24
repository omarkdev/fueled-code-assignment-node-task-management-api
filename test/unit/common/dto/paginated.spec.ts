import { paginated } from '../../../../src/common/dto/paginated';

describe('paginated()', () => {
  it('wraps data and exposes meta', () => {
    expect(paginated(['a', 'b'], 42, 2, 10)).toEqual({
      data: ['a', 'b'],
      meta: { total: 42, page: 2, perPage: 10 },
    });
  });

  it('works for empty data', () => {
    expect(paginated<number>([], 0, 1, 20)).toEqual({
      data: [],
      meta: { total: 0, page: 1, perPage: 20 },
    });
  });
});
