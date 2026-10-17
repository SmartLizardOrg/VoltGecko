import { Moon, Sun, Type } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { useAppearance, type Theme, type TextSize } from '../theme';

export function AppearanceControls() {
  useLanguage();
  const { theme, textSize, setTheme, setTextSize } = useAppearance();
  return <div className="appearance-controls" role="group" aria-label={t('Megjelenés')}>
    <label><span>{theme === 'dark' ? <Moon size={18}/> : <Sun size={18}/>} {t('Téma')}</span><select aria-label={t('Téma')} value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="light">{t('Világos')}</option><option value="dark">{t('Sötét')}</option></select></label>
    <label><span><Type size={18}/> {t('Betűméret')}</span><select aria-label={t('Betűméret')} value={textSize} onChange={event => setTextSize(event.target.value as TextSize)}><option value="standard">{t('Normál (16 px)')}</option><option value="large">{t('Nagy (20 px)')}</option></select></label>
  </div>;
}
