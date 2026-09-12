import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('metadata-driven entity field components', () => {
  it('routes canonical date, datetime and duration entity inputs through explicit reusable field components', async () => {
    const renderer = await source('views/components/sysbo/entry/fields/entity-field.ejs');
    const date = await source('views/components/sysbo/entry/fields/date-field.ejs');
    const datetime = await source('views/components/sysbo/entry/fields/datetime-field.ejs');
    const duration = await source('views/components/sysbo/entry/fields/duration-field.ejs');
    const picture = await source('views/components/sysbo/entry/fields/picture-field.ejs');
    const pictures = await source('views/components/sysbo/entry/fields/pictures-field.ejs');
    const pictureEditor = await source('views/components/sysbo/entry/fields/picture-editor.ejs');
    const richText = await source('views/components/sysbo/entry/fields/rich-text-field.ejs');
    const richTextRuntime = await source('public/js/sysbo/entry/rich-text-runtime.js');
    const businessUiMetadata = await readFile(
      resolve(testDirectory, '..', '..', '..', 'shared', 'src', 'metadata', 'ui', 'business.ts'),
      'utf8',
    );
    const runtime = await source('public/js/sysbo/entry/field-runtime.js');
    const pictureRuntime = await source('public/js/sysbo/entry/field-runtime/picture-fields.js');

    expect(renderer).toContain("field.type === 'date'");
    expect(renderer).toContain("field.type === 'datetime'");
    expect(renderer).toContain("field.type === 'duration'");
    expect(renderer).toContain("field.type === 'picture'");
    expect(renderer).toContain("field.type === 'pictures'");
    expect(renderer).toContain("field.type === 'richText'");
    expect(date).toContain('type="date"');
    expect(datetime).toContain('type="datetime-local"');
    expect(duration).toContain('data-duration-canonical-value');
    expect(duration).toContain('data-ctx-value-type="duration"');
    expect(picture).toContain('data-picture-preview');
    expect(picture).toContain('pictureChange.<%= key %>');
    expect(pictureEditor).toContain('data-picture-crop-canvas');
    expect(picture).toContain('data-picture-canonical-value');
    expect(pictures).toContain('data-pictures-strip');
    expect(pictures).toContain('data-pictures-count');
    expect(pictures).toContain('picturesChange.<%= key %>');
    expect(pictureRuntime).toContain('picturesFieldDirty(root)');
    expect(pictureRuntime).toContain('`${pagePath}.fields.${key}.dirty`');
    expect(pictureRuntime).toContain('picturesReplacementFromDom(root)');
    expect(pictureRuntime).toContain(
      "form?.addEventListener('submit', () => syncPicturesReplacementPayload(root), true)",
    );
    expect(pictureRuntime).not.toContain('state.operations.push');
    expect(pictureRuntime).not.toContain('state.order');
    expect(picture).toContain('data-picture-change');
    expect(picture).not.toContain('>Change</button>');
    expect(picture).toContain('metadata-picture-delete');
    expect(picture).toContain('bi-trash');
    expect(picture).not.toContain('>Clear</button>');
    expect(pictureEditor).toContain('data-picture-crop-mode="proportional"');
    expect(pictureEditor).toContain('data-picture-crop-mode="free"');
    expect(richText).toContain('data-rich-text-source');
    expect(richText).toContain('data-rich-text-mode="<%= runtimeMode %>"');
    expect(richText).toContain("['visual', 'markdown', 'preview'].includes(mode)");
    expect(richTextRuntime).toContain("const MILKDOWN_CREPE_MODULE = '/vendor/milkdown-crepe.js'");
    expect(richTextRuntime).toContain("const MILKDOWN_CREPE_STYLE = '/vendor/milkdown-crepe.css'");
    expect(richTextRuntime).not.toContain('cdn.jsdelivr.net');
    expect(richTextRuntime).toContain('listener.markdownUpdated');
    expect(richTextRuntime).toContain('editorGeneration');
    expect(richTextRuntime).toContain('createPromise');
    expect(richText).toContain('data-ctx-field="<%= key %>"');
    expect(richText).toContain('presentation?.richText');
    expect(richText).toContain('data-rich-text-initial-mode');
    expect(richText).toContain('data-rich-text-modes');
    expect(richText).toContain('data-rich-text-initial-height');
    expect(businessUiMetadata).toContain("modes: ['markdown', 'visual', 'preview']");
    expect(businessUiMetadata).toContain("initialMode: 'markdown'");
    expect(businessUiMetadata).toContain('initial: 160');
    expect(pictureRuntime).toContain('encodePictureCrop');
    expect(pictureRuntime).toContain("state.cropMode === 'free'");
    expect(pictureRuntime).not.toContain('picturesOriginalValue');
    expect(pictureRuntime).not.toContain('picturesOriginalIds');
    expect(pictureRuntime).not.toContain('window.alert');
    expect(runtime).toContain('window.ManatOS.fieldComponents');
    expect(runtime).toContain('setDurationValue');
  });

  it('keeps generic tab rendering entity-agnostic while allowing ordered field/component content', async () => {
    const renderer = await source('views/components/sysbo/entry/shell/entry-tab-content.ejs');
    const registry = await source('src/presentation/metadata/component-registry.ts');

    expect(renderer).toContain('const tabContents = Array.isArray(tab.content)');
    expect(renderer).toContain("content?.kind === 'component'");
    expect(renderer).toContain(
      'for (let contentIndex = 0; contentIndex < tab.content.length; contentIndex += 1)',
    );
    expect(renderer).toContain('const content = tab.content[contentIndex]');
    expect(renderer).toContain('metadataComponentPartialFor');
    expect(registry).toContain("'contextual-help'");
    expect(registry).toContain("'provider-credentials'");
    expect(registry).toContain("'date-duration-range'");
    expect(renderer).not.toContain("definition.key === 'sys-ext-auth-providers'");
    expect(renderer).not.toContain("definition.key === 'sys-licenses'");
  });
  it('keeps scalar and collection picture editing on one shared crop/runtime contract', async () => {
    const fieldRuntime = await source('public/js/sysbo/entry/field-runtime/picture-fields.js');
    const picture = await source('views/components/sysbo/entry/fields/picture-field.ejs');
    const pictures = await source('views/components/sysbo/entry/fields/pictures-field.ejs');
    const pictureEditor = await source('views/components/sysbo/entry/fields/picture-editor.ejs');
    const pagesCss = await source('public/css/pages.css');

    expect(fieldRuntime).toContain('const syncPictureEditorControls = (state) =>');
    expect(fieldRuntime).toContain('const pointInsideSelection = (selection, x, y) =>');
    expect(fieldRuntime).toContain('const hostPictureEditor = (modal) =>');
    expect(fieldRuntime).toContain('document.body.appendChild(modal)');
    expect(fieldRuntime).toContain('state.draggingSelection = true');
    expect(fieldRuntime).toContain(
      "modeGroup?.classList.toggle('d-none', state.tool !== 'crop' || modes.length < 2)",
    );
    expect(picture).toContain("['proportional', 'free']");
    expect(pictures).toContain("['proportional', 'free']");
    expect(pictures).toContain("editorTitle: 'Add picture'");
    expect(pictures).toContain('data-pictures-file multiple');
    expect(pictureEditor).toContain('data-picture-editor-file-list');
    expect(fieldRuntime).toContain('const loadPicturesIntoEditor = async (root, files) =>');
    expect(fieldRuntime).toContain(
      'item.state?.edited ? encodePictureCrop(item.state) : readOriginalPicture(item.file)',
    );
    expect(fieldRuntime).toContain('activateBatchPicture(batch');
    expect(pagesCss).toContain('.metadata-picture-editor-file-list');
    expect(pictureEditor).toContain('Drag an existing');
    expect(pictureEditor).toContain('crop rectangle to reposition it');
    expect(pagesCss).toContain('max-width: min(96vw, 80rem)');
    expect(pagesCss).toContain('.metadata-picture-field > .metadata-picture-help');
    expect(fieldRuntime).toContain('rehydratePictures(root)');
    expect(fieldRuntime).toContain('updatePicturesCount(root)');
    expect(pagesCss).toContain('grid-template-columns: repeat(auto-fill, 6rem)');
    expect(pagesCss).toContain('overflow-y: auto');
  });
});
