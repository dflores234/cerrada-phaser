import Phaser from "phaser";
import { WorldScene } from "./scenes/WorldScene";

const config = (type: number): Phaser.Types.Core.GameConfig => ({
  type,
  parent: "game",
  backgroundColor: "#0a1416",
  pixelArt: true,
  render: { antialias: false, roundPixels: true },
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [WorldScene],
});

/**
 * Cuando el renderer no levanta (WebGL puede fallar al crear el framebuffer), Phaser deja
 * el canvas en 0x0: el jugador solo ve negro, pero la escena sigue viva y el reloj del caso
 * corre a ciegas y se autoguarda. Así que vigilamos el arranque, reintentamos con Canvas y,
 * si tampoco, lo decimos en vez de dejar un rectángulo oscuro.
 */
const booted = () => {
  const c = document.querySelector<HTMLCanvasElement>("#game canvas");
  return !!c && c.width > 0 && c.height > 0;
};

const fail = (msg: string) => {
  const host = document.getElementById("game")!;
  host.innerHTML = `<div class="boot"><h2>No se pudo abrir la Cerrada</h2><p>${msg}</p><div class="actions"><button class="primary" id="bootRetry">Reintentar</button></div></div>`;
  document.getElementById("bootRetry")!.onclick = () => location.reload();
};

let game = new Phaser.Game(config(Phaser.AUTO));
let retried = false;

const check = () => {
  if (booted()) return;
  game.destroy(true); // detiene el reloj, que si no seguiría avanzando sobre un juego invisible
  if (retried) {
    fail("Tu navegador no pudo crear el lienzo del juego, ni con WebGL ni sin él.");
    return;
  }
  retried = true;
  setTimeout(() => { game = new Phaser.Game(config(Phaser.CANVAS)); setTimeout(check, 3000); }, 100);
};
setTimeout(check, 3000);
