import { normalizePlate } from './data.mjs';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let tesseractLoad;

function loadTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (tesseractLoad) return tesseractLoad;
  tesseractLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => globalThis.Tesseract ? resolve(globalThis.Tesseract) : reject(new Error('OCR library did not initialize.'));
    script.onerror = () => reject(new Error('Could not load the scanner. Check your connection.'));
    document.head.append(script);
  }).catch((error) => {
    tesseractLoad = null;
    throw error;
  });
  return tesseractLoad;
}

function plausiblePlate(text, bbox) {
  const plate = normalizePlate(text);
  if (!/^[A-Z0-9]{4,8}$/.test(plate)) return null;
  if (!bbox) return null;
  const width = bbox.x1 - bbox.x0;
  const height = bbox.y1 - bbox.y0;
  if (height <= 0 || width / height < 1.6) return null;
  return plate;
}

function extractCandidates(data) {
  const candidates = new Map();
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const parts = [line, ...(line.words || [])];
        for (const part of parts) {
          const plate = plausiblePlate(part.text, part.bbox);
          if (!plate) continue;
          const confidence = Number(part.confidence || 0);
          if (confidence < 35) continue;
          if (!candidates.has(plate) || candidates.get(plate).confidence < confidence) {
            candidates.set(plate, { plate, bbox: part.bbox, confidence });
          }
        }
      }
    }
  }
  return [...candidates.values()];
}

function cameraError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Camera blocked. Type a plate below.';
  if (error?.name === 'NotFoundError') return 'No camera found. Type a plate below.';
  return error?.message || 'Camera didn’t start. Type a plate below.';
}

export class LivePlateScanner {
  constructor({ video, stage, overlay, onSelect, onStable, onLive, onStatus, onError }) {
    this.video = video;
    this.stage = stage;
    this.overlay = overlay;
    this.onSelect = onSelect;
    this.onStable = onStable;
    this.onLive = onLive;
    this.onStatus = onStatus;
    this.onError = onError;
    this.running = false;
    this.starting = false;
    this.paused = false;
    this.busy = false;
    this.timer = null;
    this.worker = null;
    this.stream = null;
    this.canvas = document.createElement('canvas');
    this.observations = new Map();
    this.targets = new Map();
    this.stablePlate = null;
  }

