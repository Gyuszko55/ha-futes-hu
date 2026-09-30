/*
 * Magyar termosztát kártyák (hu-termosztat)  v1.0
 * https://github.com/Gyuszko55/ha-futes-hu
 *
 *   custom:hu-futes-card  – fűtés (pl. gázkazán, Smart Thermostat PID)
 *   custom:hu-klima-card  – klíma (Better Thermostat)
 *
 * Mindkettő a Better Thermostat UI kártyát (better-thermostat-normal-
 * climate-card, HACS) ágyazza be, és kiegészíti:
 *  - ablak/ajtó-sáv (nyitva / X mp múlva leáll / szünetel / bezárva);
 *  - ikonsor (kazán fűt/áll, PID-kimenet, évszak-sáv, fűtési idő, gázbecslés,
 *    klímánál teljesítmény és fogyasztás);
 *  - a tárcsában a kinti hőmérséklet és a háztartás-jelenlét ikonja;
 *  - állapot-ikon a tárcsában (Zzz, láng, szünet, villogó hibajelzés);
 *  - automatika-sor kapcsolóval és az ütemezés szövegével;
 *  - ⋮ menü (Előzmények / Beállítások / Kapcsolódó).
 *
 * Nem BT-termosztátnál (pl. Smart Thermostat) a kártya előállítja a BT UI
 * által várt attribútumokat (call_for_heat, window_open, batteries, errors,
 * current_humidity), hogy a BT UI saját jelzései is működjenek.
 * Minden kiegészítő entitás elhagyható: amit nem adsz meg, az nem jelenik meg.
 */

const BT_TAG = "better-thermostat-normal-climate-card";

// A beágyazott BT UI kártyába injektált stílus. Átlátszó háttéren a BT saját
// backdrop-filterje alig mos el, ezért nyitott profilválasztónál a tárcsát és
// a gombokat közvetlenül mossuk el és tesszük érinthetetlenné.
const INNER_CSS = `
  .label-container p.label.hvac_action { font-size: 0; line-height: 0; }
  .label-container p.window-label ha-svg-icon, .label-container p.huterm-fault ha-svg-icon { display: none; }
  ha-icon.huterm-act { --mdc-icon-size: 28px; }
  ha-icon.huterm-act.fault { color: var(--error-color, #e53935); animation: huterm-blink 1s steps(2, start) infinite; }
  @keyframes huterm-blink { to { visibility: hidden; } }
  .huterm-extra { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px;
    color: var(--primary-text-color); }
  .huterm-extra ha-icon { --mdc-icon-size: 16px; }
  .huterm-extra .sep { margin: 0 2px 0 6px; --mdc-icon-size: 32px; }
  .preset-select.open { background: color-mix(in srgb, var(--card-background-color, #1c1c1c) 50%, transparent); }
  ha-card .container, ha-card .title, ha-card .more-info, .actions > :not(.preset-select) {
    transition: filter 250ms ease, opacity 250ms ease; }
  ha-card:has(.preset-select.open) .container,
  ha-card:has(.preset-select.open) .title,
  ha-card:has(.preset-select.open) .more-info,
  ha-card:has(.preset-select.open) .actions > :not(.preset-select) {
    filter: blur(8px) saturate(1.4); opacity: .4; pointer-events: none; }
`;

// A tárcsa állapot-szövege helyett ikon (a szöveg súgóként marad).
const ACTION_ICON = {
  heating: "mdi:fire", preheating: "mdi:fire", cooling: "mdi:snowflake",
  idle: "mdi:sleep", drying: "mdi:water-percent", fan: "mdi:fan", defrosting: "mdi:snowflake-melt",
};

const MORE_MENU = [
  ["history", "mdi:chart-box-outline", "Előzmények"],
  ["settings", "mdi:cog-outline", "Beállítások"],
  ["related", "mdi:family-tree", "Kapcsolódó"],
];
const VERSION = "1.0";

