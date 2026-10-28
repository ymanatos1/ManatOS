import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'src/pages');
const destination = resolve(root, 'dist/pages');

const resourceExtensions = new Set([
  '.html',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
]);

async function removePackagedResources(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await removePackagedResources(path);
        return;
      }

      if (resourceExtensions.has(extname(entry.name).toLowerCase())) {
        await rm(path, { force: true });
      }
    }),
  );
}

await mkdir(destination, { recursive: true });
await removePackagedResources(destination);

await cp(source, destination, {
  recursive: true,
  force: true,
  filter(path) {
    if (path === source) return true;

    const extension = extname(path).toLowerCase();

    return extension === '' || resourceExtensions.has(extension);
  },
});
