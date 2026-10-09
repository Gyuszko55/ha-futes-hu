# Változások

## 1.4.0 – 2026-10-10

- **Fűtésvezérlő blueprint – éjszakai visszavétel pótlása:** ha a Home Assistant épp az éjszakai vagy a nappali
  váltáskor indul újra, induláskor pótolja (ha a váltás az elmúlt 15 percben esett ki). Korábban az időpont-trigger
  a leállás alatt elveszett, és a termosztát a következő váltásig a régi presetben maradt. Napközbeni újraindítás
  nem írja felül a kézi beállítást.
- **Smart Thermostat példa:** `sampling_period: 0`. A Smart Thermostat 2026.10-től induláskor az első mintavételig
  nem számol PID-et, ezért `300` mellett minden HA-újraindítás után 5 percig felesleges kazánégés lehetett.
- **README:** új „Telefonok beállítása a jelenléthez” rész (helyhozzáférés, akkumulátor-korlátozás, ellenőrzés);
  a hibaelhárítás két új sorral bővült.

## 1.3.0 – 2026-10-07

- **Termosztát-kártya – ablakfigyelés-kapcsoló:** új `opening.automation` opció (az ablakfigyelő automatizálás, pl. a
  „Window open, climate off” blueprint példánya). Megadva a sáv jobb szélén „Figyelés” kapcsoló jelenik meg, ha minden
  zárva, a ⋮ menüben „Ablakfigyelés ki/bekapcsolása”. Kikapcsolt figyelésnél a sáv szürkén, folyamatosan jelzi:
  „Ablakfigyelés kikapcsolva – nyitott ablak/ajtó nem állítja le a fűtést”, nyitott ajtónál „… a fűtés nem áll le”;
  a tárcsa ilyenkor nem mutat „ablak miatt szünetel” állapotot. Opció nélkül a kártya változatlan.
  Frissítés után az erőforrás `?v=` számát emeld meg.

## 1.2.0 – 2026-10-06

- **Termosztát-kártya – szöveges profil:** a `hu-futes-card` a gombok alatt kiírja a ténylegesen beállított presetet és
  célhőmérsékletet („Profil: Otthon · 22 °C”) – a tárcsa ikonjából (pl. napocska) ez nem mindig derül ki. Ha mindenki
  elment, és a jelenlét-automatika késleltetése még tart, a várható váltást is: „→ Távol · 18 °C 9:21-kor”.
  Kikapcsolható: `preset_text: false`. A `hu-klima-card`-on alapból ki, `preset_text: true`-val bekapcsolható.
  Frissítés után az erőforrás `?v=` számát emeld meg.

## 1.1.0 – 2026-10-04

- **Célhőmérséklet vezérlési mód** mindkét blueprintben: preset nélküli termosztátoknál (pl. Honeywell Lyric T6,
  HomeKit-es termosztátok, Zigbee-fejek) a nappali / éjszakai / távolléti / szabadság hőmérsékletet állítja
  (`climate.set_temperature`) a preset-váltás helyett. Opcionális *Tartás preset* (pl. Lyric: `PermanentHold`), hogy
  a termosztát saját ütemezése ne írja felül. Az alapértelmezés (preset mód) nem változott – a meglévő példányok
  változatlanul működnek.

## 1.0.0 – 2026-09-30

Első kiadás:

- Fűtésvezérlő blueprint: éjszakai visszavétel, távollét (zóna is távollét), napi be/ki döntés
  hiszterézissel, évszakonkénti PID-hangolás (Smart Thermostat), kazánfelügyelet magától
  törlődő hibajelzővel, ablak/ajtó-figyelembevétel. A nem használt szekciók mezői elhagyhatók.
- Jelenlét alapú preset blueprint (Otthon / Távol / Szabadság).
- Háztartás-jelenlét csomag az összes person entitásból.
- Kazán csomag: tényleges fűtés, fűtési idő, gázbecslés, benti trend, segédek.
- Termosztát-kártya: hu-futes-card, hu-klima-card (Better Thermostat UI-ra épül).