const PRESET_HU = {
  none: "Nincs", eco: "Takarékos", away: "Távol", comfort: "Kényelmes",
  home: "Otthon", sleep: "Alvás", boost: "Turbó", activity: "Aktivitás",
};

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v, digits = 1) => {
  const n = num(v);
  if (n == null) return null;
  return n.toLocaleString("hu-HU", { minimumFractionDigits: 0, maximumFractionDigits: digits });
};

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)} mp`;
  if (s < 3600) return `${Math.floor(s / 60)} perc`;
  if (s < 86400) return `${Math.floor(s / 3600)} óra`;
  return `${Math.floor(s / 86400)} nap`;
};

const secsSince = (iso) => (Date.now() - new Date(iso).getTime()) / 1000;
const isOn = (st) => st?.state === "on";
const bad = (st) => !st || st.state === "unavailable" || st.state === "unknown";
const truthy = (v) => v === true || String(v).toLowerCase() === "true";

// ---------------------------------------------------------------------------

class HuThermoCard extends HTMLElement {
  static defaults() { return {}; }

  static getStubConfig(hass) {
    const first = hass && Object.keys(hass.states).find((e) => e.startsWith("climate."));
    return { entity: first || "climate.termosztat" };
  }

  setConfig(config) {
    if (!config) throw new Error("Hiányzó konfiguráció");
    const d = this.constructor.defaults();
    this._config = {
      ...d,
      ...config,
      schedule: { ...(d.schedule || {}), ...(config.schedule || {}) },
      opening: { ...(d.opening || {}), ...(config.opening || {}) },
      bt_card: { ...(d.bt_card || {}), ...(config.bt_card || {}) },
      decide: { ...(d.decide || {}), ...(config.decide || {}) },
    };
    if (!String(this._config.entity).startsWith("climate.")) {
      throw new Error("Az entity climate.* legyen");
    }
    this._sig = "";
    this._cache = {};
    if (this._inner) this._inner.setConfig(this._innerConfig());
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  connectedCallback() {
    // Az időfüggő szövegek („X perce nyitva”) frissüljenek állapotváltás nélkül is.
    this._timer = window.setInterval(() => { this._sig = ""; this._update(); }, 30000);
  }

  disconnectedCallback() {
    window.clearInterval(this._timer);
    if (this._el) this._hideMenu();
  }

  _innerConfig() {
    const c = this._config;
    return { ...c.bt_card, entity: c.entity, name: c.bt_card.name ?? " " };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._root) this._build();
    this._update();
  }

  // ---- a beágyazott BT UI kártyának szánt állapot ----------------------

  /** A profil ide adja a BT UI számára felülírt attribútumokat. */
  _synthAttributes(_st, _ctx) { return {}; }

  _patchHass(hass, ctx) {
    const id = this._config.entity;
    const src = hass.states[id];
    if (!src) return hass;
    const extra = this._synthAttributes(src, ctx);
    const key = JSON.stringify(extra);
    if (this._cache.src !== src || this._cache.key !== key) {
      this._cache = { src, key, state: Object.keys(extra).length ? { ...src, attributes: { ...src.attributes, ...extra } } : src };
    }
    // Ugyanarra a hass-ra és állapotra ugyanazt az objektumot adjuk (ne rajzolja újra fölöslegesen a BT UI-t).
    if (this._patched && this._patched.hass === hass && this._patched.state === this._cache.state) return this._patched.obj;
    const patched = Object.assign(Object.create(Object.getPrototypeOf(hass)), hass);
    patched.states = { ...hass.states, [id]: this._cache.state };
    // A BT UI a profilválasztóban az ÉPP AKTÍV profilra kattintva „none”-ra kapcsol (kézi mód, elállítja
    // a hőfokokat). A „none” a listában nem is választható, ezért a saját termosztátra küldött
    // set_preset_mode: none hívást elnyeljük – ugyanarra a profilra kattintás így nem változtat semmit.
    patched.callService = (domain, service, data, ...rest) => {
      if (domain === "climate" && service === "set_preset_mode" && data?.preset_mode === "none") {
        const ids = [].concat(data.entity_id ?? []);
        if (ids.includes(id)) {
          console.info("huterm-card: set_preset_mode none elnyelve", id);
          return Promise.resolve();
        }
      }
      return hass.callService(domain, service, data, ...rest);
    };
    this._patched = { hass, state: this._cache.state, obj: patched };
    return patched;
  }

  // ---- DOM ------------------------------------------------------------

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="title"></div>
        <div class="banner-slot"></div>
        <div class="bt"></div>
        <div class="chips"></div>
        <div class="auto"></div>
        <div class="menu" hidden></div>
      </ha-card>`;
    this._root = root;
    this._el = {
      title: root.querySelector(".title"),
      banner: root.querySelector(".banner-slot"),
      bt: root.querySelector(".bt"),
      chips: root.querySelector(".chips"),
      auto: root.querySelector(".auto"),
      menu: root.querySelector(".menu"),
    };
    root.addEventListener("click", (ev) => this._onClick(ev));
    // A BT UI ⋮ gombja a termosztát more-info ablakot nyitná – helyette saját menü.
    this._el.bt.addEventListener("hass-more-info", (ev) => {
      if (ev.detail?.entityId !== this._config.entity || ev.detail?.view) return;
      ev.stopPropagation();
      this._openMenu(this._inner?.shadowRoot?.querySelector(".more-info") || this._el.bt);
    });
    this._closeMenu = (ev) => {
      if (ev.type === "keydown" && ev.key !== "Escape") return;
      if (ev.type === "pointerdown" && ev.composedPath().includes(this._el.menu)) return;
      this._hideMenu();
    };
    const mount = () => {
      if (this._inner) return;
      const el = document.createElement(BT_TAG);
      el.setConfig(this._innerConfig());
      this._el.bt.innerHTML = "";
      this._el.bt.appendChild(el);
      this._inner = el;
      Promise.resolve(el.updateComplete).then(() => {
        const sr = el.shadowRoot;
        if (!sr || sr.querySelector("style[data-huterm]")) return;
        const st = document.createElement("style");
        st.dataset.huterm = "1";
        st.textContent = INNER_CSS;
        sr.appendChild(st);
      });
      this._sig = "";
      this._update();
    };
    if (customElements.get(BT_TAG)) mount();
    else {
      this._el.bt.innerHTML = `<div class="missing">A Better Thermostat UI kártya (HACS) még töltődik vagy nincs telepítve…</div>`;
      customElements.whenDefined(BT_TAG).then(mount);
    }
  }

  _openMenu(btn) {
    const card = this._root.querySelector("ha-card").getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const m = this._el.menu;
    m.innerHTML = MORE_MENU.map(([view, icon, label]) =>
      `<div class="mitem" data-view="${view}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></div>`).join("");
    m.style.top = `${b.bottom - card.top + 2}px`;
    m.style.right = `${card.right - b.right + 4}px`;
    m.hidden = false;
    window.addEventListener("pointerdown", this._closeMenu, true);
    window.addEventListener("keydown", this._closeMenu);
  }

  _hideMenu() {
    this._el.menu.hidden = true;
    window.removeEventListener("pointerdown", this._closeMenu, true);
    window.removeEventListener("keydown", this._closeMenu);
  }

  /**
   * A HA more-info ablak egy közvetlenül nyitott nézetből (Előzmények / Beállítások / Kapcsolódó)
   * a „Vissza” gombra nem bezár, hanem a főnézetére lép – ami a termosztát általános kártyája.
   * Erre az egy megnyitásra a Vissza a nézetből bezárja az ablakot; bezáráskor visszaáll az eredeti.
   */
  _closeOnBack(view) {
    const started = Date.now();
    const tryPatch = () => {
      const dlg = document.querySelector("home-assistant")?.shadowRoot?.querySelector("ha-more-info-dialog");
      if (!dlg || dlg._currView !== view) {
        if (Date.now() - started < 3000) setTimeout(tryPatch, 100);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(dlg, "_goBack")) return;
      dlg._goBack = function () {
        if (!this._childView && this._currView === view && this._initialView === view) this.closeDialog();
        else Object.getPrototypeOf(this)._goBack.call(this);
      };
      const restore = () => {
        delete dlg._goBack;
        dlg.removeEventListener("dialog-closed", restore);
        dlg.requestUpdate?.();
      };
      dlg.addEventListener("dialog-closed", restore);
      dlg.requestUpdate?.();
    };
    setTimeout(tryPatch, 50);
  }

  _onClick(ev) {
    const v = ev.target.closest("[data-view]");
    if (v) {
      ev.stopPropagation();
      this._hideMenu();
      const e = new Event("hass-more-info", { bubbles: true, composed: true });
      e.detail = { entityId: this._config.entity, view: v.dataset.view };
      this.dispatchEvent(e);
      this._closeOnBack(v.dataset.view);
      return;
    }
    const t = ev.target.closest("[data-more], [data-toggle]");
    if (!t) return;
    ev.stopPropagation();
    if (t.dataset.toggle) {
      this._hass.callService("homeassistant", "toggle", { entity_id: t.dataset.toggle });
      return;
    }
    const e = new Event("hass-more-info", { bubbles: true, composed: true });
    e.detail = { entityId: t.dataset.more };
    this.dispatchEvent(e);
  }

  _update() {
    if (!this._root || !this._hass) return;
    const ctx = this._context();
    if (this._inner) {
      this._inner.hass = this._patchHass(this._hass, ctx);
      this._applyInnerExtra(ctx);
    }
    const sig = JSON.stringify(this._signature(ctx));
    if (sig === this._sig) return;
    this._sig = sig;
    const st = ctx.st;
    this._el.title.textContent = this._config.name || st?.attributes?.friendly_name || this._config.entity;
    this._el.banner.innerHTML = st ? this._banner(ctx) : `<div class="banner warn"><span>Nem található: ${esc(this._config.entity)}</span></div>`;
    this._el.chips.classList.toggle("plain", !!this._config.plain_chips);
    this._el.chips.innerHTML = this._chips(ctx).join("");
    this._el.auto.innerHTML = this._autoRow(ctx);
  }

  /** Közös környezet: állapotok, amelyekből a profil dolgozik. */
  _context() {
    const h = this._hass;
    const c = this._config;
    return {
      h, c,
      st: h.states[c.entity],
      auto: h.states[c.auto_entity],
      presence: h.states[c.presence_entity],
    };
  }

  _signature(ctx) {
    return [ctx.st?.state, ctx.st?.attributes, ctx.auto?.state,
      ctx.presence?.state, ctx.presence?.last_changed];
  }

  _banner() { return ""; }
  _chips() { return []; }

  _chip(icon, text, color, more, title = "") {
    return `<div class="chip ${color || ""}" ${more ? `data-more="${esc(more)}"` : ""} title="${esc(title)}">
      <ha-icon icon="${icon}"></ha-icon>${text ? `<span>${text}</span>` : ""}</div>`;
  }

  /** A profil ide adja a tárcsába, a benti hőmérséklet elé kerülő HTML-t. */
  _innerExtra() { return ""; }

  // A BT UI (Lit) újrarajzolhatja a sort, ezért minden frissítéskor ellenőrizzük.
  _applyInnerExtra(ctx) {
    const html = this._innerExtra(ctx);
    Promise.resolve(this._inner.updateComplete).then(() => {
      this._applyActionIcon();
      const row = this._inner.shadowRoot?.querySelector(".info p.label.secondary:not(.humidity)");
      if (!row) return;
      let el = row.querySelector(".huterm-extra");
      if (!html) { el?.remove(); return; }
      if (!el) {
        el = document.createElement("span");
        el.className = "huterm-extra";
        row.insertBefore(el, row.firstChild);
      }
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    });
  }

  _applyActionIcon() {
    const sr = this._inner.shadowRoot;
    const lbl = sr?.querySelector(".label-container p.hvac_action, .label-container p.window-label, .label-container p.summer-label");
    if (!lbl) return;
    const st = this._inner.hass?.states?.[this._config.entity];
    const fault = this._config.fault_entity && this._hass.states[this._config.fault_entity];
    lbl.classList.toggle("huterm-fault", fault?.state === "on");
    if (lbl.classList.contains("summer-label") && fault?.state !== "on") {
      lbl.querySelector("ha-icon.huterm-act")?.remove();
      return;
    }
    let icon, title;
    if (fault?.state === "on") {
      icon = "mdi:fire-alert"; title = fault.attributes.friendly_name || "Hiba";
    } else if (lbl.classList.contains("window-label")) {
      icon = "mdi:pause"; title = "Szünetel (nyitott ablak/ajtó)";
    } else {
      title = lbl.textContent.trim();
      if (!st || st.state === "unavailable" || st.state === "unknown") icon = "mdi:alert-circle-outline";
      else if (st.state === "off") icon = "mdi:power";
      else icon = ACTION_ICON[st.attributes.hvac_action] || "mdi:sleep";
    }
    let el = lbl.querySelector("ha-icon.huterm-act");
    if (!el) {
      el = document.createElement("ha-icon");
      el.className = "huterm-act";
      lbl.insertBefore(el, lbl.firstChild);
    }
    if (el.getAttribute("icon") !== icon) el.setAttribute("icon", icon);
    if (el.title !== title) el.title = title;
    el.classList.toggle("fault", fault?.state === "on");
  }

  _presenceLook(p) {
    return { "Otthon": ["mdi:home-heart", "#43a047"], "Távol": ["mdi:home-export-outline", "var(--secondary-text-color)"],
      "Szabadság": ["mdi:palm-tree", "#ff9800"] }[p?.state] || ["mdi:home-alert", "var(--secondary-text-color)"];
  }

  _personChips(ctx) {
    const p = ctx.presence;
    if (!p) return [];
    const look = { "Otthon": ["mdi:home-heart", "green"], "Távol": ["mdi:home-export-outline", "grey"],
      "Szabadság": ["mdi:palm-tree", "amber"] }[p.state] || ["mdi:home-alert", "grey"];
    const who = (p.attributes.otthon || []).join(", ");
    return [this._chip(look[0], "", look[1], p.entity_id, `${p.state}${who ? ` – otthon: ${who}` : ""}`)];
  }

  _presetLabel(key, st) {
    const name = PRESET_HU[key] ?? key;
    const t = num(st?.attributes?.[`${key}_temp`]);
    return t != null ? `${name} ${fmt(t)} °C` : name;
  }

  /** Ütemezés-szöveg: most melyik szakasz megy, mi a következő váltás. */
  _scheduleLine(ctx) {
    const s = this._config.schedule;
    const pres = ctx.presence?.state;
    if (pres === "Szabadság") return `Szabadság – ${this._presetLabel(s.vacation_preset, ctx.st)}`;
    if (pres === "Távol") {
      const mins = (Date.now() - new Date(ctx.presence.last_changed).getTime()) / 60000;
      const away = this._presetLabel(s.away_preset, ctx.st);
      return mins >= s.away_delay_min
        ? `Távol – ${away}`
        : `Távol – ${Math.ceil(s.away_delay_min - mins)} perc múlva ${away}`;
    }
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    const ns = toMin(s.night_start), ds = toMin(s.day_start);
    const night = ns > ds ? (m >= ns || m < ds) : (m >= ns && m < ds);
    const day = this._presetLabel(s.day_preset, ctx.st);
    const nig = this._presetLabel(s.night_preset, ctx.st);
    return night
      ? `Éjszaka: ${nig} · ${s.day_start}-kor ${day}`
      : `Nappal: ${day} · ${s.night_start}-kor ${nig}`;
  }

  _autoLine(ctx) { return this._scheduleLine(ctx); }

  _autoRow(ctx) {
    const c = this._config;
    if (!ctx.auto) return "";
    const on = ctx.auto.state === "on";
    const line = on ? this._autoLine(ctx) : "Kikapcsolva – kézi vezérlés";
    return `<div class="autorow">
      <div class="aicon ${on ? "on" : ""}" data-more="${esc(c.auto_entity)}"><ha-icon icon="mdi:robot"></ha-icon></div>
      <div class="atext" data-more="${esc(c.auto_entity)}">
        <div class="aname">${esc(c.auto_name)}</div>
        <div class="aline">${esc(line)}</div>
      </div>
      <div class="switch ${on ? "on" : ""}" data-toggle="${esc(c.auto_entity)}" role="switch" aria-checked="${on}"><div class="knob"></div></div>
    </div>`;
  }
}

