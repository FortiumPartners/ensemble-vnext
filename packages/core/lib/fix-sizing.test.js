'use strict';
const { matchNeverUnattended } = require('./fix-sizing');

describe('matchNeverUnattended', () => {
  test('substring match, so an owner writing "auth" covers everything under it', () => {
    expect(matchNeverUnattended(['src/auth/x.ts', 'src/ui/y.ts'], ['auth'])).toEqual(['src/auth/x.ts']);
  });

  test('no patterns means no hits', () => {
    expect(matchNeverUnattended(['src/auth/x.ts'], [])).toEqual([]);
  });

  test('reports each matching file once', () => {
    const hits = matchNeverUnattended(['src/auth/pay.ts'], ['auth', 'pay']);
    expect(hits).toEqual(['src/auth/pay.ts']);
  });
});
