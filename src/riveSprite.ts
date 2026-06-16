import RiveFactory, { type RiveCanvas, type SMIInput } from "@rive-app/canvas-advanced";
import { CanvasSource, Sprite, Texture } from "pixi.js";

export interface RiveSpriteOptions {
  width?: number;
  height?: number;
  /** Browser: URL to rive.wasm (use `new URL(...)`, not a `*.wasm?url` import in Vite dev). */
  wasmUrl?: string;
  /** WeChat: the wasm bytes (read from the package). */
  wasmBinary?: ArrayBuffer;
  /** Returns the `.riv` bytes (browser: fetch; WeChat: FileSystemManager / inlined base64). */
  loadFile: () => Promise<Uint8Array>;
  /** Override offscreen canvas creation (WeChat: `wx.createCanvas()`). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}

export interface RiveSpriteHandle {
  /** The Pixi sprite — add it to your stage / a container. */
  sprite: Sprite;
  /** The offscreen canvas Rive renders into (backs the sprite texture). */
  canvas: HTMLCanvasElement;
  /** Set a state-machine input by name (number/bool). No-op if absent. */
  setInput(name: string, value: number | boolean): void;
  /** Fire a trigger input by name. No-op if absent. */
  fireTrigger(name: string): void;
  /** Stop the loop and release Rive + Pixi resources. */
  destroy(): void;
}

function createElementCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

type AlignableRenderer = ReturnType<RiveCanvas["makeRenderer"]> & {
  align(fit: unknown, alignment: unknown, frame: unknown, content: unknown): void;
};

/**
 * Composite a Rive `.riv` into a PixiJS 8 sprite. Works in the browser and in the
 * WeChat mini-game runtime; inject platform specifics via the options.
 */
export async function createRiveSprite(options: RiveSpriteOptions): Promise<RiveSpriteHandle> {
  const width = options.width ?? 512;
  const height = options.height ?? 512;

  if (!options.wasmBinary && options.wasmUrl === undefined) {
    throw new Error("createRiveSprite: provide wasmUrl (browser) or wasmBinary (WeChat)");
  }

  const rive: RiveCanvas = await RiveFactory({
    locateFile: () => options.wasmUrl ?? "rive.wasm",
    ...(options.wasmBinary ? { wasmBinary: options.wasmBinary } : {})
  });

  const file = await rive.load(await options.loadFile());
  const artboard = file.defaultArtboard();

  const canvas = (options.createCanvas ?? createElementCanvas)(width, height);
  const renderer = rive.makeRenderer(canvas) as AlignableRenderer;

  // Prefer the state machine (most .riv drive visible content through it);
  // fall back to the first linear animation.
  const stateMachine =
    artboard.stateMachineCount() > 0
      ? new rive.StateMachineInstance(artboard.stateMachineByIndex(0), artboard)
      : null;
  const animation =
    !stateMachine && artboard.animationCount() > 0
      ? new rive.LinearAnimationInstance(artboard.animationByIndex(0), artboard)
      : null;

  // Index state-machine inputs by name so callers can drive them.
  const inputs = new Map<string, SMIInput>();
  if (stateMachine) {
    for (let i = 0; i < stateMachine.inputCount(); i += 1) {
      const input = stateMachine.input(i);
      inputs.set(input.name, input);
    }
  }

  // Build the CanvasSource explicitly: Pixi 8's `Texture.from` auto-detection checks
  // `instanceof HTMLCanvasElement`, which a WeChat wx canvas fails.
  const source = new CanvasSource({ resource: canvas as unknown as HTMLCanvasElement, width, height });
  const texture = new Texture({ source });
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);

  const frame = { minX: 0, minY: 0, maxX: width, maxY: height };
  let lastSeconds = 0;
  let rafId = 0;
  let disposed = false;

  // Drive with Rive's own requestAnimationFrame: the WebGL2 renderer only commits a
  // frame to the target canvas inside its own RAF. An external ticker draws nothing.
  const drawFrame = (timeMs: number): void => {
    if (disposed) {
      return;
    }
    const seconds = timeMs / 1000;
    const dt = lastSeconds ? seconds - lastSeconds : 0;
    lastSeconds = seconds;

    renderer.clear();
    if (stateMachine) {
      stateMachine.advanceAndApply(dt);
    } else if (animation) {
      animation.advance(dt);
      animation.apply(1);
    }
    artboard.advance(dt);
    renderer.save();
    renderer.align(rive.Fit.contain, rive.Alignment.center, frame, artboard.bounds);
    artboard.draw(renderer);
    renderer.restore();
    renderer.flush();
    texture.source.update();

    rafId = rive.requestAnimationFrame(drawFrame);
  };
  rafId = rive.requestAnimationFrame(drawFrame);

  return {
    sprite,
    canvas,
    setInput: (name: string, value: number | boolean): void => {
      const input = inputs.get(name);
      if (input) {
        input.value = value;
      }
    },
    fireTrigger: (name: string): void => {
      inputs.get(name)?.fire();
    },
    destroy: (): void => {
      disposed = true;
      rive.cancelAnimationFrame(rafId);
      stateMachine?.delete();
      animation?.delete();
      artboard.delete();
      renderer.delete();
      sprite.destroy();
    }
  };
}