// ---------------------------------------------------------------------------
// Klíma: Better Thermostat-tal

class HuKlimaCard extends HuThermoCard {
  static defaults() {
    return {
      entity: null,
      name: null,
      opening: { sensor: null, name: "Ajtó", delay: 60 },  // a BT-ben beállított ablak/ajtó-érzékelő
      unit_entity: null,            // a klíma saját climate entitása (belső hőmérője a tárcsában)
      power_entity: null,           // teljesítmény (W)
      h_season_entity: null,        // H-tarifa téli időszak (binary_sensor)
      h_winter_yearly_entity: null, // H-tarifa éves téli fogyasztás (kWh)
      h_summer_yearly_entity: null, // H-tarifa éves nyári fogyasztás (kWh)
      plain_chips: true,
      auto_entity: null,
      auto_name: "Klíma automatika",
      presence_entity: "sensor.haztartas_jelenlet",
      schedule: {
        night_start: "22:00", night_preset: "sleep",
        day_start: "06:00", day_preset: "eco",
        away_preset: "away", away_delay_min: 30, vacation_preset: "away",
      },
      bt_card: {},
    };
  }

  _context() {
    const ctx = super._context();
    const c = this._config;
    ctx.door = ctx.h.states[c.opening.sensor];
    ctx.unit = ctx.h.states[c.unit_entity];
    ctx.power = ctx.h.states[c.power_entity];
    ctx.hSeason = ctx.h.states[c.h_season_entity];
    ctx.hWinterY = ctx.h.states[c.h_winter_yearly_entity];
    ctx.hSummerY = ctx.h.states[c.h_summer_yearly_entity];
    const a = ctx.st?.attributes || {};
    ctx.btPaused = truthy(a.door_open) || truthy(a.window_open);
    return ctx;
  }

