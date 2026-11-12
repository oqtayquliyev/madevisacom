// Cloudflare replacement for `@vercel/og` (aliased in wrangler.jsonc). Same ImageResponse API, same renderer
// (satori + resvg), but loads its WebAssembly and fallback font in a way the Workers runtime supports.
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import fallbackFont from '@vercel/og/dist/noto-sans-v27-latin-regular.ttf';

type Font = { name: string; data: ArrayBuffer; weight?: number; style?: 'normal' | 'italic' };
type Options = { width?: number; height?: number; fonts?: Font[]; headers?: Record<string, string>; status?: number; statusText?: string; debug?: boolean };

let ready: Promise<void> | null = null;
const init = () => (ready ??= initWasm(resvgWasm as WebAssembly.Module));

async function render(element: unknown, o: Options): Promise<Uint8Array> {
  await init();
  const width = o.width ?? 1200, height = o.height ?? 630;
  const fonts = [...(o.fonts ?? []), { name: 'sans serif', data: fallbackFont as ArrayBuffer, weight: 400, style: 'normal' as const }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(element as any, { width, height, fonts: fonts as any, debug: o.debug });
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const png = r.render();
  const bytes = png.asPng();
  png.free(); r.free();
  return bytes;
}

export class ImageResponse extends Response {
  constructor(element: unknown, options: Options = {}) {
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try { controller.enqueue(await render(element, options)); controller.close(); }
        catch (e) { controller.error(e); }
      },
    });
    super(body, {
      status: options.status ?? 200,
      statusText: options.statusText,
      headers: { 'content-type': 'image/png', 'cache-control': 'public, immutable, no-transform, max-age=31536000', ...(options.headers ?? {}) },
    });
  }
}
