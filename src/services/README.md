# Helyi integrációk

Az alkalmazás a Google beállítása nélkül teljesen működik. A Google-könyvtárak csak a felhasználó által indított csatlakozáskor töltődnek be. A projekt és a PDF feldolgozása helyben történik.

## Választható Google Drive

1. Google Cloud projektben engedélyezd a **Google Drive API** szolgáltatást. A megosztott fájlokhoz használt fájlválasztóhoz a **Google Picker API** is kell.
2. Állítsd be az OAuth hozzájárulási képernyőt, fejlesztés alatt add hozzá a tesztfelhasználókat. Hozz létre **Web application** OAuth kliensazonosítót.
3. Az engedélyezett JavaScript eredetek közé az előnézet pontos eredetét add, például `http://localhost:5173`, `http://localhost:4173`. Telefon HTTPS-előnézetéhez annak pontos HTTPS eredete is kell. Átirányítási URI és kliens titok nem szükséges a böngészős tokenmodellhez.
4. Másold a gyökér `.env.example` állományt `.env.local` néven, és állítsd be a `VITE_GOOGLE_CLIENT_ID` értékét. Újra kell indítani a fejlesztői kiszolgálót.
5. A Google fájlválasztóhoz add meg a publikus `VITE_GOOGLE_API_KEY` értéket és a Google Cloud projekt számát `VITE_GOOGLE_APP_ID` néven. Az API-kulcsot HTTP referrer alapján korlátozd a helyi eredetekre, API alapján a Picker API-ra.

Csak a `drive.file` jogosultságot kérjük: az alkalmazás által létrehozott, illetve a Google fájlválasztóban külön engedélyezett állományokhoz fér hozzá. Minden mentés új, teljes `.vgecko` pillanatkép a felhasználó normál Drive-mappájában; korábbi változatot nem ír felül. A korábbi `.eplan` mentések listázása és megnyitása változatlanul működik, a fájlválasztó mindkét kiterjesztést elfogadja. A hozzáférési token kizárólag memóriában marad. Lejárás vagy az alkalmazás újranyitása után a felhasználó ismét csatlakozik. Nincs szerveroldali token, háttérszinkron vagy saját adatbázis.

A Drive-integráció valódi működése saját fejlesztői Google-klienssel próbálható. A publikus OAuth-beállítás és szükség szerinti Google-ellenőrzés a végleges név és domain kiválasztása után következik.

Hivatalos referenciák: [Google tokenmodell](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [drive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Picker](https://developers.google.com/workspace/drive/api/guides/picker), [feltöltés](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## PDF és alaprajz

A PDF-import helyi PDF.js munkaszállal minden oldalt képpé alakít (legfeljebb 2200 képpont a hosszabb él mentén). A tervlap méretaránya az import után állítható be. A projekt legfeljebb 100 MB-os forrásállományból és 100 PDF-oldalból importálható egy lépésben.

A `scripts/copy-pdf-assets.mjs` az aktuális telepített PDF.js CMap-, alapbetű- és képfeldolgozó állományait, licenceivel együtt a `public/pdfjs` mappába másolja. Az indítás és a build ezt automatikusan futtatja; a PWA ezeket is előtölti, így a PDF-import a szabványbetűket vagy JPEG2000/JBIG2 képeket használó dokumentumoknál sem kér külső CDN-t. A generált `public/pdfjs` könyvtár a csomagfüggőségből újraépíthető.

A PDF-exportban használt Noto Sans betű helyben, a `public/fonts` mappában található. Forrás: [Noto projekt](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans), licenc: mellékelt SIL OFL 1.1. A rajzjelek az alkalmazás saját, dokumentált grafikus jelei; a kiadás előtti szakmai ellenőrzés állapotát a fő README és a jelmagyarázat rögzíti.