  _signature(ctx) {
    return [...super._signature(ctx), ctx.door?.state, ctx.door?.last_changed,
      ctx.unit?.attributes?.current_temperature, ctx.power?.state, ctx.hSeason?.state, ctx.hWinterY?.state, ctx.hSummerY?.state];
  }

  _synthAttributes(st, ctx) {
    const a = st.attributes || {};
    return truthy(a.door_open) && !truthy(a.window_open) ? { window_open: true } : {};
  }

  _banner(ctx) {
    const o = this._config.opening;
    if (!o.sensor) return "";
    const door = ctx.door;
    const dn = esc(o.name);
    const more = esc(o.sensor);
    if (bad(door)) {
      return `<div class="banner warn" data-more="${more}"><ha-icon icon="mdi:door-closed-lock"></ha-icon>
        <span>${dn}-érzékelő nem elérhető, a nyitást a klíma nem látja</span></div>`;
    }
    const open = isOn(door);
    if (ctx.btPaused && open) {
      return `<div class="banner info" data-more="${more}"><ha-icon icon="mdi:door-open"></ha-icon>
        <span><b>${dn} nyitva</b> (${ago(door.last_changed)}) – a klíma szünetel</span></div>`;
    }
    if (open) {
      const left = Math.max(0, o.delay - secsSince(door.last_changed));
      return `<div class="banner amber" data-more="${more}"><ha-icon icon="mdi:door-open"></ha-icon>
        <span><b>${dn} nyitva</b> – ${left > 0 ? `${Math.ceil(left)} mp múlva szünetel` : "a klíma hamarosan szünetel"}</span></div>`;
    }
    if (ctx.btPaused) {
      return `<div class="banner info" data-more="${esc(this._config.entity)}"><ha-icon icon="mdi:door-closed"></ha-icon>
        <span>${dn} bezárva – a klíma hamarosan folytatja</span></div>`;
    }
    return "";
  }

