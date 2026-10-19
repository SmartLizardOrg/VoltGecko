# Beépített rajzjelek

A `src/components/Symbol.tsx` rajzai ehhez a projekthez készített SVG-geometriák. Eredeti rajzaikra [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) közkinccsé tétel érvényes. Ez a nyilatkozat a saját grafikákra vonatkozik, nem a szabványok szövegére, ábráira vagy adatbázisaira.

Az alaprajzi katalógus változatai külön rajzjelet és megnevezést kapnak. A kiválasztott változat a tervlapon és a PDF jelmagyarázatában is megmarad.

| Típus | A jel kialakítása | Forrás / státusz |
| --- | --- | --- |
| Egysarkú, kétsarkú, csillár-, váltó- és keresztkapcsoló | Kis kör, a kapcsolási funkciónak megfelelő kapcsolószárak | NIVE 25. ábra; Hager 173. oldal |
| Kettős váltókapcsoló | Két váltókapcsolójel egymás mellett | A 106+106 kapcsoló funkcióját jelölő összetett ábra; Hager 162–163. oldal |
| Fényerőszabályzó | Kapcsolójel beállítónyíllal | NIVE 25. ábra; Hager 173. oldal |
| Nyomógomb, jelzőfényes nyomógomb | Két koncentrikus kör, világító változatnál belső kereszt | NIVE 26. ábra |
| Védőérintkezős dugalj | Félkör, merőleges szár és keresztvonás | NIVE 26. ábra; Hager 173. oldal |
| Kettős dugalj | Két védőérintkezős dugaljjel egymás mellett | Az alapjelből összeállított kettős csatlakozási pont |
| Fröccsenő víz ellen védett dugalj | Dugaljjel `IP` felirattal | Saját feliratos kiegészítés; pontos IP-védettséget nem állít |
| Háromfázisú dugalj | Dugaljjel `3~` feliratos kiegészítéssel | Saját feliratos kiegészítés |
| Lámpa, fali lámpa, vonalas lámpatest | Átlós kereszt; kereszt oldalsó szárral; egyenes vonal végvonásokkal | NIVE 26. ábra; Hager 173. oldal |
| LED-szalag | Vonalas világítás `LED` felirattal | Saját funkcionális jel |
| Kötődoboz | Kör a vezeték T alakú leágazásán | NIVE 25. ábra |
| TV- és telefoncsatlakozó | Gyengeáramú aljzat alapjel `TV` / `TP` felirattal | Hager 173. oldal |
| Adatcsatlakozó | Gyengeáramú aljzat alapjel `DATA` felirattal | Saját funkcionális kiegészítés |
| Mozgásérzékelő, termosztát | Feliratos `PIR` / `T` téglalap | Saját funkcionális jel |
| Csengő | Harang alakú piktogram | Saját funkcionális jel |
| Általános érzékelő, relé, központ | A korábbi funkcionális okosotthon-jel | Egyedi, a jelmagyarázat nevezi meg |
| Elosztókészülékek | Azonosítóval és típussal ellátott modulkiosztási ábra | Elhelyezési ábra; változatlan jelkészlet |

A kapcsolók szokásos magyar típuskódjai: 101, 102, 105, 106, 107 és 106+106. Ezek kapcsolótípust jelölnek, nem egyedi IEC-rajzjelazonosítók.

A normatív magyar referencia az [MSZ IEC 60617-SN:2014 – Elektrotechnikai rajzokon használt grafikai jelképek](https://ugyintezes.mszt.hu/webaruhaz/szabvany-adatok?standard=129373). A beépített jelkészlet nem IEC-tanúsított, és nem helyettesíti az [IEC 60617 adatbázisát](https://tc3.iec.ch/standard-as-database/). A konkrét adatbázisjelek egyedi azonosítóit nem ellenőriztük; a dokumentációt felhasználó szakembernek a tervhez illő jelmagyarázatot és megfeleltetést ellenőriznie kell.

A geometriai mintákhoz használt, nyilvánosan elérhető szakmai források:

- [Dienes Zoltán: Villamosipari rajzok (NIVE)](https://www.nive.hu/Downloads/Szakkepzesi_dokumentumok/Bemeneti_kompetenciak_meresi_ertekelesi_eszkozrendszerenek_kialakitasa/6_0917_003_100915.pdf), 25–26. ábra, a PDF 24–25. oldala. A jegyzet hivatkozása: Lándor Béláné–Molnár Ervin, *A műszaki rajz alapjai – Villamos rajzi alapismeretek*, Nemzeti Tankönyvkiadó–Tankönyvmester, 2000.
- [Hager: Villanyszerelői zsebkönyv](https://www.hager.hu/files/download/0/795_1/0/Villanyszereloi_zsebkonyv.pdf), nyomtatott 162–163. és 173. oldal, a PDF 82. és 87. oldala.
