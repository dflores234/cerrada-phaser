import type { Director } from "../core/Director";
import type { Ending } from "../core/types";

/** Capa de interfaz en DOM: tarjetas de diálogo, cuaderno, acusación y finales. */
export class Dialog {
  private ov = document.getElementById("ov")!;
  private card = document.getElementById("card")!;
  paused = false;
  onClose: () => void = () => {};

  constructor(private d: Director) {}

  open(html: string) {
    this.card.innerHTML = html;
    this.ov.classList.add("open");
    this.paused = true;
    this.card.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = () => this.close()));
    this.card.querySelector<HTMLElement>("button,input")?.focus();
  }
  close() {
    if (this.d.state.ended) return;
    this.ov.classList.remove("open");
    this.paused = false;
    this.onClose();
  }
  private esc(s: string) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)); }
  private line(x: string) { return x.startsWith("*") ? `<p>${this.esc(x.slice(1))}</p>` : `<p class="say">${this.esc(x)}</p>`; }

  scene(title: string, lines: string[], gain?: string) {
    this.open(`<p class="who">${this.esc(title)}</p>${lines.map((l) => `<p>${this.esc(l)}</p>`).join("")}${gain ? `<p class="gain">${this.esc(gain)}</p>` : ""}<div class="actions"><button class="ghost" data-close>Seguir</button></div>`);
  }

  toast(text: string) {
    const t = document.getElementById("toast")!;
    t.textContent = text; t.classList.add("on");
    clearTimeout((t as any)._t); (t as any)._t = setTimeout(() => t.classList.remove("on"), 3500);
  }

  intro() {
    this.open(`<h2>Helena Vidal no se ahogó sola</h2>
<p>El sábado, las cinco casas de la Cerrada de los Almendros cenaron en casa de Marisa Ocampo. El domingo a las 6:10, el jardinero encontró a Helena flotando en su alberca. La policía ya decidió: accidente.</p>
<p>Tú eres Inés, su mejor amiga. Sabes que Helena casi no bebía.</p>
<p>Tienes hasta el lunes a las 6:00. Recorre la Cerrada, entra a las casas y registra lo que encuentres. Las pistas abren preguntas nuevas.</p>
<p class="sub">Cada vecino tiene su rutina. Si están en casa te abren la puerta; si te ven husmeando, dejan de hablarte. Si no están, puedes forzar la puerta mientras nadie te vea. Puedes preguntar con calma o presionar: saca más verdad, pero cada vez te pareces más a ellos.</p>
<p class="sub">Celular: joystick a la izquierda, botón a la derecha. Computadora: flechas o WASD, E o Espacio para interactuar.</p>
<div class="actions"><button class="primary" data-close>Empezar</button></div>`);
  }

  /** Al volver a una partida guardada: continuar o empezar limpio, pero elegido por quien juega. */
  resume(onReset: () => void) {
    const d = this.d, s = d.state, n = s.found.length;
    const left = Math.round((d.data.endMinute - s.time) / 60);
    this.open(`<h2>Lo que esconde la Cerrada</h2>
<p>Dejaste la investigación el ${d.dayLabel()} a las ${d.clock()}, con ${n} ${n === 1 ? "pista" : "pistas"} y fama de ${this.esc(d.reputation())}.</p>
<p class="sub">${left > 0 ? `Te quedan ${left} ${left === 1 ? "hora" : "horas"} hasta que archiven el caso.` : "Ya casi amanece."}</p>
<div class="actions"><button class="ghost" id="rNew">Empezar de nuevo</button><button class="primary" data-close>Continuar</button></div>`);
    this.card.querySelector<HTMLElement>("#rNew")!.onclick = () => {
      if (confirm("¿Empezar de nuevo? Se borrará tu avance.")) { onReset(); this.close(); }
    };
  }

  talk(npc: string, onPress: (qid: string) => void, onAsk: (qid: string) => void) {
    const d = this.d, p = d.data.npcs[npc], s = d.state;
    if (d.refuses(npc)) {
      const q = p.questions.find((q) => q.press && !s.asked.includes("p_" + q.id) && (!q.needs || d.has(q.needs)));
      if (q && s.sus[npc] < 90) {
        this.open(`<p class="who">${p.name}</p><p class="say">No tengo nada que decirte, Inés.</p><p>Intenta cerrar la puerta. Podrías meter el pie.</p><div class="actions"><button class="ghost" data-close>Dejarla en paz</button><button class="primary" id="pf">Meter el pie y presionar</button></div>`);
        this.card.querySelector<HTMLElement>("#pf")!.onclick = () => onPress(q.id);
      } else {
        this.open(`<p class="who">${p.name}</p><p class="say">No tengo nada que decirte, Inés.</p><p>Cierra la puerta. Has husmeado demasiado cerca.</p><div class="actions"><button class="ghost" data-close>Irte</button></div>`);
      }
      return;
    }
    const qs = d.availableQuestions(npc), hidden = p.questions.length - qs.length;
    this.open(`<p class="who">${p.name}</p><p class="sub">${p.role}</p><div class="qs">${qs.map((q) => {
      const done = s.asked.includes(q.id), pd = s.asked.includes("p_" + q.id);
      return `<button class="q ${done ? "done" : ""} ${!done && q.needs ? "new" : ""}" data-q="${q.id}">${this.esc(q.q)}</button>` +
        (q.press && !pd ? `<button class="q press" data-p="${q.id}">Presionar: «${this.esc(q.q.replace(/[?¿.]/g, ""))}… y lo sé todo.»</button>` : "");
    }).join("")}</div>${hidden ? `<p class="sub" style="margin-top:8px">Hay ${hidden === 1 ? "algo más" : hidden + " cosas más"} que podrías preguntarle si tuvieras pruebas.</p>` : ""}
<div class="sus">Desconfianza <i style="width:${s.sus[npc]}px"></i></div><div class="actions"><button class="ghost" data-close>Despedirte</button></div>`);
    this.card.querySelectorAll<HTMLElement>("[data-q]").forEach((b) => (b.onclick = () => onAsk(b.dataset.q!)));
    this.card.querySelectorAll<HTMLElement>("[data-p]").forEach((b) => (b.onclick = () => onPress(b.dataset.p!)));
  }

  answer(npc: string, question: string, lines: string[], pressed: boolean, gain: string | null, onBack: () => void) {
    const p = this.d.data.npcs[npc];
    const lead = pressed
      ? `<p>Te acercas más de lo debido y bajas la voz: «${this.esc(question.replace(/[?¿.]/g, ""))}… y lo sé todo. ¿Prefieres que lo sepan los demás?»</p>`
      : `<p>Le preguntas: «${this.esc(question)}»</p>`;
    this.open(`<p class="who">${p.name}</p>${lead}${lines.map((l) => this.line(l)).join("")}${gain ? `<p class="gain">${this.esc(gain)}</p>` : ""}${pressed ? `<p class="sub">Conseguiste más de lo que te habría contado. Y algo de ti se quedó en esa habitación.</p>` : ""}<div class="actions"><button class="ghost" id="back">Seguir hablando</button><button class="primary" data-close>Despedirte</button></div>`);
    this.card.querySelector<HTMLElement>("#back")!.onclick = onBack;
  }

  notes(onReset: () => void) {
    const d = this.d, s = d.state;
    const list = Object.keys(d.data.clues).filter((k) => s.found.includes(k));
    const talks: { p: string; a: string }[] = [];
    for (const id in d.data.npcs) for (const q of d.data.npcs[id].questions) if (s.asked.includes(q.id)) talks.push({ p: d.data.npcs[id].name, a: q.a.filter((x) => !x.startsWith("*")).join(" ") });
    this.open(`<h2>Tu cuaderno</h2>${list.length ? list.map((k) => `<div class="note ${d.data.clues[k].key ? "key" : ""}"><b>${d.data.clues[k].title}</b><p>${d.data.clues[k].text}</p></div>`).join("") : `<p class="sub">Todavía no has encontrado nada.</p>`}
${talks.length ? `<h2 style="font-size:1.3rem">Lo que te dijeron</h2>` + talks.map((t) => `<div class="note"><b>${t.p}</b><p>«${this.esc(t.a)}»</p></div>`).join("") : ""}
<div class="actions"><button class="ghost" id="nReset">Nueva partida</button><button class="primary" data-close>Cerrar</button></div>`);
    this.card.querySelector<HTMLElement>("#nReset")!.onclick = () => { if (confirm("¿Empezar de nuevo? Se borrará tu avance.")) onReset(); this.close(); };
  }

  accuse() {
    const d = this.d;
    const r = (n: string, o: { id: string; label: string }[]) => o.map((x) => `<label class="opt"><input type="radio" name="${n}" value="${x.id}"><span>${x.label}</span></label>`).join("");
    const who = Object.entries(d.data.npcs).map(([id, p]) => ({ id, label: p.name }));
    this.open(`<h2>La acusación</h2><p class="sub">Solo tienes una oportunidad. Si te equivocas, alguien inocente pagará.</p>
${d.state.found.length < 6 ? `<p class="sub" style="color:var(--blood)">Llevas ${d.state.found.length} pistas. Con tan poco, la Fiscalía no te va a escuchar.</p>` : ""}
<fieldset><legend>¿Quién mató a Helena?</legend>${r("who", who)}</fieldset><fieldset><legend>¿Cómo?</legend>${r("how", d.data.howOptions)}</fieldset><fieldset><legend>¿Por qué?</legend>${r("why", d.data.whyOptions)}</fieldset>
<div class="actions"><button class="ghost" data-close>Todavía no</button><button class="primary" id="go" disabled>Presentar la acusación</button></div>`);
    const go = this.card.querySelector<HTMLButtonElement>("#go")!;
    const v = (n: string) => this.card.querySelector<HTMLInputElement>(`input[name=${n}]:checked`)?.value;
    this.card.querySelectorAll("input").forEach((i) => (i.onchange = () => (go.disabled = !(v("who") && v("how") && v("why")))));
    go.onclick = () => d.accuse(v("who")!, v("how")!, v("why")!);
  }

  ending(e: Ending, onAgain: () => void) {
    const d = this.d, n = d.state.found.length, who = e.startsWith("wrong:") ? d.data.npcs[e.slice(6)] : null;
    const t: Record<string, string> = {
      "perfect": `<h2>La anfitriona perfecta</h2><p>Pones las pruebas sobre la mesa de la cocina de Marisa. Se sirve un café antes de hablar. No le tiembla el pulso.</p><p class="say">«Helena me enseñó la carta en el postre, como si me estuviera haciendo un favor. Le serví otra copa. Solo quería que durmiera… y que esa carta no llegara a ningún lado.»</p><p>La Fiscalía reabre el caso de Ernesto Lara. La casa 1 queda vacía. En la Cerrada nadie vuelve a hacer cenas.</p>`,
      "perfect-light": `<h2>La anfitriona perfecta</h2><p>Pones las pruebas sobre la mesa. Marisa confiesa sin que le tiemble el pulso.</p><p>La Fiscalía reabre el caso de Ernesto Lara. Un mes después, Rebeca organiza una cena en la casa 5. Pone un lugar de más en la mesa y nadie pregunta para quién es.</p>`,
      "perfect-dark": `<h2>A cualquier precio</h2><p>Marisa es detenida el martes. Las pruebas son sólidas; la mitad las sacaste a la fuerza, puerta por puerta, amenaza por amenaza.</p><p>Lucía se muda sin despedirse. Daniela cambia la cerradura. Rebeca te saluda desde lejos, como se saluda a alguien de quien se cuida.</p><p>Cuando pasas frente a las ventanas, las cortinas se mueven igual que se movían con Marisa.</p>`,
      "partial": `<h2>Sabías quién, pero no cómo</h2><p>Acusas a Marisa. Tienes razón, y ella lo sabe. Pero tu historia tiene huecos, y su abogado los encuentra todos.</p><p>Al día siguiente hay en tu puerta pan recién horneado y una tarjeta: «Para la mejor vecina». No la abres. Tampoco duermes.</p>`,
      "timeout": `<h2>Caso cerrado</h2><p>El lunes al amanecer, el expediente se archiva como «muerte accidental por inmersión».</p><p>En el funeral, Marisa te abraza un poco más de lo necesario: «Qué bueno que ya podemos dejar esto atrás».</p>`,
    };
    const html = who ? `<h2>Te equivocaste</h2><p>Acusas a ${who.name}. La noticia recorre la Cerrada en una hora; las cortinas se mueven en cada ventana.</p><p>Esa noche, en la casa 1, Marisa Ocampo lava sus copas una por una. Once.</p>` : t[e];
    this.open(`${html}<p class="sub">${n} pistas · ${d.reputation()}</p><div class="actions"><button class="primary" id="again">Jugar de nuevo</button></div>`);
    this.card.querySelector<HTMLElement>("#again")!.onclick = onAgain;
  }
}