  // A tárcsa már mutatja: terasz hőmérséklet, állapot, páratartalom, és (_innerExtra)
  // a klíma belső hőmérsékletét és a jelenlétet; a Beállítás gomb a presetet.
  // A teraszajtót a sáv jelzi, ha nyitva van. Itt: teljesítmény + H-tarifás fogyasztás.
  _chips(ctx) {
    const c = this._config;
    const out = [];
    const p = fmt(ctx.power?.state, 0);
    if (p != null) out.push(this._chip("mdi:flash", `${p} W`, num(ctx.power.state) > 50 ? "orange" : "", c.power_entity, "Teljesítmény"));
    // H-tarifa éves fogyasztás szezononként (az utolsó éves leolvasás óta): előbb az aktuális szezoné.
    const winterNow = ctx.hSeason?.state === "on";
    const seasons = [
      [ctx.hWinterY, "mdi:snowflake", "Téli", "cyan", c.h_winter_yearly_entity, "téli, kedvezményes (1.81)", "regiszter_1_81"],
      [ctx.hSummerY, "mdi:white-balance-sunny", "Nyári", "amber", c.h_summer_yearly_entity, "nyári, normál (1.82)", "regiszter_1_82"],
    ];
    if (!winterNow) seasons.reverse();
    for (const [st, icon, label, col, ent, desc, reg] of seasons) {
      const v = fmt(st?.state, 0);
      if (v == null) continue;
      const since = st.attributes?.elszamolas_kezdete;
      const r = fmt(st.attributes?.[reg], 0);
      out.push(this._chip(icon, `${label} ${v} kWh`, col, ent,
        `H-tarifa ${desc} fogyasztás${since ? ` ${since} óta` : ""}${r != null ? ` · mérő: ${r} kWh` : ""}`));
    }
    return out;
  }

  // Tárcsa: a klíma belső hőmérséklete · jelenlét · (a BT UI saját szobahőmérséklete)
  _innerExtra(ctx) {
    const parts = [];
    const ut = fmt(ctx.unit?.attributes?.current_temperature);
    if (ut != null) parts.push(`<ha-icon icon="mdi:air-conditioner" title="A klíma saját belső hőmérője"></ha-icon><span>${ut} °C</span>`);
    if (ctx.presence) {
      const [ic, col] = this._presenceLook(ctx.presence);
      parts.push(`<ha-icon class="sep" icon="${ic}" style="color:${col}" title="${esc(ctx.presence.state)}"></ha-icon>`);
    }
    return parts.join("");
  }
}

