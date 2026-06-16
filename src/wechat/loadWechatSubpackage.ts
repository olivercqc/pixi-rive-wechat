// Load a WeChat mini-game subpackage on demand (e.g. the Rive wasm, kept out of the
// 4MB main package). Resolves immediately in the browser / when unavailable, so the
// same call site works on both platforms.
//
// Note: a mini-GAME subpackage is not "resource-only" — its root must contain a
// (possibly empty) `game.js`, or DevTools fails to compile.
type LoadSubpackageOptions = {
  name: string;
  success?: () => void;
  fail?: (error: unknown) => void;
};

export function loadWechatSubpackage(name: string): Promise<void> {
  const wxGlobal = (globalThis as { wx?: { loadSubpackage?: (options: LoadSubpackageOptions) => unknown } }).wx;
  if (!wxGlobal || typeof wxGlobal.loadSubpackage !== "function") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    wxGlobal.loadSubpackage!({
      name,
      success: () => resolve(),
      fail: (error: unknown) => reject(error instanceof Error ? error : new Error(`loadSubpackage("${name}") failed`))
    });
  });
}
