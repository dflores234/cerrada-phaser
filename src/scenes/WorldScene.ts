import Phaser from "phaser";
import { Director } from "../core/Director";
import { findPath } from "../core/Pathfinding";
import type { CaseData, GameState, WorldQuery } from "../core/types";
import { Dialog } from "../ui/Dialog";
import caso from "../data/caso-helena.json";

const T = 32, SAVE_KEY = "cerrada-phaser-v1";
const DATA = caso as unknown as CaseData;

interface NpcSprite { id: string; sprite: Phaser.GameObjects.Sprite; place: string; path: [number, number][]; hidden: boolean }
const CHARS = ["player", "marisa", "tomas", "lucia", "daniela", "rebeca", "aurelio"];
const DOOR_OPEN = 29, DOOR_CLOSED = 30; // índices en tiles.png (ver README)
interface Target { kind: "item" | "npc" | "door"; id: string; label: string }

export class WorldScene extends Phaser.Scene {
  private director!: Director;
  private ui!: Dialog;
  private map!: Phaser.Tilemaps.Tilemap;
  private player!: Phaser.GameObjects.Sprite;
  private ground!: Phaser.Tilemaps.TilemapLayer;
  private npcs: Record<string, NpcSprite> = {};
  private items: Record<string, { x: number; y: number; sprite: Phaser.GameObjects.Text }> = {};
  private houses: Record<string, Phaser.Geom.Rectangle> = {};
  private doors: Record<string, { x: number; y: number }> = {};
  private spots: Record<string, [number, number]> = {};
  private yard!: Phaser.Geom.Rectangle;
  private blocked!: Set<number>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private joy = { x: 0, y: 0 };
  private night!: Phaser.GameObjects.RenderTexture;
  private clockAcc = 0;
  private target: Target | null = null;
  private hadSave = false;

  constructor() { super("world"); }

  preload() {
    this.load.image("tiles", "assets/tiles.png");
    this.load.tilemapTiledJSON("map", "assets/map.json");
    for (const c of CHARS) this.load.spritesheet("char_" + c, `assets/char_${c}.png`, { frameWidth: 32, frameHeight: 32 });
  }

  create() {
    // ----- Director + UI -----
    const saved = this.loadState();
    this.hadSave = !!saved;
    this.director = new Director(DATA, saved);
    this.ui = new Dialog(this.director);
    this.ui.onClose = () => this.renderHud();
    this.director.on((e) => {
      if (e.kind === "scene") this.ui.scene(e.title, e.lines, e.gain);
      if (e.kind === "toast") this.ui.toast(e.text);
      if (e.kind === "tick") { this.renderHud(); this.save(); }
      if (e.kind === "end") this.ui.ending(e.ending, () => this.reset());
    });

    // ----- Mapa -----
    this.map = this.make.tilemap({ key: "map" });
    const tiles = this.map.addTilesetImage("tiles", "tiles")!;
    this.ground = this.map.createLayer("suelo", tiles, 0, 0)!;
    this.map.createLayer("decoracion", tiles, 0, 0)!.setDepth(5);
    // Animaciones de caminar: 3 frames por dirección (abajo, izquierda, derecha, arriba)
    for (const c of CHARS) ["down", "left", "right", "up"].forEach((dir, i) => {
      this.anims.create({ key: `${c}-${dir}`, frames: this.anims.generateFrameNumbers("char_" + c, { start: i * 3, end: i * 3 + 2 }), frameRate: 8, repeat: -1, yoyo: true });
    });
    const col = this.map.getLayer("colision")!.data;
    this.blocked = new Set();
    for (let y = 0; y < this.map.height; y++) for (let x = 0; x < this.map.width; x++) if (col[y][x].index > 0) this.blocked.add(y * this.map.width + x);

    const objs = this.map.getObjectLayer("objetos")!.objects;
    for (const o of objs) {
      const prop = (n: string) => (o.properties as { name: string; value: string }[] | undefined)?.find((p) => p.name === n)?.value;
      if (o.type === "house") {
        this.houses[o.name] = new Phaser.Geom.Rectangle(o.x!, o.y!, o.width!, o.height!);
        this.add.text(o.x! + o.width! / 2, o.y! + o.height! - 10, prop("label") ?? o.name, { fontFamily: "Work Sans, sans-serif", fontSize: "11px", color: "#ffffffcc" }).setOrigin(0.5);
      } else if (o.type === "door") {
        this.doors[o.name] = { x: Math.floor(o.x! / T), y: Math.floor(o.y! / T) };
      } else if (o.type === "zone" && o.name === "yard") {
        this.yard = new Phaser.Geom.Rectangle(o.x!, o.y!, o.width!, o.height!);
      } else if (o.type === "item") {
        const icon = { copa: "🍷", forense: "📄", reja: "🔓", sobre: "✉️", recorte: "🗄️", vitrina: "🥂", ceniza: "🔥", guantes: "🧤", ampolleta: "💼", suspension: "📬", mensajes: "📱", ventana: "🪟", video: "📹", hermanas: "📦" }[o.name] ?? "❔";
        this.add.circle(o.x!, o.y!, 12, 0xffffff, 0.18).setDepth(6);
        const t = this.add.text(o.x!, o.y!, icon, { fontSize: "16px" }).setOrigin(0.5).setDepth(7);
        this.items[o.name] = { x: o.x!, y: o.y!, sprite: t };
      } else if (o.type === "spot") {
        this.spots[o.name] = [Math.floor(o.x! / T), Math.floor(o.y! / T)];
      }
    }

    // ----- Personajes -----
    this.player = this.person("player");
    const [px, py] = this.spots.player; this.player.setPosition(px * T + T / 2, py * T + T / 2);
    const st = this.director.state;
    if (st.px !== undefined && st.py !== undefined) this.player.setPosition(st.px, st.py);
    for (const id in DATA.npcs) {
      const n = DATA.npcs[id];
      const s = this.person(id);
      this.npcs[id] = { id, sprite: s, place: "", path: [], hidden: false };
    }
    this.snapNpcs();

    // ----- Noche -----
    const g = this.textures.createCanvas("light", 320, 320)!;
    const ctx = g.context, grad = ctx.createRadialGradient(160, 160, 10, 160, 160, 160);
    grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 320, 320); g.refresh();
    this.night = this.add.renderTexture(0, 0, this.map.widthInPixels, this.map.heightInPixels).setOrigin(0).setDepth(50);

