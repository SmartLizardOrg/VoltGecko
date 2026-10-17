import { afterEach, describe, expect, it } from 'vitest';
import { englishMessages, getLanguage, getLocale, setLanguage, t, translate } from './i18n';
afterEach(()=>setLanguage('hu'));
describe('English and Hungarian translation contract',()=>{
  it('defaults to Hungarian and switches locale and runtime labels without reloading',()=>{
    expect(getLanguage()).toBe('hu');expect(t('Alaprajz')).toBe('Alaprajz');
    setLanguage('en');expect(getLocale()).toBe('en-GB');expect(t('Alaprajz')).toBe('Floor plan');
    setLanguage('hu');expect(getLocale()).toBe('hu-HU');expect(t('Alaprajz')).toBe('Alaprajz');
  });
  it('substitutes values without translating user input or replacing twice',()=>{
    expect(translate('en','{code}: érvénytelen kezdőpozíció.',{code:'Konyha {count}'})).toContain('Konyha {count}');
    expect(translate('hu','{count} készülék',{count:3})).toBe('3 készülék');
    expect(translate('en','Saját magyar projektnév')).toBe('Saját magyar projektnév');
  });
  it('all dictionary translations preserve their interpolation placeholders',()=>{
    const tokens=(s:string)=>[...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m=>m[1]).sort();
    for(const [source,english] of Object.entries(englishMessages)){
      expect(english.trim(),source).not.toBe('');expect(tokens(english),source).toEqual(tokens(source));
    }
  });
});