  async start() {
    if (this.starting) return;
    if (this.running) {
      this.resume();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onError('Camera needs HTTPS and a supported browser.');
      return;
    }

    this.onStatus('Loading scanner…');
    this.starting = true;
    try {
      const workerPromise = loadTesseract().then(async (Tesseract) => {
        const worker = await Tesseract.createWorker('eng', 1);
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        });
        return worker;
      });
      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const [workerResult, streamResult] = await Promise.allSettled([workerPromise, streamPromise]);
      if (workerResult.status === 'rejected' || streamResult.status === 'rejected') {
        if (workerResult.status === 'fulfilled') await workerResult.value.terminate();
        if (streamResult.status === 'fulfilled') streamResult.value.getTracks().forEach((track) => track.stop());
        throw workerResult.status === 'rejected' ? workerResult.reason : streamResult.reason;
      }
      const worker = workerResult.value;
      const stream = streamResult.value;
      this.worker = worker;
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      this.running = true;
      this.paused = false;
      this.onLive();
      this.onStatus('Tap a highlighted plate');
      this.scan();
    } catch (error) {
      this.onError(cameraError(error));
      await this.stop();
    } finally {
      this.starting = false;
    }
  }

  clearTargets() {
    this.targets.clear();
    this.overlay.replaceChildren();
  }

  pause() {
    this.paused = true;
    clearTimeout(this.timer);
    this.clearTargets();
  }

  resume() {
    if (!this.running) return;
    if (!this.paused) return;
    this.paused = false;
    this.scan();
  }

  async stop() {
    this.running = false;
    this.paused = false;
    clearTimeout(this.timer);
    this.clearTargets();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    if (this.worker) await this.worker.terminate();
    this.worker = null;
    this.observations.clear();
    this.stablePlate = null;
  }

  capture() {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (!width || !height) return null;
    const cropWidth = Math.round(width * 0.9);
    const cropHeight = Math.round(height * 0.48);
    const cropX = Math.round((width - cropWidth) / 2);
    const cropY = Math.round((height - cropHeight) / 2);
    const canvasWidth = Math.min(1100, cropWidth);
    const canvasHeight = Math.round(canvasWidth * cropHeight / cropWidth);
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.canvas.getContext('2d', { willReadFrequently: true }).drawImage(
      this.video,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, canvasWidth, canvasHeight,
    );
    return { cropX, cropY, cropWidth, cropHeight, canvasWidth, canvasHeight, width, height };
  }

  mapBox(bbox, frame) {
    const stageWidth = this.stage.clientWidth;
    const stageHeight = this.stage.clientHeight;
    const scale = Math.max(stageWidth / frame.width, stageHeight / frame.height);
    const offsetX = (stageWidth - frame.width * scale) / 2;
    const offsetY = (stageHeight - frame.height * scale) / 2;
    const x0 = frame.cropX + bbox.x0 / frame.canvasWidth * frame.cropWidth;
    const y0 = frame.cropY + bbox.y0 / frame.canvasHeight * frame.cropHeight;
    const x1 = frame.cropX + bbox.x1 / frame.canvasWidth * frame.cropWidth;
    const y1 = frame.cropY + bbox.y1 / frame.canvasHeight * frame.cropHeight;
    return {
      left: Math.max(0, x0 * scale + offsetX),
      top: Math.max(0, y0 * scale + offsetY),
      width: Math.max(52, (x1 - x0) * scale),
      height: Math.max(36, (y1 - y0) * scale),
    };
  }

  showCandidates(candidates, frame) {
    const now = Date.now();
    const current = new Set();
    const stageWidth = this.stage.clientWidth;
    const stageHeight = this.stage.clientHeight;
    const shown = [];

    for (const candidate of candidates) {
      const box = this.mapBox(candidate.bbox, frame);
      if (box.left >= stageWidth || box.top >= stageHeight) continue;
      const previous = this.observations.get(candidate.plate);
      const hits = previous && now - previous.lastSeen < 3500 ? previous.hits + 1 : 1;
      this.observations.set(candidate.plate, { hits, lastSeen: now });
      current.add(candidate.plate);
      shown.push({ ...candidate, box, hits });
    }

    for (const [plate, observation] of this.observations) {
      if (!current.has(plate) && now - observation.lastSeen > 3500) this.observations.delete(plate);
    }

    // Reuse each plate's button so a tap in progress survives the next frame.
    for (const [plate, button] of this.targets) {
      if (!current.has(plate)) {
        button.remove();
        this.targets.delete(plate);
      }
    }
    for (const candidate of shown) {
      let button = this.targets.get(candidate.plate);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.textContent = candidate.plate;
        button.setAttribute('aria-label', `Look up plate ${candidate.plate}`);
        button.addEventListener('click', () => this.onSelect(candidate.plate));
        this.targets.set(candidate.plate, button);
        this.overlay.append(button);
      }
      button.className = `plate-target${candidate.hits >= 2 ? ' stable' : ''}`;
      button.style.left = `${candidate.box.left}px`;
      button.style.top = `${candidate.box.top}px`;
      button.style.width = `${Math.min(stageWidth - candidate.box.left, candidate.box.width)}px`;
      button.style.height = `${Math.min(stageHeight - candidate.box.top, candidate.box.height)}px`;
    }

    const stable = shown.filter((candidate) => candidate.hits >= 2)
      .sort((a, b) => {
        const distance = (item) => Math.abs(item.box.left + item.box.width / 2 - stageWidth / 2)
          + Math.abs(item.box.top + item.box.height / 2 - stageHeight / 2);
        return distance(a) - distance(b);
      })[0];

    if (stable && stable.plate !== this.stablePlate) {
      this.stablePlate = stable.plate;
      this.onStable(stable.plate);
    } else if (!stable) {
      this.stablePlate = null;
    }
  }

  async scan() {
    // busy keeps a pause/resume during recognition from starting a second loop.
    if (!this.running || this.paused || !this.worker || this.busy) return;
    const frame = this.capture();
    if (!frame) {
      this.timer = setTimeout(() => this.scan(), 250);
      return;
    }
    this.busy = true;
    try {
      const result = await this.worker.recognize(this.canvas, {}, { blocks: true, text: false });
      if (this.running && !this.paused) this.showCandidates(extractCandidates(result.data), frame);
    } catch {
      // Skip a bad frame; the next one retries.
    } finally {
      this.busy = false;
    }
    if (this.running && !this.paused) this.timer = setTimeout(() => this.scan(), 160);
  }
}