// ---------------------------------------------------------------------------
// Fűtés: gázkazán, Smart Thermostat PID-del

const SEASON_ICON = {
  "Hideg": ["mdi:snowflake", "cyan"],
  "Hűvös": ["mdi:weather-fog", ""],
  "Enyhe": ["mdi:leaf-maple", "orange"],
};

class HuFutesCard extends HuThermoCard {
  static defaults() {
    return {
      entity: null,
      name: null,
      opening: { sensor: null, name: "Ablak/ajtó", delay: 60 },  // érzékelő vagy csoport (a tagjait név szerint írja)
      humidity_sensor: null,
      outdoor_entity: null,
      burning_entity: "binary_sensor.kazan_tenylegesen_fut",
      fault_entity: "input_boolean.kazan_hiba",
      plain_chips: true,
      season_entity: "input_select.futes_evszak",
      runtime_entity: "sensor.kazan_futesi_ido",
      gas_entity: "sensor.kazan_gaz_napi",
      gas_yearly_entity: null,
      // Napi be/ki döntés (a blueprint 3. szekciója): ha megadod, a kártya kikapcsolt fűtésnél
      // napocskát mutat, amikor a döntés sem kapcsolná be, és kiírja, mikor dönt újra.
      decide: {
        entity: null, time: "00:10", on_below: 13, off_above: 15,
        indoor_entity: null, indoor_on_below: 19,
      },
      // Elem- és elérhetőség-figyelésbe bevont érzékelők (a nyitás-csoport tagjai automatikusan).
      watch_sensors: [],
      auto_entity: "input_boolean.futes_auto",
      auto_name: "Fűtés automatika",
      presence_entity: "sensor.haztartas_jelenlet",
      schedule: {
        night_start: "22:00", night_preset: "sleep",
        day_start: "06:00", day_preset: "home",
        away_preset: "away", away_delay_min: 30, vacation_preset: "eco",
      },
      bt_card: {},
    };
  }

  _context() {
    const ctx = super._context();
    const c = this._config;
    const h = ctx.h;
    ctx.open = h.states[c.opening.sensor];
    ctx.openMembers = (ctx.open?.attributes?.entity_id || [])
      .map((e) => h.states[e]).filter((s) => isOn(s));
    ctx.outdoor = h.states[c.outdoor_entity];
    ctx.burning = h.states[c.burning_entity];
    ctx.fault = h.states[c.fault_entity];
    ctx.season = h.states[c.season_entity];
    ctx.runtime = h.states[c.runtime_entity];
    ctx.gas = h.states[c.gas_entity];
    ctx.gasYearly = h.states[c.gas_yearly_entity];
    ctx.decideSt = h.states[c.decide.entity];
    ctx.indoorSt = h.states[c.decide.indoor_entity];
    ctx.hum = h.states[c.humidity_sensor];
    const off = ctx.st?.state === "off";
    // Ablak miatti leállás: a fűtés a nyitás után (a késleltetés letelte
    // körül) kapcsolt ki, és a nyílászáró még mindig nyitva van.
    ctx.paused = off && isOn(ctx.open) &&
      new Date(ctx.st.last_changed).getTime() >= new Date(ctx.open.last_changed).getTime() + (c.opening.delay - 10) * 1000;
    // Nincs fűtési igény (napocska a tárcsán): ki van kapcsolva, nem ablak
    // miatt, és a napi döntés sem kapcsolná be (tegnapi átlag vagy szobahő magas).
    const avg = num(ctx.decideSt?.state);
    const indoor = num(ctx.h.states[c.decide.indoor_entity]?.state);
    ctx.wouldTurnOn = !c.decide.entity ||
      (avg != null && avg < c.decide.on_below && (!c.decide.indoor_entity || (indoor != null && indoor < c.decide.indoor_on_below)));
    ctx.summer = off && !ctx.paused && !ctx.wouldTurnOn;
    return ctx;
  }

  _signature(ctx) {
    return [...super._signature(ctx), ctx.open?.state, ctx.open?.last_changed,
      ctx.openMembers.map((s) => s.entity_id), ctx.outdoor?.state, ctx.burning?.state, ctx.fault?.state,
      ctx.season?.state, ctx.runtime?.state, ctx.gas?.state, ctx.gasYearly?.state, ctx.decideSt?.state, ctx.indoorSt?.state, ctx.hum?.state];
  }

  /** Az érzékelő eszközéhez tartozó elemszint-szenzor (entity registry alapján). */
  _batteryOf(entityId) {
    const h = this._hass;
    const dev = h.entities?.[entityId]?.device_id;
    if (!dev) return undefined;
    for (const [id, ent] of Object.entries(h.entities)) {
      if (ent.device_id !== dev || !id.startsWith("sensor.")) continue;
      const s = h.states[id];
      if (s?.attributes?.device_class === "battery") return s;
    }
    return undefined;
  }