    // ----- Cámara y entrada -----
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setZoom(Math.max(1.1, Math.min(this.scale.width, this.scale.height) / (T * 11)));
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D,E,SPACE,ENTER") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on("keydown-E", () => this.interact());
    this.input.keyboard!.on("keydown-SPACE", () => this.interact());
    this.input.keyboard!.on("keydown-ENTER", () => this.interact());
    this.bindDom();

    this.renderHud();
    if (this.director.state.ended) this.ui.ending(this.director.state.ended, () => this.reset());
    else if (this.hadSave) this.ui.resume(() => this.reset());
    else this.ui.intro();
  }

  // ---------- Helpers ----------
  private person(key: string) {
    return this.add.sprite(0, 0, "char_" + key, 0).setOrigin(0.5, 0.75).setDepth(10);
  }
  /** Reproduce la animación según el vector de movimiento, o se queda quieto mirando en la última dirección. */
  private animate(sp: Phaser.GameObjects.Sprite, key: string, dx: number, dy: number) {
    if (!dx && !dy) { if (sp.anims.isPlaying) { const d = sp.anims.currentAnim!.key.split("-")[1]; sp.anims.stop(); sp.setFrame(["down", "left", "right", "up"].indexOf(d) * 3); } return; }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const k = `${key}-${dir}`; if (sp.anims.currentAnim?.key !== k || !sp.anims.isPlaying) sp.play(k, true);
  }
  private tileAt(x: number, y: number) { return [Math.floor(x / T), Math.floor(y / T)] as [number, number]; }
  private doorTile(tx: number, ty: number) { for (const id in this.doors) if (this.doors[id].x === tx && this.doors[id].y === ty) return id; return null; }
  private passable(tx: number, ty: number, isNpc: boolean) {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    if (this.blocked.has(ty * this.map.width + tx)) return false;
    if (!isNpc) { const d = this.doorTile(tx, ty); if (d && !this.director.doorOpen(d)) return false; }
    return true;
  }
  zoneOf(x: number, y: number): string {
    for (const id in this.houses) if (this.houses[id].contains(x, y)) return id;
    if (this.yard.contains(x, y)) return "yard";
    return "out";
  }
  private world(): WorldQuery {
    const px = this.player.x, py = this.player.y;
    return {
      playerZone: () => this.zoneOf(px, py),
      distanceTo: (n) => this.npcs[n].hidden ? Infinity : Phaser.Math.Distance.Between(px, py, this.npcs[n].sprite.x, this.npcs[n].sprite.y) / T,
      witnesses: (r) => {
        const z = this.zoneOf(px, py), out: string[] = [];
        for (const id in this.npcs) {
          const n = this.npcs[id]; if (n.hidden) continue;
          const nz = this.zoneOf(n.sprite.x, n.sprite.y), d = Phaser.Math.Distance.Between(px, py, n.sprite.x, n.sprite.y) / T;
          const sameArea = nz === z || (z === "out" && nz === "yard") || (z === "yard" && nz === "out");
          if (d < r && sameArea) out.push(id);
        }
        return out;
      },
    };
  }

  // ---------- NPCs ----------
  private spotFor(id: string, place: string): [number, number] {
    if (place === "home") return this.spots["home_" + id];
    return this.spots[place] ?? this.spots["home_" + id];
  }
  private snapNpcs() {
    for (const id in this.npcs) {
      const n = this.npcs[id], pl = this.director.placeOf(id);
      const [tx, ty] = this.spotFor(id, pl);
      n.place = pl; n.path = []; n.hidden = pl === "away";
      n.sprite.setPosition(tx * T + T / 2, ty * T + T / 2).setVisible(!n.hidden);
    }
  }
  private updateNpcs(dt: number) {
    for (const id in this.npcs) {
      const n = this.npcs[id], pl = this.director.placeOf(id);
      if (pl !== n.place) {
        n.place = pl;
        if (n.hidden) { n.hidden = false; const [ax, ay] = this.spots.away; n.sprite.setPosition(ax * T + T / 2, ay * T + T / 2).setVisible(true); }
        const [sx, sy] = this.tileAt(n.sprite.x, n.sprite.y), [tx, ty] = this.spotFor(id, pl);
        n.path = findPath(this.map.width, this.map.height, (x, y) => this.passable(x, y, true), sx, sy, tx, ty);
      }
      if (!n.path.length) { this.animate(n.sprite, id, 0, 0); continue; }
      const [tx, ty] = n.path[0], gx = tx * T + T / 2, gy = ty * T + T / 2;
      this.animate(n.sprite, id, gx - n.sprite.x, gy - n.sprite.y);
      const d = Phaser.Math.Distance.Between(n.sprite.x, n.sprite.y, gx, gy), sp = 90 * dt;
      if (d <= sp) { n.sprite.setPosition(gx, gy); n.path.shift(); if (!n.path.length && n.place === "away") { n.hidden = true; n.sprite.setVisible(false); } }
      else n.sprite.setPosition(n.sprite.x + (gx - n.sprite.x) / d * sp, n.sprite.y + (gy - n.sprite.y) / d * sp);
    }
  }

  // ---------- Jugador ----------
  private movePlayer(dt: number) {
    let dx = (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    let dy = (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);
    if (this.joy.x || this.joy.y) { dx = this.joy.x; dy = this.joy.y; }
    const l = Math.hypot(dx, dy); this.animate(this.player, "player", dx, dy); if (!l) return; if (l > 1) { dx /= l; dy /= l; }
    const sp = 140 * dt, r = 9;
    const ok = (x: number, y: number) => [[-r, -r], [r, -r], [-r, r], [r, r]].every(([a, b]) => { const [tx, ty] = this.tileAt(x + a, y + b); return this.passable(tx, ty, false); });
    const nx = this.player.x + dx * sp, ny = this.player.y + dy * sp;
    if (ok(nx, this.player.y)) this.player.x = nx;
    if (ok(this.player.x, ny)) this.player.y = ny;
  }
  private findTarget(): Target | null {
    const px = this.player.x, py = this.player.y; let best: Target | null = null, bd = 1.4;
    const s = this.director.state;
    for (const id in this.items) {
      if (s.gone.includes(id) && !s.found.includes(id)) continue;
      const d = Phaser.Math.Distance.Between(px, py, this.items[id].x, this.items[id].y) / T;
      if (d < bd) { bd = d; best = { kind: "item", id, label: (s.found.includes(id) ? "Releer: " : "Registrar: ") + DATA.items[id].label }; }
    }
    for (const id in this.npcs) {
      const n = this.npcs[id]; if (n.hidden) continue;
      const d = Phaser.Math.Distance.Between(px, py, n.sprite.x, n.sprite.y) / T;
      if (d < bd) { bd = d; best = { kind: "npc", id, label: "Hablar con " + DATA.npcs[id].name }; }
    }
    for (const id in this.doors) {
      const dr = this.doors[id], d = Phaser.Math.Distance.Between(px, py, dr.x * T + T / 2, dr.y * T + T / 2) / T;
      if (d < 1.6 && !this.director.doorOpen(id) && d < bd + 0.3) best = { kind: "door", id, label: "Forzar la puerta" };
    }
    return best;
  }
  private interact() {
    if (this.ui.paused || this.director.state.ended || !this.target) return;
    const t = this.target, w = this.world();
    if (t.kind === "item") this.director.examine(t.id, w);
    else if (t.kind === "door") this.director.forceDoor(t.id, w);
    else this.talk(t.id);
    this.savePos();
  }
  private talk(npc: string) {
    this.ui.talk(npc,
      (qid) => { const lines = this.director.press(npc, qid, this.world()); const q = DATA.npcs[npc].questions.find((x) => x.id === qid)!; this.ui.answer(npc, q.q, lines, true, this.unlockText("p_" + qid), () => this.talk(npc)); },
      (qid) => { const lines = this.director.ask(npc, qid, this.world()); const q = DATA.npcs[npc].questions.find((x) => x.id === qid)!; this.ui.answer(npc, q.q, lines, false, this.unlockText(qid), () => this.talk(npc)); });
  }
  private unlockText(key: string) {
    const u = Object.entries(DATA.items).filter(([id, it]) => it.needs?.includes(key) && !this.director.state.found.includes(id)).map(([, it]) => it.label);
    return u.length ? "Ahora puedes registrar: " + u.join(", ") : null;
  }

  // ---------- HUD / DOM ----------
  private bindDom() {
    const $ = (id: string) => document.getElementById(id)!;
    $("bWait").onclick = () => { if (this.ui.paused) return; this.director.advance(DATA.costs.wait, this.world()); this.snapNpcs(); this.ui.toast("Pasa una hora."); };
    $("bNotes").onclick = () => { if (!this.ui.paused) this.ui.notes(() => this.reset()); };
    $("bAccuse").onclick = () => { if (!this.ui.paused) this.ui.accuse(); };
    $("act").addEventListener("pointerdown", (e) => { e.preventDefault(); this.interact(); });
    const stick = $("stick"), knob = $("knob"); let sid: number | null = null;
    const set = (dx: number, dy: number) => { const r = 38, l = Math.hypot(dx, dy) || 1, k = Math.min(l, r); dx = dx / l * k; dy = dy / l * k; knob.style.transform = `translate(${dx}px,${dy}px)`; this.joy = { x: dx / r, y: dy / r }; };
    stick.addEventListener("pointerdown", (e) => { sid = e.pointerId; stick.setPointerCapture(sid); const b = stick.getBoundingClientRect(); set(e.clientX - b.left - 60, e.clientY - b.top - 60); });
    stick.addEventListener("pointermove", (e) => { if (e.pointerId !== sid) return; const b = stick.getBoundingClientRect(); set(e.clientX - b.left - 60, e.clientY - b.top - 60); });
    const end = (e: PointerEvent) => { if (e.pointerId !== sid) return; sid = null; this.joy = { x: 0, y: 0 }; knob.style.transform = ""; };
    stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);
  }
  private renderHud() {
    const d = this.director, c = document.getElementById("clock")!;
    c.innerHTML = `${d.clock()}<small>${d.dayLabel()} · ${d.state.found.length} ${d.state.found.length === 1 ? "pista" : "pistas"} · ${d.reputation()}</small>`;
    c.classList.toggle("low", DATA.endMinute - d.state.time <= 180);
    for (const id in this.doors) this.ground.putTileAt(d.doorOpen(id) ? DOOR_OPEN : DOOR_CLOSED, this.doors[id].x, this.doors[id].y);
    for (const id in this.items) {
      const found = d.state.found.includes(id), gone = d.state.gone.includes(id) && !found;
      this.items[id].sprite.setVisible(!gone).setAlpha(found ? 0.45 : 1);
    }
  }

  // ---------- Guardado ----------
  private loadState(): Partial<GameState> | undefined {
    try { const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : undefined; } catch { return undefined; }
  }
  private savePos() { const s = this.director.state; s.px = this.player.x; s.py = this.player.y; }
  private save() { try { this.savePos(); localStorage.setItem(SAVE_KEY, JSON.stringify(this.director.state)); } catch { /* sin almacenamiento */ } }
  private reset() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } this.scene.restart(); }

  // ---------- Loop ----------
  update(_t: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    if (!this.ui.paused && !this.director.state.ended) {
      this.movePlayer(dt);
      this.clockAcc += dt;
      if (this.clockAcc >= 0.5) { this.clockAcc -= 0.5; this.director.advance(1, this.world()); }
      this.updateNpcs(dt);
      this.player.setDepth(10 + this.player.y / 10000);
      this.target = this.findTarget();
      const hint = document.getElementById("hint")!, act = document.getElementById("act") as HTMLButtonElement;
      hint.textContent = this.target?.label ?? ""; hint.classList.toggle("on", !!this.target);
      act.disabled = !this.target; act.textContent = this.target ? ({ npc: "💬", door: "🔓", item: "🔍" })[this.target.kind] : "·";
    }
    // Noche: oscurece todo y abre un círculo de luz alrededor del jugador
    const dark = this.director.darkness();
    this.night.clear();
    if (dark > 0) {
      this.night.fill(0x05101a, dark * 0.8);
      if (dark > 0.4) this.night.erase("light", this.player.x - 160, this.player.y - 160);
    }
  }
}
