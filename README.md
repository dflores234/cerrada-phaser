# Lo que esconde la Cerrada — esqueleto Phaser + TypeScript

Juego de misterio en un vecindario: rutinas de vecinos, sigilo, desconfianza, honor y un reloj que corre.
Este proyecto es el punto de partida para la versión "elaborada" en web.

## Arranque

```bash
npm install
npm run dev        # abre http://localhost:5173
npm test           # pruebas del Director (lógica pura, sin Phaser)
npm run typecheck  # tipos
npm run build      # genera dist/ listo para subir a cualquier hosting estático
```

Controles: flechas o WASD, E / Espacio / Enter para interactuar. En celular: joystick y botón.

## Estructura

```
public/assets/
  map.json        Mapa en formato Tiled (ábrelo en Tiled y edítalo ahí)
  tiles.png       Tileset pixel art de 32 px, 16 columnas: pasto, calle, muros, ventanas, muebles, árboles, coches
  char_*.png      Sprites de personajes: 3 frames x 4 direcciones (abajo, izquierda, derecha, arriba)
src/
  core/           Lógica del juego, independiente de Phaser
    types.ts        Tipos del caso y del estado
    Director.ts     Reloj, rutinas, pistas, sospecha, honor, eventos, finales
    Pathfinding.ts  BFS sobre rejilla para que los NPC caminen
    validateCase.ts Revisa que un caso cuadre consigo mismo y con su mapa
    Director.test.ts, validateCase.test.ts
  data/
    caso-helena.json  TODO el contenido del caso: pistas, objetos, vecinos, rutinas, eventos
  scenes/
    WorldScene.ts   Mapa, jugador, NPCs, interacción, noche, guardado
  ui/
    Dialog.ts       Tarjetas de diálogo, cuaderno, acusación y finales (DOM, no canvas)
    ui.css
  main.ts         Configuración de Phaser
```

## Cómo seguir

1. **Arte.** El tileset y los sprites son pixel art generado; puedes editarlos en Aseprite o
   Piskel, o sustituirlos por un pack (Kenney, itch.io). Conserva en Tiled las capas `suelo`,
   `decoracion`, `colision` y `objetos`, y los tipos de objeto `house`, `door`, `zone`, `item`,
   `spot`. Los índices 29 y 30 del tileset son la puerta abierta y cerrada (`DOOR_OPEN` y
   `DOOR_CLOSED` en `WorldScene.ts`).
2. **Personajes.** Cada `char_*.png` tiene 12 frames de 32x32. Si cambias el formato, ajusta
   `anims.create` en `WorldScene.create()`.
3. **Diálogos.** Las preguntas viven en el JSON. Las líneas que empiezan con `*` son narración
   (no diálogo). Para árboles complejos, integra Ink (`inkjs`) o Yarn.
4. **Nuevos casos.** Un caso es un JSON con el mismo esquema (`CaseData`). El Director no sabe
   nada de Helena ni de Marisa; todo sale de `caso-helena.json`. Antes de jugarlo, pásalo por
   `validateCase(caso, mapa)`: comprueba que cada `needs`, pista, objeto, puerta y punto del
   mapa exista de verdad, que las rutinas vayan en orden, que los eventos citen a la gente donde
   está y que no quede nada inalcanzable. `npm test` ya lo hace con el caso de Helena.
5. **Servidor.** `Director` corre igual en Node. Para multijugador o guardado en la nube,
   un servidor con WebSockets puede ser la fuente de verdad del estado y los clientes solo renderizan.
6. **PWA.** Añade `vite-plugin-pwa` para que se instale en el celular y funcione sin conexión.

## Reglas del juego (resumen)

- Desde la calle no ves el interior de una casa: solo si su puerta está abierta o cerrada,
  que es lo que te dice si el dueño está dentro. El techo se desvanece al entrar.
- Registrar un objeto cuesta 15 min; preguntar 10; forzar una puerta 20; esperar 60.
- Si un vecino te ve registrando en su casa: +25 desconfianza. Forzando una puerta: +30.
- A 60 de desconfianza dejan de hablarte; a 70, Marisa limpia su casa y pierdes dos pruebas.
- Presionar (chantaje) saca más verdad, +30 desconfianza, −15 honor. El honor cambia el final.
- Cerca de medianoche pasan cosas que solo ves si estás ahí; una pista desaparece a las 00:05.
