// WeChat mini-games expose `WXWebAssembly`, not the standard `WebAssembly`, and
// `WXWebAssembly.instantiate(path, imports)` accepts a PATH to a packaged `.wasm`
// (not bytes). Rive's emscripten glue calls `WebAssembly.instantiate(bytes)`, so we
// install a minimal `WebAssembly` shim that routes instantiate() to the packaged wasm.
//
// Rive only touches `WebAssembly.RuntimeError`, `.instantiate`, and
// `.instantiateStreaming`; passing `wasmBinary` forces the non-streaming path, so we
// deliberately leave `instantiateStreaming` undefined.

interface WxWebAssembly {
  instantiate(path: string, imports: WebAssembly.Imports): Promise<unknown>;
  Memory: typeof WebAssembly.Memory;
  Table: typeof WebAssembly.Table;
}

/**
 * Call once, before initialising Rive, on WeChat. No-op in the browser (where a real
 * `WebAssembly` global exists). `wasmPath` is the packaged path to rive.wasm, e.g.
 * "rive/rive.wasm" when using a subpackage.
 */
export function installWechatWasmShim(wasmPath: string): void {
  const globalScope = globalThis as Record<string, unknown>;
  if (typeof globalScope.WebAssembly !== "undefined") {
    return;
  }
  const wxasm = globalScope.WXWebAssembly as WxWebAssembly | undefined;
  if (!wxasm) {
    throw new Error("installWechatWasmShim: neither WebAssembly nor WXWebAssembly is available");
  }

  globalScope.WebAssembly = {
    instantiate: (_binaryOrModule: unknown, imports: WebAssembly.Imports): Promise<{ instance: WebAssembly.Instance }> =>
      wxasm.instantiate(wasmPath, imports).then((result) => {
        const maybe = result as { instance?: WebAssembly.Instance };
        return maybe && maybe.instance ? (maybe as { instance: WebAssembly.Instance }) : { instance: result as WebAssembly.Instance };
      }),
    Memory: wxasm.Memory,
    Table: wxasm.Table,
    RuntimeError: Error
  };
}
