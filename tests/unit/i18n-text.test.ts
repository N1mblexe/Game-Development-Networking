import { describe, expect, it } from 'vitest';
import { alphabet, collator, foldForMatch, letterOf, lower, upper } from '../../src/lib/i18n/text';

describe('lower / upper', () => {
  it('handles the Turkish dotted and dotless i', () => {
    expect(lower('tr', 'IŞIK')).toBe('ışık');
    expect(lower('tr', 'İSTEMCİ')).toBe('istemci');
    expect(upper('tr', 'istemci')).toBe('İSTEMCİ');
    expect(upper('en', 'tick')).toBe('TICK');
  });
});

describe('foldForMatch', () => {
  it('treats every i variant as i', () => {
    for (const s of ['istemci', 'İstemci', 'ISTEMCI', 'ıstemcı', 'İSTEMCİ'.toLowerCase(), ' istemci  '])
      expect(foldForMatch(s)).toBe('istemci');
  });
  it('removes diacritics and collapses whitespace', () => {
    expect(foldForMatch('Paket   kaybı')).toBe('paket kaybi');
    expect(foldForMatch('Çağrı Şöyle Üç')).toBe('cagri soyle uc');
  });
  it('keeps case when asked', () => {
    expect(foldForMatch(' NetworkVariable ', { caseSensitive: true })).toBe('NetworkVariable');
    expect(foldForMatch('İ', { caseSensitive: true })).toBe('I');
  });
});

describe('collator / alphabet', () => {
  it('sorts Turkish letters in Turkish order', () => {
    expect(['ilk', 'ışık', 'dağ', 'çay', 'cam'].sort(collator('tr').compare)).toEqual(['cam', 'çay', 'dağ', 'ışık', 'ilk']);
  });
  it('lists the Turkish letters', () => {
    const tr = alphabet('tr');
    for (const l of ['Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü']) expect(tr).toContain(l);
    expect(tr.indexOf('Ç')).toBe(tr.indexOf('C') + 1);
    expect(tr.indexOf('İ')).toBe(tr.indexOf('I') + 1);
    expect(alphabet('en')).toHaveLength(26);
  });
  it('files terms under the right letter', () => {
    expect(letterOf('tr', 'istemci')).toBe('İ');
    expect(letterOf('tr', 'ışık')).toBe('I');
    expect(letterOf('tr', 'şifreleme')).toBe('Ş');
    expect(letterOf('en', 'jitter')).toBe('J');
    expect(letterOf('en', '3-way handshake')).toBe('#');
  });
});
