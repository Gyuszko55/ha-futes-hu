# Változások

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