  _synthAttributes(st, ctx) {
    const c = this._config;
    const h = ctx.h;
    const members = ctx.open?.attributes?.entity_id || [];
    const watched = [...c.watch_sensors, ...members];
    // batteries: a BT formátuma – {név: {battery: "%"}}; a BT UI a legalacsonyabbra figyelmeztet.
    const batteries = {};
    for (const id of watched) {
      if (this._batCache?.[id] === undefined) {
        this._batCache = this._batCache || {};
        this._batCache[id] = this._batteryOf(id)?.entity_id ?? null;
      }
      const bid = this._batCache[id];
      const bs = bid && h.states[bid];
      if (bs && num(bs.state) != null) batteries[bid] = { battery: String(bs.state) };
    }
    const errors = watched.filter((id) => bad(h.states[id]));
    const out = {
      call_for_heat: !ctx.summer,
      window_open: ctx.paused,
      batteries: JSON.stringify(batteries),
      errors: JSON.stringify(errors),
    };
    const hum = num(ctx.hum?.state);
    if (hum != null) out.current_humidity = hum;
    return out;
  }

  _openNames(ctx) {
    return ctx.openMembers.map((s) => esc(s.attributes.friendly_name || s.entity_id)).join(", ");
  }

  _banner(ctx) {
    const o = this._config.opening;
    if (!o.sensor) return "";
    if (bad(ctx.open)) {
      return `<div class="banner warn" data-more="${esc(o.sensor)}"><ha-icon icon="mdi:window-closed-variant"></ha-icon>
        <span>Az ablak/ajtó-érzékelők csoportja nem elérhető</span></div>`;
    }
    if (!isOn(ctx.open)) return "";
    const names = this._openNames(ctx) || esc(o.name);
    const more = esc(ctx.openMembers[0]?.entity_id || o.sensor);
    if (ctx.st?.state === "off" && !ctx.paused) {
      return `<div class="banner neutral" data-more="${more}"><ha-icon icon="mdi:door-open"></ha-icon>
        <span>Nyitva: <b>${names}</b> (${ago(ctx.open.last_changed)}) – a fűtés most nem megy, nincs hatása</span></div>`;
    }
    if (ctx.paused) {
      return `<div class="banner info" data-more="${more}"><ha-icon icon="mdi:window-open-variant"></ha-icon>
        <span>Nyitva: <b>${names}</b> (${ago(ctx.open.last_changed)}) – a fűtés szünetel, bezáráskor visszakapcsol</span></div>`;
    }
    const left = Math.max(0, o.delay - secsSince(ctx.open.last_changed));
    return `<div class="banner amber" data-more="${more}"><ha-icon icon="mdi:window-open-variant"></ha-icon>
      <span>Nyitva: <b>${names}</b> – ${left > 0 ? `${Math.ceil(left)} mp múlva leáll a fűtés` : "a fűtés hamarosan leáll"}</span></div>`;
  }

  // A tárcsa már mutatja: szobahőmérséklet, célhő, páratartalom, állapot;
  // a Beállítás gomb a presetet. Itt csak a kiegészítő adatok vannak.
  _chips(ctx) {
    const c = this._config;
    const out = [];
    if (ctx.burning) {
      const b = isOn(ctx.burning);
      out.push(this._chip(b ? "mdi:fire" : "mdi:fire-off", "", b ? "orange" : "", c.burning_entity, b ? "Kazán fűt" : "Kazán áll"));
    }
    const co = num(ctx.st?.attributes?.control_output);
    if (co != null && ctx.st.state !== "off") out.push(this._chip("mdi:gauge", `PID ${fmt(co, 0)}%`, "amber", c.entity, "A PID-szabályzó kimenete (fűtési igény)"));
    if (ctx.season && !bad(ctx.season)) {
      const [ic, col] = SEASON_ICON[ctx.season.state] || ["mdi:calendar-range", ""];
      out.push(this._chip(ic, esc(ctx.season.state), col, c.season_entity, "Évszak-sáv (PID-hangolás)"));
    }
    const rt = num(ctx.runtime?.state);
    if (rt != null) {
      const m = Math.round(rt * 60);
      out.push(this._chip("mdi:timer-outline", `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`, "", c.runtime_entity, "Kazán fűtési ideje ma"));
    }
    const g = fmt(ctx.gas?.state, 2);
    if (g != null) out.push(this._chip("mdi:gas-burner", `${g} m³`, "", c.gas_entity, "Becsült gázfogyasztás ma"));
    const gy = fmt(ctx.gasYearly?.state, 1);
    if (gy != null) {
      const since = ctx.gasYearly.attributes?.elszamolas_kezdete;
      out.push(this._chip("mdi:calendar-range", `Éves ${gy} m³`, "", c.gas_yearly_entity,
        `Gázfogyasztás az éves leolvasás${since ? ` (${since})` : ""} óta`));
    }
    return out;
  }

  // Tárcsa: kinti hőmérséklet · jelenlét · (a BT UI saját benti hőmérséklete)
  _innerExtra(ctx) {
    const parts = [];
    const t = fmt(ctx.outdoor?.state);
    if (t != null) parts.push(`<ha-icon icon="mdi:home-thermometer-outline" style="color:#00acc1"></ha-icon><span>${t} °C</span>`);
    if (ctx.presence) {
      const [ic, col] = this._presenceLook(ctx.presence);
      parts.push(`<ha-icon class="sep" icon="${ic}" style="color:${col}" title="${esc(ctx.presence.state)}"></ha-icon>`);
    }
    return parts.join("");
  }

