import Phaser from "phaser";
import { WorldScene } from "./scenes/WorldScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0a1416",
  pixelArt: true,
  render: { antialias: false, roundPixels: true },
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [WorldScene],
});
