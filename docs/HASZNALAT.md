# Használati és működési leírás

> [!WARNING]
> A fűtésvezérlés nem helyettesíti a kazán saját biztonsági védelmeit. Tarts egy Home Assistanttól független tartalékot, például egy hagyományos termosztátot alacsony hőfokra kötve. A gázfogyasztás csak becslés.

## 1. Fűtésvezérlő blueprint

Minden szekció külön kapcsolható. A fő kapcsoló (`input_boolean.futes_auto`) kikapcsolásával az egész automatika leáll, és a termosztátot kézzel kezelheted.

| Szekció | Mikor fut | Mit csinál |
|---|---|---|
| **1. Éjszakai visszavétel** | lefekvéskor és ébredéskor (pl. 22:00 / 06:00) | éjszakai, illetve nappali presetre vált. Beállítható, hogy csak akkor, ha valaki otthon van. |
| **2. Távollét** | ha a megadott személyek mind elmentek (késleltetéssel), és hazaérkezéskor | távollét preset, hazaérve a napszaknak megfelelő preset. A zóna (pl. „Munkahely”) is távollét. |
| **3. Napi be/ki döntés** | naponta egyszer (pl. 00:10) és a HA indulásakor | bekapcsol, ha a kinti (pl. tegnapi átlag) ÉS a benti hőmérséklet is a küszöb alatt van. Kikapcsol, ha mindkettő a kikapcsolási küszöb fölött van. A két küszöb eltér (hiszterézis), így nem kapcsolgat napról napra. |
| **4. Évszakonkénti PID-hangolás** | ha a kinti hőmérséklet tartósan (pl. 1,5 órán át) átlép egy sávhatárt, és a HA indulásakor | a Smart Thermostat `ki` (integrál) tagját állítja a sávnak megfelelően, és törli a felhalmozott integrált. Így enyhe időben nem lő túl. |
| **5. Kazánfelügyelet** | ha a kazán pl. 45 perce folyamatosan fűt | ha a benti hőmérséklet közben nem emelkedik (trend a küszöb alatt), riaszt (telefon és HA-értesítés), és bekapcsolja a hibajelzőt. A jelző magától kikapcsol, ha a trend pl. 30 percig újra emelkedik. |
| **6. Ablak/ajtó** | az 5. szekcióval együtt | ha valamelyik megadott érzékelő nyitva van, nem riaszt (a hőveszteség ilyenkor nem kazánhiba). A fűtést nem kapcsolja ki. |

**PID `ki` értékek:** szövegként add meg (pl. `0.00018`), mert a HA számmezője ilyen kis lépésközt nem kezel jól. Vesszővel is beírhatod.

## 2. Jelenlét

A `sensor.haztartas_jelenlet` állapotai:

- **Otthon:** legalább egy személy otthon van.
- **Távol:** senki sincs otthon, és a legutóbbi távozás óta kevesebb idő telt el, mint a küszöb.
- **Szabadság:** mindenki a küszöbnél (alapból 12 óránál) régebben ment el.

A távozások időpontját a `sensor.jelenlet_tavozasok` tárolja percenként, így a HA újraindítása után is megmarad. Aki a telepítéskor már távol van, annak a távolléte a telepítéstől számít.

A **Jelenlét alapú preset** blueprint ebből dolgozik:

- **Távol:** a késleltetés (pl. 30 perc) után `away`;
- **Szabadság:** `eco`;
- **hazaérkezéskor:** nappal `home`, éjjel `sleep`.

A presetek neve és a hőfokuk a termosztátban állítható.

## 3. Kazán és gázbecslés

