import { spawn } from 'node:child_process';

const MAX_INPUT = 3_000_000;
const MAX_OUTPUT = 512_000;
const MAX_CACHE = 128;
const cache = new Map<string, Buffer>();
let imageProcessorUnavailable = false;

/** Optional local ImageMagick adapter. Never claims a thumbnail if generation failed.
 * The process has fixed arguments and strict resource/output/time limits.
 */
export async function thumbnailPicture(bytes: Buffer, cacheKey: string): Promise<Buffer | null> {
  if (!bytes.length || bytes.length > MAX_INPUT || imageProcessorUnavailable) return null;
  const saved = cache.get(cacheKey);
  if (saved) return saved;
  const result = await new Promise<Buffer | null>((resolve) => {
    let done = false;
    const settle = (value: Buffer | null): void => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const child = spawn(
      'magick',
      ['-', '-auto-orient', '-thumbnail', '128x128>', '-strip', 'webp:-'],
      {
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 4000,
      },
    );
    const output: Buffer[] = [];
    let total = 0;
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') imageProcessorUnavailable = true;
      settle(null);
    });
    child.stdout.on('data', (piece: Buffer) => {
      total += piece.length;
      if (total > MAX_OUTPUT) {
        child.kill();
        settle(null);
      } else output.push(piece);
    });
    child.on('close', (code) => settle(code === 0 && total > 0 ? Buffer.concat(output) : null));
    child.stdin.on('error', () => settle(null));
    child.stdin.end(bytes);
  });
  if (result) {
    cache.set(cacheKey, result);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  }
  return result;
}
