import { Cloud } from 'lucide-react';
import { APP } from '../config';
import { t } from '../i18n';
import type { Perform } from './format';

export function HelpPanel({ perform, notify }: { perform: Perform; notify: (message: string) => void }) {
  return (
    <div className="help-content">
      <p className="lead">{t('Az alaprajz, az áramkörök és az elosztó ugyanannak a tervnek a nézetei.')}</p>
      <ol>
        <li>
          <strong>{t('Tölts be alaprajzot.')}</strong>{' '}
          {t('PDF-ből minden oldal külön tervlap lesz. Üres lapon is kezdhetsz.')}
        </li>
        <li>
          <strong>{t('Helyezd el az eszközöket.')}</strong>{' '}
          {t('Válassz az eszköztárból, majd érintsd meg a rajzot. A jobb oldali adatlapon pontosítsd az adatokat.')}
        </li>
        <li>
          <strong>{t('Kapcsold össze a tervet.')}</strong>{' '}
          {t(
            'Hozz létre áramköröket, rendeld hozzá az eszközöket és a védelmeket. A kapcsolat eszközzel két eszközt köthetsz össze.'
          )}
        </li>
        <li>
          <strong>{t('Állítsd össze az elosztót.')}</strong>{' '}
          {t('A készüléktárból kattintással hozzáadhatsz elemeket; a sor és a kezdő modulhely kézzel is módosítható.')}
        </li>
        <li>
          <strong>{t('Ments külső példányt.')}</strong>{' '}
          {t('A projektfájl az összes képet és előzményt tartalmazza. A PDF az átadásra szolgál.')}
        </li>
      </ol>
      <div className="field-note">
        <Cloud size={20} />
        <p>
          <strong>{t('Adatok és offline használat')}</strong>
          <br />
          {t(
            'A projekt automatikusan ebbe a böngészőbe mentődik. Böngészőadat-törléskor vagy tárhelyfelszabadításkor elveszhet a helyi példány, ezért készíts fájl- vagy Drive-mentést. A Google csak csatlakoztatás után érhető el; saját szerverre nem küldünk projektadatot.'
          )}
        </p>
      </div>
      <button
        className="quiet"
        onClick={() =>
          void perform(t('Tárhelybeállítás…'), async () => {
            const granted = await navigator.storage?.persist?.();
            notify(
              granted
                ? t('A böngésző tartós tárolást engedélyezett.')
                : t('A böngésző nem engedélyezett tartós tárolást. A projektfájl-mentés továbbra is elérhető.')
            );
          })
        }
      >
        {t('Tartós helyi tárolás kérése')}
      </button>
      <h3>{t('Jelmagyarázat és szakmai ellenőrzés')}</h3>
      <p>
        {t(
          'A beépített jelek saját SVG-rajzok; a kiinduló jelkönyvtár szakmai hitelesítése még szükséges. Az egyedi okosotthon-jelek funkciót jelölnek. A készülékadatokat és a modulszélességet a gyártói adatok alapján töltsd ki.'
        )}
      </p>
      <p>
        {t(
          'Ez a változat eszköz- és áramkörszintű dokumentálást végez. A megadott védelmeket és vezetékadatokat a szakember választja ki.'
        )}
      </p>
      <h3>{t('Telepítés és frissítés')}</h3>
      <p>
        {t(
          'A build localhoston, illetve megbízható HTTPS-kapcsolaton telepíthető. iPhone-on a Safari megosztás menüjében válaszd a Főképernyőhöz adást. Az első letöltés után várd meg az „Offline használatra kész” jelzést.'
        )}
      </p>
      <p className="subtle">
        {t(APP.name)} · {APP.version}
        {t('· Helyi, ingyenes fejlesztői változat')}
      </p>
    </div>
  );
}
