/**
 * Picture and Pictures field-component runtime.
 *
 * Owns image selection/cropping, pending binary payloads, collection ordering,
 * recovery integration and picture-specific form contributor lifecycle.
 * Semantic field mutation still flows through the canonical publish() service
 * supplied by field-runtime.js.
 */
(() => {
  window.ManatOS = window.ManatOS || {};

  const install = ({ publish }) => {
    if (typeof publish !== 'function')
      throw new Error('Picture field runtime requires the canonical field publish service.');

    const pictureSourceTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    const setPicturePreview = (root, source) => {
      const image = root.querySelector('[data-picture-image]');
      const placeholder = root.querySelector('[data-picture-placeholder]');
      if (!(image instanceof HTMLImageElement) || !(placeholder instanceof Element)) return;
      if (source) {
        image.src = source;
        image.classList.remove('d-none');
        placeholder.classList.add('d-none');
      } else {
        image.removeAttribute('src');
        image.classList.add('d-none');
        placeholder.classList.remove('d-none');
      }
    };

    const pictureEditorFor = (root) => {
      const id = root.getAttribute('data-picture-editor-id');
      const modal = id ? document.getElementById(id) : null;
      return modal instanceof HTMLElement ? modal : null;
    };

    const hostPictureEditor = (modal) => {
      if (!(modal instanceof HTMLElement)) return null;
      if (modal.parentElement !== document.body) document.body.appendChild(modal);
      return modal;
    };

    const pictureEditorError = (modal, message = '') => {
      const error = modal?.querySelector('[data-picture-editor-error]');
      if (!(error instanceof HTMLElement)) return;
      error.textContent = message;
      error.classList.toggle('d-none', !message);
    };

    const pictureEditorState = new WeakMap();

    const pictureCropModes = (root) =>
      String(root.getAttribute('data-picture-crop-modes') || 'proportional')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    const syncPictureEditorControls = (state) => {
      const { modal, canvas } = state;
      const modes = pictureCropModes(state.root);
      canvas.dataset.pictureEditorActiveTool = state.tool;
      modal.querySelectorAll('[data-picture-editor-tool]').forEach((button) => {
        const active = button.getAttribute('data-picture-editor-tool') === state.tool;
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-outline-secondary', !active);
      });
      const modeGroup = modal.querySelector('[data-picture-crop-mode-group]');
      modeGroup?.classList.toggle('d-none', state.tool !== 'crop' || modes.length < 2);
      modal.querySelectorAll('[data-picture-crop-mode]').forEach((button) => {
        const allowed = modes.includes(button.getAttribute('data-picture-crop-mode'));
        button.classList.toggle('d-none', !allowed);
        const active = button.getAttribute('data-picture-crop-mode') === state.cropMode;
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-outline-secondary', !active);
      });
    };

    const pointInsideSelection = (selection, x, y) =>
      Boolean(
        selection &&
        x >= selection.x &&
        x <= selection.x + selection.width &&
        y >= selection.y &&
        y <= selection.y + selection.height,
      );

    const constrainSelection = (selection, canvas) => ({
      ...selection,
      x: Math.max(0, Math.min(canvas.width - selection.width, selection.x)),
      y: Math.max(0, Math.min(canvas.height - selection.height, selection.y)),
    });

    const constrainPictureOffset = (state) => {
      const canvas = state.canvas;
      const renderedWidth = state.image.naturalWidth * state.scale;
      const renderedHeight = state.image.naturalHeight * state.scale;
      const maxX = Math.max(0, (renderedWidth - canvas.width) / 2);
      const maxY = Math.max(0, (renderedHeight - canvas.height) / 2);
      state.offsetX = Math.max(-maxX, Math.min(maxX, state.offsetX));
      state.offsetY = Math.max(-maxY, Math.min(maxY, state.offsetY));
    };

    const drawPictureCrop = (state) => {
      const { canvas, image } = state;
      const context = canvas.getContext('2d');
      if (!context) return;
      constrainPictureOffset(state);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#e9ecef';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const width = image.naturalWidth * state.scale;
      const height = image.naturalHeight * state.scale;
      const x = (canvas.width - width) / 2 + state.offsetX;
      const y = (canvas.height - height) / 2 + state.offsetY;
      context.drawImage(image, x, y, width, height);
      if (state.selection) {
        const { x: sx, y: sy, width: sw, height: sh } = state.selection;
        context.save();
        context.fillStyle = 'rgba(0, 0, 0, 0.38)';
        context.fillRect(0, 0, canvas.width, sy);
        context.fillRect(0, sy + sh, canvas.width, canvas.height - sy - sh);
        context.fillRect(0, sy, sx, sh);
        context.fillRect(sx + sw, sy, canvas.width - sx - sw, sh);
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.setLineDash([7, 5]);
        context.strokeRect(sx + 1, sy + 1, Math.max(0, sw - 2), Math.max(0, sh - 2));
        context.restore();
      }
    };

    const createPictureEditorState = (root, modal, canvas, image, objectUrl) => {
      const aspectRatio = Number(root.getAttribute('data-picture-crop-aspect-ratio') || 1);
      canvas.width = 1120;
      canvas.height = Math.max(180, Math.round(canvas.width / Math.max(0.1, aspectRatio)));
      const minScale = Math.max(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight,
      );
      return {
        root,
        modal,
        canvas,
        image,
        objectUrl,
        minScale,
        scale: minScale,
        offsetX: 0,
        offsetY: 0,
        tool: 'move',
        cropMode: String(root.getAttribute('data-picture-crop-modes') || 'proportional')
          .split(',')
          .includes('proportional')
          ? 'proportional'
          : 'free',
        dragging: false,
        selecting: false,
        draggingSelection: false,
        selectionStartX: 0,
        selectionStartY: 0,
        selection: null,
        lastX: 0,
        lastY: 0,
        lastCanvasX: 0,
        lastCanvasY: 0,
        edited: false,
        batch: null,
      };
    };

    const pictureEditorParts = (root) => {
      const modal = hostPictureEditor(pictureEditorFor(root));
      const canvas = modal?.querySelector('[data-picture-crop-canvas]');
      const zoom = modal?.querySelector('[data-picture-crop-zoom]');
      const apply = modal?.querySelector('[data-picture-crop-apply]');
      if (
        !(modal instanceof HTMLElement) ||
        !(canvas instanceof HTMLCanvasElement) ||
        !(zoom instanceof HTMLInputElement) ||
        !(apply instanceof HTMLButtonElement)
      )
        return null;
      return { modal, canvas, zoom, apply };
    };

    const validatePictureFile = (root, file) => {
      if (!pictureSourceTypes.has(file.type)) return 'Choose a JPEG, PNG, WebP or GIF image.';
      const maxSourceBytes = Number(
        root.getAttribute('data-picture-max-source-bytes') || 20_000_000,
      );
      if (file.size > maxSourceBytes)
        return `Choose an image up to ${Math.round(
          maxSourceBytes / 1_000_000,
        )} MB. The picture is cropped and resized before it is saved.`;
      return '';
    };

    const loadImageFile = (file) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);
        image.addEventListener('load', () => resolve({ image, objectUrl }), { once: true });
        image.addEventListener(
          'error',
          () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(`The selected image ${file.name || ''} could not be opened.`));
          },
          { once: true },
        );
        image.src = objectUrl;
      });

    const setPictureEditorBatchPresentation = (modal, enabled) => {
      const list = modal.querySelector('[data-picture-editor-file-list]');
      list?.classList.toggle('d-none', !enabled);
      const title = modal.querySelector('.modal-title');
      const apply = modal.querySelector('[data-picture-crop-apply]');
      const applyText = modal.querySelector('[data-picture-apply-text]');
      if (enabled) {
        if (title) title.textContent = 'Add pictures';
        if (applyText) applyText.textContent = 'Add pictures';
      } else {
        if (title)
          title.textContent = String(modal.dataset.pictureDefaultTitle || title.textContent || '');
        if (applyText)
          applyText.textContent = String(
            apply?.getAttribute('data-picture-apply-label') || applyText.textContent || '',
          );
      }
    };

    const activateBatchPicture = (batch, index) => {
      const item = batch.items[index];
      if (!item) return;
      batch.activeIndex = index;
      if (!item.state) {
        item.state = createPictureEditorState(
          batch.root,
          batch.modal,
          batch.canvas,
          item.image,
          item.objectUrl,
        );
        item.state.batch = batch;
      }
      pictureEditorState.set(batch.modal, item.state);
      batch.zoom.value = String(item.state.scale / item.state.minScale);
      batch.apply.disabled = false;
      batch.list.querySelectorAll('[data-picture-batch-index]').forEach((button) => {
        button.classList.toggle(
          'active',
          Number(button.getAttribute('data-picture-batch-index')) === index,
        );
      });
      syncPictureEditorControls(item.state);
      drawPictureCrop(item.state);
    };

    const renderPictureBatchList = (batch) => {
      batch.list.replaceChildren();
      batch.items.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'metadata-picture-editor-file';
        button.setAttribute('data-picture-batch-index', String(index));
        button.title = item.file.name || `Picture ${index + 1}`;
        const thumbnail = document.createElement('img');
        thumbnail.src = item.objectUrl;
        thumbnail.alt = '';
        const name = document.createElement('span');
        name.textContent = item.file.name || `Picture ${index + 1}`;
        button.append(thumbnail, name);
        batch.list.appendChild(button);
      });
    };

    const loadPicturesIntoEditor = async (root, files) => {
      const parts = pictureEditorParts(root);
      if (!parts) return;
      const { modal, canvas, zoom, apply } = parts;
      pictureEditorError(modal);
      apply.disabled = true;
      if (!modal.dataset.pictureDefaultTitle)
        modal.dataset.pictureDefaultTitle = modal.querySelector('.modal-title')?.textContent || '';

      const invalid = files.find((file) => validatePictureFile(root, file));
      if (invalid) {
        pictureEditorError(modal, validatePictureFile(root, invalid));
        window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
        return;
      }

      const loaded = [];
      try {
        for (const file of files) loaded.push(await loadImageFile(file));
        const list = modal.querySelector('[data-picture-editor-file-list]');
        if (!(list instanceof HTMLElement)) {
          loaded.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
          return;
        }
        const batch = {
          root,
          modal,
          canvas,
          zoom,
          apply,
          list,
          activeIndex: 0,
          items: files.map((file, index) => ({ file, ...loaded[index], state: null })),
        };
        setPictureEditorBatchPresentation(modal, true);
        renderPictureBatchList(batch);
        activateBatchPicture(batch, 0);
        window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
      } catch (error) {
        loaded.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
        pictureEditorError(modal, error?.message || 'The selected pictures could not be opened.');
        window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
      }
    };

    const loadPictureIntoEditor = (root, file) => {
      const parts = pictureEditorParts(root);
      if (!parts) return;
      const { modal, canvas, zoom, apply } = parts;
      pictureEditorError(modal);
      apply.disabled = true;
      if (!modal.dataset.pictureDefaultTitle)
        modal.dataset.pictureDefaultTitle = modal.querySelector('.modal-title')?.textContent || '';
      setPictureEditorBatchPresentation(modal, false);
      const validationError = validatePictureFile(root, file);
      if (validationError) {
        pictureEditorError(modal, validationError);
        window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
        return;
      }

      void loadImageFile(file)
        .then(({ image, objectUrl }) => {
          const state = createPictureEditorState(root, modal, canvas, image, objectUrl);
          pictureEditorState.set(modal, state);
          syncPictureEditorControls(state);
          zoom.value = '1';
          apply.disabled = false;
          drawPictureCrop(state);
          window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
        })
        .catch((error) => {
          pictureEditorError(modal, error?.message || 'The selected image could not be opened.');
          window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
        });
    };

    const encodePictureCrop = async (state) => {
      const root = state.root;
      const outputSize = Number(root.getAttribute('data-picture-output-size') || 768);
      const configuredAspect = Number(root.getAttribute('data-picture-crop-aspect-ratio') || 1);
      const contentType = root.getAttribute('data-picture-output-content-type') || 'image/jpeg';
      const quality = Number(root.getAttribute('data-picture-output-quality') || 0.9);
      const selection = state.selection || {
        x: 0,
        y: 0,
        width: state.canvas.width,
        height: state.canvas.height,
      };
      const selectedAspect = selection.width / Math.max(1, selection.height);
      const aspectRatio = state.cropMode === 'free' ? selectedAspect : configuredAspect;
      const output = document.createElement('canvas');
      if (aspectRatio >= 1) {
        output.width = outputSize;
        output.height = Math.max(1, Math.round(outputSize / Math.max(0.1, aspectRatio)));
      } else {
        output.height = outputSize;
        output.width = Math.max(1, Math.round(outputSize * Math.max(0.1, aspectRatio)));
      }
      const context = output.getContext('2d');
      if (!context) throw new Error('Picture crop canvas is unavailable.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, output.width, output.height);
      const renderedWidth = state.image.naturalWidth * state.scale;
      const renderedHeight = state.image.naturalHeight * state.scale;
      const imageX = (state.canvas.width - renderedWidth) / 2 + state.offsetX;
      const imageY = (state.canvas.height - renderedHeight) / 2 + state.offsetY;
      const sourceX = Math.max(0, (selection.x - imageX) / state.scale);
      const sourceY = Math.max(0, (selection.y - imageY) / state.scale);
      const sourceWidth = Math.min(
        state.image.naturalWidth - sourceX,
        selection.width / state.scale,
      );
      const sourceHeight = Math.min(
        state.image.naturalHeight - sourceY,
        selection.height / state.scale,
      );
      context.drawImage(
        state.image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        output.width,
        output.height,
      );
      const blob = await new Promise((resolve) => output.toBlob(resolve, contentType, quality));
      if (!(blob instanceof Blob)) throw new Error('The cropped picture could not be encoded.');
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result || '')));
        reader.addEventListener('error', () =>
          reject(reader.error || new Error('Picture read failed.')),
        );
        reader.readAsDataURL(blob);
      });
      const comma = dataUrl.indexOf(',');
      if (comma < 0) throw new Error('The cropped picture could not be encoded.');
      return {
        contentType,
        dataBase64: dataUrl.slice(comma + 1),
        previewUrl: dataUrl,
        size: blob.size,
      };
    };

    const readOriginalPicture = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          const dataUrl = String(reader.result || '');
          const comma = dataUrl.indexOf(',');
          if (comma < 0) {
            reject(new Error(`The selected image ${file.name || ''} could not be read.`));
            return;
          }
          resolve({
            contentType: file.type,
            dataBase64: dataUrl.slice(comma + 1),
            previewUrl: dataUrl,
            size: file.size,
          });
        });
        reader.addEventListener('error', () =>
          reject(
            reader.error || new Error(`The selected image ${file.name || ''} could not be read.`),
          ),
        );
        reader.readAsDataURL(file);
      });

    const picturesDescriptorFromDom = (root) =>
      [...root.querySelectorAll('[data-picture-item]')]
        .map((item) => {
          try {
            return JSON.parse(decodeURIComponent(item.dataset.pictureDescriptor || '%7B%7D'));
          } catch {
            return {};
          }
        })
        .filter((picture) => picture && (picture.id || picture.pending));

    const picturesChangeState = (root) => {
      const payload = root.querySelector('[data-pictures-change-payload]');
      if (!(payload instanceof HTMLInputElement))
        return { payload: null, state: { changed: false, pictures: [] } };
      try {
        const parsed = payload.value ? JSON.parse(payload.value) : {};
        return {
          payload,
          state: {
            changed: parsed.changed === true,
            pictures: Array.isArray(parsed.pictures) ? parsed.pictures : [],
          },
        };
      } catch {
        return { payload, state: { changed: false, pictures: [] } };
      }
    };

    const owningEntryPath = (element) => {
      const form = element?.closest?.('[data-v2-entry-form][data-ctx-scope-path]');
      const path = String(form?.dataset?.ctxScopePath || '').trim();
      return path || null;
    };

    const pendingPicturePayload = new WeakMap();

    const updatePicturesCount = (root) => {
      const count = root.querySelectorAll('[data-picture-item]').length;
      const label = root.querySelector('[data-pictures-count]');
      if (label) label.textContent = `${count} picture${count === 1 ? '' : 's'}.`;
    };

    const picturesReplacementFromDom = (root) =>
      [...root.querySelectorAll('[data-picture-item]')]
        .map((item) => {
          const pending = pendingPicturePayload.get(item);
          if (pending?.contentType && pending?.dataBase64) {
            return { contentType: pending.contentType, dataBase64: pending.dataBase64 };
          }
          const id = String(item.dataset.pictureId || '');
          return id && !id.startsWith('pending:') ? { id } : null;
        })
        .filter(Boolean);

    const picturesFieldDirty = (root) => {
      const pagePath = owningEntryPath(root);
      const key = String(root.dataset.fieldKey || '').trim();
      const runtime = window.ManatOS?.ctx;
      return Boolean(pagePath && key && runtime?.get?.(`${pagePath}.fields.${key}.dirty`) === true);
    };

    const syncPicturesReplacementPayload = (root) => {
      const { payload } = picturesChangeState(root);
      if (!(payload instanceof HTMLInputElement)) return;
      payload.value = picturesFieldDirty(root)
        ? JSON.stringify({ changed: true, pictures: picturesReplacementFromDom(root) })
        : '';
      publish(payload, false, { source: 'pictures-field-save-payload' });
    };

    const publishPicturesState = (root) => {
      const canonical = root.querySelector('[data-pictures-canonical-value]');
      const descriptors = picturesDescriptorFromDom(root);
      if (canonical instanceof HTMLInputElement) {
        canonical.value = JSON.stringify(descriptors);
        publish(canonical, false, { source: 'pictures-field' });
      }
      // Canonical CTX owns field dirtiness. Build the binary replacement payload
      // only after that shared dirty projection has observed the new value.
      queueMicrotask(() => syncPicturesReplacementPayload(root));
      updatePicturesCount(root);
    };

    const addPendingPictureItem = (root, prepared) => {
      const strip = root.querySelector('[data-pictures-strip]');
      const add = root.querySelector('[data-pictures-add]');
      if (!(strip instanceof HTMLElement)) return;
      const tempId = `pending:${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const descriptor = {
        id: tempId,
        contentType: prepared.contentType,
        size: prepared.size,
        revision: tempId,
        pending: true,
      };
      const item = document.createElement('div');
      item.className = 'metadata-pictures-item';
      item.draggable = true;
      item.dataset.pictureItem = '';
      item.dataset.pictureId = tempId;
      item.dataset.pictureDescriptor = encodeURIComponent(JSON.stringify(descriptor));
      item.innerHTML = `<img alt="Picture thumbnail"><button type="button" class="btn btn-sm btn-danger metadata-pictures-delete" data-pictures-delete title="Delete picture" aria-label="Delete picture"><i class="bi bi-trash"></i></button>`;
      const image = item.querySelector('img');
      if (image instanceof HTMLImageElement) image.src = prepared.previewUrl;
      pendingPicturePayload.set(item, {
        contentType: prepared.contentType,
        dataBase64: prepared.dataBase64,
      });
      strip.insertBefore(item, add || null);
      publishPicturesState(root);
    };

    document.addEventListener('click', (event) => {
      const batchFile =
        event.target instanceof Element ? event.target.closest('[data-picture-batch-index]') : null;
      if (batchFile instanceof HTMLButtonElement) {
        const modal = batchFile.closest('[data-picture-editor-modal]');
        const state = modal ? pictureEditorState.get(modal) : null;
        const batch = state?.batch;
        if (batch) activateBatchPicture(batch, Number(batchFile.dataset.pictureBatchIndex || 0));
        return;
      }

      const add =
        event.target instanceof Element ? event.target.closest('[data-pictures-add]') : null;
      if (add instanceof HTMLButtonElement) {
        add.closest('[data-pictures-field]')?.querySelector('[data-pictures-file]')?.click();
        return;
      }
      const remove =
        event.target instanceof Element ? event.target.closest('[data-pictures-delete]') : null;
      if (remove instanceof HTMLButtonElement) {
        const root = remove.closest('[data-pictures-field]');
        const item = remove.closest('[data-picture-item]');
        if (!(root instanceof HTMLElement) || !(item instanceof HTMLElement)) return;
        pendingPicturePayload.delete(item);
        item.remove();
        publishPicturesState(root);
        return;
      }

      const tool =
        event.target instanceof Element ? event.target.closest('[data-picture-editor-tool]') : null;
      if (tool instanceof HTMLButtonElement) {
        const modal = tool.closest('[data-picture-editor-modal]');
        const state = modal ? pictureEditorState.get(modal) : null;
        if (!state) return;
        state.tool = tool.dataset.pictureEditorTool === 'crop' ? 'crop' : 'move';
        state.draggingSelection = false;
        delete state.canvas.dataset.pictureSelectionHover;
        delete state.canvas.dataset.pictureSelectionDragging;
        if (state.tool === 'move' && state.selection) {
          state.selection = null;
          state.edited = true;
        }
        syncPictureEditorControls(state);
        drawPictureCrop(state);
        return;
      }

      const cropMode =
        event.target instanceof Element ? event.target.closest('[data-picture-crop-mode]') : null;
      if (cropMode instanceof HTMLButtonElement) {
        const modal = cropMode.closest('[data-picture-editor-modal]');
        const state = modal ? pictureEditorState.get(modal) : null;
        if (!state) return;
        const nextMode = cropMode.dataset.pictureCropMode === 'free' ? 'free' : 'proportional';
        if (!pictureCropModes(state.root).includes(nextMode)) return;
        state.cropMode = nextMode;
        if (state.selection) state.edited = true;
        state.selection = null;
        syncPictureEditorControls(state);
        drawPictureCrop(state);
        return;
      }

      const change =
        event.target instanceof Element ? event.target.closest('[data-picture-change]') : null;
      if (change instanceof HTMLButtonElement) {
        change.closest('[data-picture-field]')?.querySelector('[data-picture-file]')?.click();
        return;
      }
      const clear =
        event.target instanceof Element ? event.target.closest('[data-picture-clear]') : null;
      if (clear instanceof HTMLButtonElement) {
        const root = clear.closest('[data-picture-field]');
        const payload = root?.querySelector('[data-picture-change-payload]');
        if (!(root instanceof Element) || !(payload instanceof HTMLInputElement)) return;
        payload.value = root.getAttribute('data-picture-current-src')
          ? JSON.stringify({ clear: true })
          : '';
        setPicturePreview(root, '');
        clear.classList.add('d-none');
        const canonical = root.querySelector('[data-picture-canonical-value]');
        if (canonical instanceof HTMLInputElement) {
          canonical.value = '';
          publish(canonical, false, { source: 'picture-field' });
        }
        publish(payload, false);
        return;
      }

      const apply =
        event.target instanceof Element ? event.target.closest('[data-picture-crop-apply]') : null;
      if (apply instanceof HTMLButtonElement) {
        const modal = apply.closest('[data-picture-editor-modal]');
        const state = modal ? pictureEditorState.get(modal) : null;
        const payload = state?.root?.querySelector(
          '[data-picture-change-payload], [data-pictures-change-payload]',
        );
        const clearButton = state?.root?.querySelector('[data-picture-clear]');
        if (!state || !(payload instanceof HTMLInputElement)) return;
        apply.disabled = true;

        if (state.batch) {
          const batch = state.batch;
          void Promise.all(
            batch.items.map((item) =>
              item.state?.edited ? encodePictureCrop(item.state) : readOriginalPicture(item.file),
            ),
          )
            .then((preparedPictures) => {
              for (const prepared of preparedPictures) addPendingPictureItem(batch.root, prepared);
              window.bootstrap?.Modal?.getOrCreateInstance(batch.modal)?.hide();
            })
            .catch((error) => {
              pictureEditorError(
                batch.modal,
                error?.message || 'The selected pictures could not be prepared.',
              );
              apply.disabled = false;
            });
          return;
        }

        void encodePictureCrop(state)
          .then(({ contentType, dataBase64, previewUrl, size }) => {
            payload.value = JSON.stringify({ contentType, dataBase64 });
            setPicturePreview(state.root, previewUrl);
            if (clearButton instanceof HTMLButtonElement) clearButton.classList.remove('d-none');
            if (state.root.matches('[data-pictures-field]')) {
              addPendingPictureItem(state.root, { contentType, dataBase64, previewUrl, size });
            } else {
              const canonical = state.root.querySelector('[data-picture-canonical-value]');
              if (canonical instanceof HTMLInputElement) {
                canonical.value = JSON.stringify({
                  contentType,
                  size,
                  revision: `pending:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
                  pending: true,
                });
                publish(canonical, false, { source: 'picture-field' });
              }
              publish(payload, false);
            }
            window.bootstrap?.Modal?.getOrCreateInstance(state.modal)?.hide();
          })
          .catch((error) => {
            pictureEditorError(
              state.modal,
              error?.message || 'The cropped picture could not be prepared.',
            );
            apply.disabled = false;
          });
      }
    });

    let draggedPictureItem = null;
    document.addEventListener('dragstart', (event) => {
      const item =
        event.target instanceof Element ? event.target.closest('[data-picture-item]') : null;
      if (!(item instanceof HTMLElement) || !item.closest('[data-pictures-field]')) return;
      draggedPictureItem = item;
      item.classList.add('is-dragging');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', (event) => {
      const item =
        event.target instanceof Element ? event.target.closest('[data-picture-item]') : null;
      if (!(item instanceof HTMLElement) || !(draggedPictureItem instanceof HTMLElement)) return;
      const root = item.closest('[data-pictures-field]');
      if (!root || draggedPictureItem.closest('[data-pictures-field]') !== root) return;
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      item.parentElement?.insertBefore(
        draggedPictureItem,
        event.clientX < rect.left + rect.width / 2 ? item : item.nextSibling,
      );
    });
    document.addEventListener('dragend', () => {
      if (!(draggedPictureItem instanceof HTMLElement)) return;
      const root = draggedPictureItem.closest('[data-pictures-field]');
      draggedPictureItem.classList.remove('is-dragging');
      draggedPictureItem = null;
      if (!(root instanceof HTMLElement)) return;
      publishPicturesState(root);
    });

    document.addEventListener('change', (event) => {
      const fileInput =
        event.target instanceof Element
          ? event.target.closest('[data-picture-file], [data-pictures-file]')
          : null;
      if (!(fileInput instanceof HTMLInputElement)) return;
      const root = fileInput.closest('[data-picture-field], [data-pictures-field]');
      const files = [...(fileInput.files || [])];
      if (!(root instanceof HTMLElement) || files.length === 0) return;
      if (root.matches('[data-pictures-field]') && files.length > 1)
        void loadPicturesIntoEditor(root, files);
      else loadPictureIntoEditor(root, files[0]);
      fileInput.value = '';
    });

    document.addEventListener('input', (event) => {
      const zoom =
        event.target instanceof Element ? event.target.closest('[data-picture-crop-zoom]') : null;
      if (!(zoom instanceof HTMLInputElement)) return;
      const modal = zoom.closest('[data-picture-editor-modal]');
      const state = modal ? pictureEditorState.get(modal) : null;
      if (!state) return;
      state.scale = state.minScale * Number(zoom.value || 1);
      state.edited = true;
      drawPictureCrop(state);
    });

    const rehydrateScalarPicture = (root) => {
      const payload = root.querySelector('[data-picture-change-payload]');
      const clear = root.querySelector('[data-picture-clear]');
      if (!(payload instanceof HTMLInputElement)) return;
      let change = null;
      try {
        change = payload.value ? JSON.parse(payload.value) : null;
      } catch {
        change = null;
      }
      if (change?.clear === true) {
        setPicturePreview(root, '');
        clear?.classList.add('d-none');
        return;
      }
      if (change?.dataBase64 && change?.contentType) {
        setPicturePreview(root, `data:${change.contentType};base64,${change.dataBase64}`);
        clear?.classList.remove('d-none');
      }
    };

    const rehydratePictures = (root) => {
      const canonical = root.querySelector('[data-pictures-canonical-value]');
      const strip = root.querySelector('[data-pictures-strip]');
      if (!(canonical instanceof HTMLInputElement) || !(strip instanceof HTMLElement)) return;
      let descriptors = [];
      try {
        const parsed = JSON.parse(canonical.value || '[]');
        descriptors = Array.isArray(parsed) ? parsed : [];
      } catch {
        descriptors = [];
      }
      const { state } = picturesChangeState(root);
      const replacementPictures =
        state.changed && Array.isArray(state.pictures) ? state.pictures : [];
      let replacementIndex = 0;
      const add = strip.querySelector('[data-pictures-add]');
      strip.querySelectorAll('[data-picture-item]').forEach((item) => item.remove());
      for (const descriptor of descriptors) {
        if (!descriptor?.id) continue;
        const item = document.createElement('div');
        item.className = 'metadata-pictures-item';
        item.draggable = true;
        item.dataset.pictureItem = '';
        item.dataset.pictureId = String(descriptor.id);
        item.dataset.pictureDescriptor = encodeURIComponent(JSON.stringify(descriptor));
        item.innerHTML = `<img alt="Picture thumbnail"><button type="button" class="btn btn-sm btn-danger metadata-pictures-delete" data-pictures-delete title="Delete picture" aria-label="Delete picture"><i class="bi bi-trash"></i></button>`;
        const image = item.querySelector('img');
        if (image instanceof HTMLImageElement) {
          const replacement = replacementPictures[replacementIndex++];
          if (descriptor.pending && replacement?.contentType && replacement?.dataBase64) {
            pendingPicturePayload.set(item, replacement);
            image.src = `data:${replacement.contentType};base64,${replacement.dataBase64}`;
          } else {
            const entityKey = root.dataset.entityKey || '';
            const recordId = root.dataset.recordId || '';
            const fieldKey = root.dataset.fieldKey || '';
            image.src = `/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(recordId)}/pictures/${encodeURIComponent(fieldKey)}/${encodeURIComponent(String(descriptor.id))}?revision=${encodeURIComponent(String(descriptor.revision || ''))}`;
          }
        }
        strip.insertBefore(item, add || null);
      }
      updatePicturesCount(root);
    };

    const fieldRecoveryRoot = (form, key) => {
      const canonical = [...form.querySelectorAll('[data-ctx-field]')].find(
        (control) => control instanceof HTMLElement && control.dataset.ctxField === key,
      );
      return canonical?.closest?.('[data-picture-field], [data-pictures-field]') || null;
    };

    const componentRecoveryPayload = (root) => {
      if (!(root instanceof HTMLElement)) return null;
      const payload = root.querySelector(
        root.matches('[data-pictures-field]')
          ? '[data-pictures-change-payload]'
          : '[data-picture-change-payload]',
      );
      if (!(payload instanceof HTMLInputElement)) return null;
      return {
        type: root.matches('[data-pictures-field]') ? 'pictures' : 'picture',
        savePayload: payload.value,
      };
    };

    const applyComponentRecovery = (form, key, change) => {
      const root = fieldRecoveryRoot(form, key);
      if (!(root instanceof HTMLElement) || !change?.component) return false;
      const canonical = root.querySelector('[data-ctx-field]');
      const payload = root.querySelector(
        root.matches('[data-pictures-field]')
          ? '[data-pictures-change-payload]'
          : '[data-picture-change-payload]',
      );
      if (!(canonical instanceof HTMLInputElement) || !(payload instanceof HTMLInputElement))
        return false;

      canonical.value = JSON.stringify(
        change.value ?? (root.matches('[data-pictures-field]') ? [] : null),
      );
      payload.value = String(change.component.savePayload || '');
      if (root.matches('[data-pictures-field]')) rehydratePictures(root);
      else rehydrateScalarPicture(root);

      // Publish only this recovered field. Unchanged controls never receive
      // synthetic input/change events during outage recovery.
      canonical.dispatchEvent(new Event('input', { bubbles: true }));
      canonical.dispatchEvent(new Event('change', { bubbles: true }));
      root
        .closest('form')
        ?.dispatchEvent(new Event('manatos:form-contributor-state', { bubbles: true }));
      return true;
    };

    const verifyComponentRecovery = (form, key, change) => {
      if (!change?.component) return null;
      const root = fieldRecoveryRoot(form, key);
      if (!(root instanceof HTMLElement)) return false;
      const payload = root.querySelector(
        root.matches('[data-pictures-field]')
          ? '[data-pictures-change-payload]'
          : '[data-picture-change-payload]',
      );
      return (
        payload instanceof HTMLInputElement &&
        payload.value === String(change.component.savePayload || '')
      );
    };

    window.ManatOS ||= {};
    window.ManatOS.fieldRecovery = Object.freeze({
      captureField(form, key) {
        return componentRecoveryPayload(fieldRecoveryRoot(form, key));
      },
      applyField: applyComponentRecovery,
      verifyField: verifyComponentRecovery,
    });

    document.addEventListener('pointerdown', (event) => {
      const canvas =
        event.target instanceof Element ? event.target.closest('[data-picture-crop-canvas]') : null;
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const modal = canvas.closest('[data-picture-editor-modal]');
      const state = modal ? pictureEditorState.get(modal) : null;
      if (!state) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
      if (state.tool === 'crop') {
        if (pointInsideSelection(state.selection, x, y)) {
          state.draggingSelection = true;
          state.lastCanvasX = x;
          state.lastCanvasY = y;
          canvas.dataset.pictureSelectionDragging = 'true';
        } else {
          // Clicking outside an existing crop cancels it and immediately starts a
          // fresh crop gesture from the new pointer position.
          state.selection = null;
          state.selecting = true;
          state.selectionStartX = x;
          state.selectionStartY = y;
          state.selection = { x, y, width: 1, height: 1 };
          delete canvas.dataset.pictureSelectionHover;
        }
      } else {
        state.dragging = true;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
      }
      canvas.setPointerCapture?.(event.pointerId);
    });

    document.addEventListener('pointermove', (event) => {
      const canvas =
        event.target instanceof Element ? event.target.closest('[data-picture-crop-canvas]') : null;
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const modal = canvas.closest('[data-picture-editor-modal]');
      const state = modal ? pictureEditorState.get(modal) : null;
      if (!state) return;
      const rect = canvas.getBoundingClientRect();
      const canvasX = Math.max(
        0,
        Math.min(canvas.width, ((event.clientX - rect.left) / rect.width) * canvas.width),
      );
      const canvasY = Math.max(
        0,
        Math.min(canvas.height, ((event.clientY - rect.top) / rect.height) * canvas.height),
      );
      if (state.draggingSelection && state.selection) {
        state.selection = constrainSelection(
          {
            ...state.selection,
            x: state.selection.x + canvasX - state.lastCanvasX,
            y: state.selection.y + canvasY - state.lastCanvasY,
          },
          canvas,
        );
        state.lastCanvasX = canvasX;
        state.lastCanvasY = canvasY;
        state.edited = true;
        drawPictureCrop(state);
        return;
      }
      if (state.tool === 'crop' && !state.selecting) {
        canvas.dataset.pictureSelectionHover = String(
          pointInsideSelection(state.selection, canvasX, canvasY),
        );
      }
      if (state.selecting) {
        const x = canvasX;
        const y = canvasY;
        const startX = state.selectionStartX;
        const startY = state.selectionStartY;
        const rawWidth = Math.abs(x - startX);
        const rawHeight = Math.abs(y - startY);
        const aspect = Number(state.root.getAttribute('data-picture-crop-aspect-ratio') || 1);
        let width = rawWidth;
        let height = rawHeight;
        if (state.cropMode === 'proportional') {
          height = rawWidth / Math.max(0.1, aspect);
          if (height > rawHeight && rawHeight > 0) {
            height = rawHeight;
            width = rawHeight * aspect;
          }
        }
        state.selection = {
          x: x < startX ? startX - width : startX,
          y: y < startY ? startY - height : startY,
          width: Math.max(1, width),
          height: Math.max(1, height),
        };
        state.edited = true;
        drawPictureCrop(state);
        return;
      }
      if (!state.dragging) return;
      state.offsetX += event.clientX - state.lastX;
      state.offsetY += event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.edited = true;
      drawPictureCrop(state);
    });

    const stopPictureDrag = (event) => {
      const canvas =
        event.target instanceof Element ? event.target.closest('[data-picture-crop-canvas]') : null;
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const modal = canvas.closest('[data-picture-editor-modal]');
      const state = modal ? pictureEditorState.get(modal) : null;
      if (state) {
        if (
          state.selecting &&
          state.selection &&
          (state.selection.width < 4 || state.selection.height < 4)
        )
          state.selection = null;
        state.dragging = false;
        state.selecting = false;
        state.draggingSelection = false;
        delete canvas.dataset.pictureSelectionDragging;
        drawPictureCrop(state);
      }
    };
    document.addEventListener('pointerup', stopPictureDrag);
    document.addEventListener('pointercancel', stopPictureDrag);

    document.addEventListener('hidden.bs.modal', (event) => {
      const modal =
        event.target instanceof Element
          ? event.target.closest('[data-picture-editor-modal]')
          : null;
      if (!(modal instanceof HTMLElement)) return;
      const state = pictureEditorState.get(modal);
      if (state?.batch) {
        state.batch.items.forEach((item) => {
          if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
        });
      } else if (state?.objectUrl) URL.revokeObjectURL(state.objectUrl);
      pictureEditorState.delete(modal);
      setPictureEditorBatchPresentation(modal, false);
      pictureEditorError(modal);
    });

    const registerPictureContributors = () => {
      document.querySelectorAll('[data-picture-field]').forEach((root) => {
        if (!(root instanceof HTMLElement) || root.dataset.pictureContributorRegistered === 'true')
          return;
        const payload = root.querySelector('[data-picture-change-payload]');
        if (!(payload instanceof HTMLInputElement)) return;
        const key = payload.dataset.pictureFieldKey || 'picture';
        root.dataset.pictureContributorRegistered = 'true';
        const register = () =>
          root.closest('form')?.dispatchEvent(
            new CustomEvent('manatos:form-contributor-register', {
              bubbles: true,
              detail: {
                id: `picture:${key}`,
                contributor: () => ({
                  dirty: Boolean(payload.value),
                  valid: true,
                  blocked: false,
                  blockingCount: 0,
                }),
              },
            }),
          );
        register();
        root.closest('form')?.addEventListener('manatos:form-state-ready', register);
        root.closest('form')?.addEventListener('manatos:form-saved', () => {
          payload.value = '';
          root
            .closest('form')
            ?.dispatchEvent(new Event('manatos:form-contributor-state', { bubbles: true }));
        });
      });
    };
    registerPictureContributors();

    const registerPicturesLifecycle = () => {
      document.querySelectorAll('[data-pictures-field]').forEach((root) => {
        if (!(root instanceof HTMLElement) || root.dataset.picturesLifecycleRegistered === 'true')
          return;
        const payload = root.querySelector('[data-pictures-change-payload]');
        if (!(payload instanceof HTMLInputElement)) return;
        const key = root.dataset.fieldKey || 'pictures';
        const form = root.closest('form');
        root.dataset.picturesLifecycleRegistered = 'true';

        // Final submission-time synchronization guarantees that normal navigation
        // saves and in-place saves use the same canonical CTX dirty decision.
        form?.addEventListener('submit', () => syncPicturesReplacementPayload(root), true);

        form?.addEventListener('manatos:form-saved', (event) => {
          payload.value = '';
          const detail = event instanceof CustomEvent ? event.detail || {} : {};
          const persisted = Array.isArray(detail.record?.[key]) ? detail.record[key] : null;
          if (persisted) {
            const canonical = root.querySelector('[data-pictures-canonical-value]');
            if (canonical instanceof HTMLInputElement) canonical.value = JSON.stringify(persisted);
            // Rebuild from the authoritative server descriptors after every Save.
            // This removes pending/deleted DOM artifacts and guarantees that the
            // visible collection count/order exactly matches persisted storage.
            rehydratePictures(root);
          }
        });
      });
    };
    registerPicturesLifecycle();

    return Object.freeze({ owningEntryPath });
  };

  window.ManatOS.pictureFieldRuntime = Object.freeze({ install });
})();