- **Ténylegesen fűt:** a relé be van kapcsolva, ÉS (ha megadtál teljesítmény-szenzort) a kazán fogyasztása a küszöb fölött van. Ez pontosabb, mint a termosztát „fűtést kér” jelzése, mert a kazán a saját termosztátja miatt akkor is állhat, ha a relé zárva van.
- **Fűtési idő:** a mai napon ennyi órát fűtött (éjfélkor nullázódik).
- **Gázbecslés:** fűtési idő × névleges teljesítmény (kW) ÷ fűtőérték (kWh/m³). Egy 20 kW-os kazán 1 óra alatt kb. 20 ÷ 9,5 ≈ 2,1 m³-t fogyasztana teljes teljesítményen.
- **A becslés pontosítása:** olvasd le a gázórát két alkalommal (pl. egy hét különbséggel), és hasonlítsd össze a `sensor.kazan_gaz_osszesen` ugyanennyi idő alatti növekedésével. A névleges kW-t szorozd meg a valós és a becsült fogyasztás arányával.

## 4. A kártya jelzései

| Hol | Mit látsz | Jelentés |
|---|---|---|
| Sáv a tárcsa fölött | „Nyitva: … – X mp múlva leáll a fűtés” (narancs) | nyitott ablak/ajtó, a késleltetés még nem telt le |
| | „… – a fűtés szünetel” (kék) | a fűtés az ablak miatt leállt, bezáráskor visszakapcsol |
| | „… – a fűtés most nem megy, nincs hatása” (szürke) | nyitva van, de a fűtés amúgy is ki van kapcsolva |
| Tárcsa közepe | Zzz / láng / szünet / főkapcsoló | vár / fűt / ablak miatt szünetel / kikapcsolva |
| | villogó piros láng | kazánhiba gyanú (`input_boolean.kazan_hiba`) |
| | napocska | nincs fűtési igény: ki van kapcsolva, és a napi döntés sem kapcsolná be |
| A benti hőmérséklet előtt | ház-ikon + fok, jelenlét-ikon | kinti hőmérséklet; Otthon (zöld szív) / Távol (szürke) / Szabadság (pálma) |
| Ikonsor | láng / áthúzott láng | a kazán most fűt / áll |
| | PID % | a szabályzó kimenete (fűtési igény), csak Smart Thermostatnál |
| | Hideg / Hűvös / Enyhe | évszak-sáv (PID-hangolás) |
| | óra | mai fűtési idő |
| | m³, Éves m³ | mai és éves gázbecslés |
| Alsó sor | Fűtés automatika | fő kapcsoló és az ütemezés szövege (most mi megy, mi a következő váltás) |
| ⋮ | Előzmények / Beállítások / Kapcsolódó | a termosztát adatlapjának részei |

A tárcsán a Better Thermostat UI saját elem- és kapcsolatjelzései is működnek a `watch_sensors` listában megadott érzékelőkre.

## 5. Hibaelhárítás

| Mit látsz | Ok | Teendő |
|---|---|---|
| „A Better Thermostat UI kártya … nincs telepítve” | Hiányzik a HACS-kártya. | Telepítsd (HACS → Frontend), és frissítsd az oldalt. |
| „Custom element doesn't exist: hu-futes-card” | Nincs regisztrálva az erőforrás. | README → Telepítés, 4. lépés. |
| A kártya nem frissült a fájlcsere után | Böngésző-gyorsítótár. | Emeld meg az erőforrás `?v=` számát. |
| A gázbecslés „nem elérhető” | A kazán névleges teljesítménye 0. | Add meg a segédek között. |
| A kazánhiba-jelző indokolatlanul bekapcsolt | Rövid, erős hőveszteség (szellőztetés), vagy lassú radiátorkör. | Add meg az ablakérzékelőket (6. szekció), vagy növeld a riasztási időt. |
| A jelenlét nem vált Távolra | A személy nem szerepel, vagy kizártad; a telefon helyzete késik. | Nézd meg a `sensor.haztartas_jelenlet` attribútumait (`szemelyek`, `otthon`). |
| A PID-hangolás nem fut | Nem Smart Thermostat a termosztát. | Ezt a szekciót hagyd kikapcsolva. |
