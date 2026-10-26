import { describe, expect, it } from 'vitest';
import { bytes, date, fixed, kbps, ms, num, pct, plural, relative } from '../../src/lib/i18n/format';

describe('num / fixed', () => {
  it('groups and uses the locale decimal separator', () => {
    expect(num('en', 1234.5)).toBe('1,234.5');
    expect(num('tr', 1234.5)).toBe('1.234,5');
    expect(num('tr', 1.5)).toBe('1,5');
  });
  it('fixed() matches toFixed() exactly in English', () => {
    for (const [n, d] of [
      [1.005, 2],
      [2.5, 0],
      [-0.3, 0],
      [12345.678, 1],
      [0, 3],
    ] as const)
      expect(fixed('en', n, d)).toBe(n.toFixed(d));
  });
  it('fixed() only swaps the separator in Turkish, never groups', () => {
    expect(fixed('tr', 12345.67, 1)).toBe('12345,7');
    expect(fixed('tr', -0, 0)).toBe('0');
  });
});

describe('pct', () => {
  it('puts the sign where the locale wants it', () => {
    expect(pct('en', 70)).toBe('70%');
    expect(pct('tr', 70)).toBe('%70');
    expect(pct('tr', 70.55, 1)).toBe('%' + (70.55).toFixed(1).replace('.', ','));
    expect(pct('en', 5.25, 1)).toBe(`${(5.25).toFixed(1)}%`);
  });
});

describe('units', () => {
  it('formats ms, kbps and bytes', () => {
    expect(ms('en', 16.66, 1)).toBe('16.7 ms');
    expect(ms('tr', 16.66, 1)).toBe('16,7 ms');
    expect(kbps('en', 1500)).toBe('1,500 kbps');
    expect(kbps('tr', 1500)).toBe('1.500 kbps');
    expect(bytes('en', 512)).toBe('512 B');
    expect(bytes('tr', 1536)).toBe('1,5 KB');
    expect(bytes('en', 3 * 1024 * 1024)).toBe('3 MB');
  });
});

describe('date / relative', () => {
  const d = new Date(2026, 9, 26);
  it('always uses the explicit locale', () => {
    expect(date('en', d)).toBe('Oct 26, 2026');
    expect(date('tr', d)).toBe('26 Eki 2026');
  });
  it('formats relative time', () => {
    expect(relative('en', -1, 'day')).toBe('yesterday');
    expect(relative('tr', 3, 'hour')).toBe('3 saat sonra');
  });
});

describe('plural', () => {
  it('uses Intl.PluralRules with other as the fallback', () => {
    const lessons = (n: number) => plural('en', n, { one: `${n} lesson`, other: `${n} lessons` });
    expect(lessons(1)).toBe('1 lesson');
    expect(lessons(0)).toBe('0 lessons');
    expect(lessons(2)).toBe('2 lessons');
    // Turkish counted nouns don't change: "1 ders", "5 ders".
    expect(plural('tr', 1, { other: '1 ders' })).toBe('1 ders');
    expect(plural('tr', 5, { other: '5 ders' })).toBe('5 ders');
  });
});
