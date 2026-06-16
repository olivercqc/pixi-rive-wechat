# pixi-rive-wechat

Composite [Rive](https://rive.app) animations into **PixiJS 8** — including the **WeChat mini-game** (微信小游戏) runtime, a path with no official support and several non-obvious traps.

The same `rive.wasm` runs **any** `.riv`; only the `.riv` changes. One small helper handles the rendering loop and the platform quirks for you.

> Verified on `pixi.js@8.19` + `@rive-app/canvas-advanced@2.38` in the browser **and** in 微信开发者工具 (WeChat DevTools). Real-device performance is not yet measured — see [Caveats](#performance--caveats).

## Why

This sits at the intersection of three under-served spots:

- **No official Rive runtime for WeChat mini-games** (Rive targets Web / iOS / Android / Flutter / Unity). WeChat has no DOM/BOM, only `wx`, and exposes WebAssembly as `WXWebAssembly`.
- **No maintained Rive ↔ PixiJS 8 integration** — existing community packages target Pixi 7 + old Rive.
- **The traps are silent** — each one looks like "Rive is broken" until you find the cause. This package bakes in the fixes.

## Install

```bash
npm i pixi-rive-wechat
# peers:
npm i pixi.js @rive-app/canvas-advanced
```

`pixi.js` and `@rive-app/canvas-advanced` are peer dependencies. The latter ships `rive.wasm` (~1.9 MB) next to its JS.

## Quick start — browser

```ts
import { Application } from "pixi.js";
import { createRiveSprite } from "pixi-rive-wechat";

// Use new URL(...) — a `*.wasm?url` static import resolves to undefined in Vite dev.
const wasmUrl = new URL("./assets/rive.wasm", import.meta.url).href;
const rivUrl = new URL("./assets/your.riv", import.meta.url).href;

const app = new Application();
await app.init({ width: 420, height: 720, background: "#f3e6ce" });
document.body.appendChild(app.canvas);

const rive = await createRiveSprite({
  width: 512,
  height: 512,
  wasmUrl,
  loadFile: async () => new Uint8Array(await (await fetch(rivUrl)).arrayBuffer())
});

rive.sprite.position.set(app.screen.width / 2, app.screen.height / 2);
app.stage.addChild(rive.sprite); // it self-drives and animates

rive.setInput("speed", 2);  // drive a state-machine number/bool input by name
rive.fireTrigger("tap");    // fire a trigger input by name
// rive.destroy();          // when removing
```

## Quick start — WeChat mini-game

Same `createRiveSprite`; only the wasm/file sources differ.

```ts
import "../adapter/weapp-adapter.js"; // your Pixi-on-WeChat adapter
import {
  createRiveSprite,
  installWechatWasmShim,
  loadWechatSubpackage,
  base64ToUint8Array
} from "pixi-rive-wechat";
import { RIV_BASE64 } from "./your.riv.b64"; // generated at build time (see below)

const WASM_PATH = "rive/rive.wasm"; // in a subpackage (see Packaging)

installWechatWasmShim(WASM_PATH);
// ... initialise your Pixi Application on the wx canvas ...

await loadWechatSubpackage("rive");
const wasmBinary = wx.getFileSystemManager().readFileSync(WASM_PATH) as ArrayBuffer;

const rive = await createRiveSprite({
  width: 512,
  height: 512,
  wasmBinary,
  loadFile: async () => base64ToUint8Array(RIV_BASE64),
  createCanvas: (w, h) => {
    const c = (wx as unknown as { createCanvas(): HTMLCanvasElement }).createCanvas();
    c.width = w;
    c.height = h;
    return c;
  }
});
```

### Packaging on WeChat

1. **Inline the `.riv`.** WeChat DevTools (`ignoreDevUnusedFiles`) strips package files of unknown type, so a `.riv` disappears (`readFileSync` → `permission denied`). Embed it as base64 at build time and decode with `base64ToUint8Array`:

   ```js
   // node tools/embed-riv.mjs
   import { readFileSync, writeFileSync } from "node:fs";
   const b64 = readFileSync("assets/your.riv").toString("base64");
   writeFileSync("src/your.riv.b64.ts", `export const RIV_BASE64 = "${b64}";\n`);
   ```

2. **Subpackage the wasm.** It is ~1.9 MB; the main package limit is 4 MB. Put it in a subpackage and load on demand. A mini-game subpackage root **must contain a `game.js`** (even an empty one) or compilation fails with `未找到 .../game.js`.

   ```jsonc
   // game.json
   { "subpackages": [{ "name": "rive", "root": "rive/" }] }
   // ship: rive/rive.wasm  +  rive/game.js (empty)
   ```

## API

### `createRiveSprite(options): Promise<RiveSpriteHandle>`

| option | type | notes |
| --- | --- | --- |
| `width` / `height` | `number` | offscreen render size (default 512) |
| `wasmUrl` | `string` | browser: URL to `rive.wasm` |
| `wasmBinary` | `ArrayBuffer` | WeChat: wasm bytes |
| `loadFile` | `() => Promise<Uint8Array>` | returns the `.riv` bytes |
| `createCanvas` | `(w, h) => HTMLCanvasElement` | override offscreen canvas (WeChat: `wx.createCanvas()`) |

`RiveSpriteHandle`:

- `sprite: Sprite` — add to your stage.
- `canvas: HTMLCanvasElement` — the offscreen canvas backing the texture.
- `setInput(name, value)` — set a state-machine number/bool input (no-op if absent).
- `fireTrigger(name)` — fire a trigger input (no-op if absent).
- `destroy()` — stop the loop and release resources.

Other helpers: `base64ToUint8Array`, `installWechatWasmShim`, `loadWechatSubpackage`.

## How it works (and the traps it bakes in)

```
Rive runtime ──renders──▶ offscreen canvas ──upload/frame──▶ Pixi Texture ──▶ Pixi Sprite
```

- **Drive with `rive.requestAnimationFrame`, not your own ticker.** Modern Rive renders via WebGL2 and only commits a frame inside its own RAF; an external loop draws **0 pixels** with no error.
- **Build `CanvasSource` explicitly.** `Texture.from(canvas)` fails on a WeChat canvas (`Could not find a source type for [object HTMLElement]`).
- **WeChat `WebAssembly` → `WXWebAssembly`** (path-only) via `installWechatWasmShim`.
- **`.riv` inlined**, wasm **subpackaged** (see Packaging).
- **Vite**: use `new URL(...)`, not `*.wasm?url`.

## Performance & caveats

- **Per-frame texture upload** (`texImage2D`). Fine for a few sprites; profile if you have many. **Real-device perf not yet measured.**
- **Pin the Rive version** — `@rive-app/canvas-advanced` changes internals between versions (the WebGL2 / RAF behavior is version-dependent). Tested on `2.38`.
- Picks `defaultArtboard()` + state machine index 0, `Fit.contain` / `Alignment.center`. Open an issue / PR if you need artboard/state-machine selection or other fits.

## Prior art

- Rive's official Pixi guidance: render to a canvas, upload as a texture (no first-class plugin).
- `pixi-rive`, `@qva/pixi-rive` and forks — Pixi 7 + older Rive, largely unmaintained. This package adds the **Pixi 8** and **WeChat mini-game** pieces.

## License

[MIT](./LICENSE).
