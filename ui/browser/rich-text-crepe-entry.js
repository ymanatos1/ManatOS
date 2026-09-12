/**
 * Browser bundle boundary for ManatOS rich-text editing.
 *
 * Keep Milkdown/Crepe and its transitive ProseMirror graph inside one esbuild
 * bundle. Loading Crepe through independent CDN ESM URLs can produce multiple
 * copies of keyed ProseMirror plugins, which ProseMirror correctly rejects.
 * The runtime imports this local bundle only; canonical Markdown remains in CTX.
 */
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

export { Crepe } from '@milkdown/crepe';