  _autoLine(ctx) {
    const d = this._config.decide;
    if (ctx.paused) return "Szünetel nyitott ablak/ajtó miatt";
    if (ctx.st?.state === "off") {
      if (!d.entity) return "Kikapcsolva";
      const avg = fmt(ctx.decideSt?.state);
      const ind = fmt(ctx.indoorSt?.state);
      const parts = [avg != null ? `tegnap ${avg} °C` : null, ind != null ? `bent ${ind} °C` : null].filter(Boolean);
      return `Nincs fűtési igény · ${d.time}-kor újra dönt${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    return this._scheduleLine(ctx);
  }
}

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; position: relative; }
  .menu { position: absolute; z-index: 20; min-width: 180px; padding: 6px 0; border-radius: 12px;
    background: var(--card-background-color, #1c1c1c); box-shadow: 0 4px 18px rgba(0,0,0,.45);
    border: 1px solid var(--divider-color); }
  .menu[hidden] { display: none; }
  .mitem { display: flex; align-items: center; gap: 14px; padding: 11px 16px; cursor: pointer;
    font-size: .95rem; color: var(--primary-text-color); }
  .mitem:hover { background: rgba(127,127,127,.12); }
  .mitem ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  .title { padding: 14px 16px 0; font-size: 1.25rem; font-weight: 500; color: var(--primary-text-color); }
  .bt { --ha-card-border-width: 0; --ha-card-box-shadow: none; --ha-card-background: transparent; --card-background-color: transparent; }
  .bt > * { display: block; }
  .missing { padding: 24px 16px; color: var(--secondary-text-color); text-align: center; }
  .banner { display: flex; align-items: center; gap: 10px; margin: 10px 12px 0; padding: 10px 12px;
    border-radius: 12px; font-size: .92rem; cursor: pointer; line-height: 1.3; }
  .banner ha-icon { --mdc-icon-size: 22px; flex: none; }
  .banner.info { background: rgba(3,169,244,.16); color: var(--info-color, #039be5); }
  .banner.amber { background: rgba(255,152,0,.16); color: var(--warning-color, #ff9800); }
  .banner.warn { background: rgba(244,67,54,.14); color: var(--error-color, #f44336); }
  .banner.neutral { background: rgba(127,127,127,.12); color: var(--secondary-text-color); }
  .banner span { color: var(--primary-text-color); }
  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 4px 12px 10px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px 5px 7px; border-radius: 18px;
    border: 1px solid var(--divider-color); font-size: .8rem; font-weight: 600; cursor: pointer;
    color: var(--primary-text-color); background: var(--secondary-background-color, transparent); }
  .chip ha-icon { --mdc-icon-size: 17px; color: var(--secondary-text-color); }
  .chip.green ha-icon { color: var(--success-color, #43a047); }
  .chip.amber ha-icon { color: var(--warning-color, #ff9800); }
  .chip.orange ha-icon { color: #ff7043; }
  .chip.red ha-icon { color: var(--error-color, #e53935); }
  .chip.cyan ha-icon { color: #00acc1; }
  .chip.grey { opacity: .7; }
  .chips.plain .chip { border: none; background: transparent; padding: 4px 6px; }
  .chips.plain .chip.orange ha-icon { color: #ff9800; }
  .chip.blink ha-icon { animation: huterm-blink 1s steps(2, start) infinite; }
  @keyframes huterm-blink { to { visibility: hidden; } }
  .autorow { display: flex; align-items: center; gap: 12px; padding: 10px 14px 14px;
    border-top: 1px solid var(--divider-color); }
  .aicon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: none;
    background: rgba(127,127,127,.15); color: var(--secondary-text-color); cursor: pointer; }
  .aicon.on { background: rgba(67,160,71,.2); color: var(--success-color, #43a047); }
  .atext { flex: 1; min-width: 0; cursor: pointer; }
  .aname { font-weight: 600; font-size: .95rem; color: var(--primary-text-color); }
  .aline { font-size: .82rem; color: var(--secondary-text-color); margin-top: 2px; }
  .switch { width: 42px; height: 24px; border-radius: 12px; background: rgba(127,127,127,.4); position: relative;
    cursor: pointer; flex: none; transition: background .2s; }
  .switch .knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
    background: #fff; transition: left .2s; }
  .switch.on { background: var(--success-color, #43a047); }
  .switch.on .knob { left: 21px; }
`;

window.customCards = window.customCards || [];
for (const [tag, cls, name, desc] of [
  ["hu-klima-card", HuKlimaCard, "Klíma kártya (hu-termosztat)", "Better Thermostat UI + ajtónyitás, automatika, jelenlét, fogyasztás."],
  ["hu-futes-card", HuFutesCard, "Fűtés kártya (hu-termosztat)", "Better Thermostat UI + ablaknyitás, kazán, nyári pihenő, gázbecslés, elem/érzékelő-figyelés."],
]) {
  if (!customElements.get(tag)) {
    customElements.define(tag, cls);
    window.customCards.push({ type: tag, name, description: desc, preview: false });
  }
}
console.info(`%c HU-TERMOSZTAT %c v${VERSION} `, "background:#1d5c63;color:#fff", "");
