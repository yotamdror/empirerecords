import { normalizePlate } from './data.mjs';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const CROP_WIDTH = 640;
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

// Plates have 4–8 characters and at least one digit; the digit rule drops
// state names and slogans like NEWYORK or EMPIRE. Tesseract's confidence is
// unreliable here (correct reads can score 0), so two agreeing reads filter instead.
function bestPlate(data) {
  let best = null;
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const part of [line, ...(line.words || [])]) {
          const plate = normalizePlate(part.text);
          const confidence = Number(part.confidence || 0);
          if (!/^[A-Z0-9]{4,8}$/.test(plate) || !/\d/.test(plate)) continue;
          if (!best || confidence > best.confidence) best = { plate, confidence };
        }
      }
    }
  }
  return best?.plate ?? null;
}

// Stretch the crop's brightness range so dim night frames have usable contrast.
function boostContrast(context, width, height) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = (pixels[i] * 77 + pixels[i + 1] * 150 + pixels[i + 2] * 29) >> 8;
    pixels[i] = gray;
    histogram[gray] += 1;
  }
  const total = width * height;
  let low = 0;
  let high = 255;
  for (let count = 0; low < 255 && (count += histogram[low]) < total * 0.02;) low += 1;
  for (let count = 0; high > 0 && (count += histogram[high]) < total * 0.02;) high -= 1;
  const range = Math.max(1, high - low);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.max(0, Math.min(255, ((pixels[i] - low) * 255) / range));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
}

function cameraError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Camera blocked. Type a plate below.';
  if (error?.name === 'NotFoundError') return 'No camera found. Type a plate below.';
  return error?.message || 'Camera didn’t start. Type a plate below.';
}

export class LivePlateScanner {
  constructor({ video, stage, guide, onRead, onLive, onStatus, onError }) {
    this.video = video;
    this.stage = stage;
    this.guide = guide;
    this.onRead = onRead;
    this.onLive = onLive;
    this.onStatus = onStatus;
    this.onError = onError;
    this.running = false;
    this.starting = false;
    this.paused = false;
    this.busy = false;
    this.timer = null;
    this.workerPromise = null;
    this.worker = null;
    this.stream = null;
    this.canvas = document.createElement('canvas');
    this.lastRead = null;
    this.ignore = null;
  }

  // Load the OCR worker ahead of time; it stays alive for the page's life.
  warmUp() {
    if (!this.workerPromise) {
      this.workerPromise = loadTesseract().then(async (Tesseract) => {
        const worker = await Tesseract.createWorker('eng', 1);
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        });
        return worker;
      });
      this.workerPromise.catch(() => { this.workerPromise = null; });
    }
    return this.workerPromise;
  }

  async start() {
    if (this.starting || this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onError('Camera needs HTTPS and a supported browser.');
      return;
    }

    this.onStatus('Loading scanner…');
    this.starting = true;
    try {
      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      const [workerResult, streamResult] = await Promise.allSettled([this.warmUp(), streamPromise]);
      if (streamResult.status === 'rejected' || workerResult.status === 'rejected') {
        if (streamResult.status === 'fulfilled') streamResult.value.getTracks().forEach((track) => track.stop());
        throw streamResult.status === 'rejected' ? streamResult.reason : workerResult.reason;
      }
      this.worker = workerResult.value;
      this.stream = streamResult.value;
      this.video.srcObject = this.stream;
      await this.video.play();
      this.running = true;
      this.paused = false;
      this.onLive();
      this.onStatus('Fit a plate in the box');
      this.scan();
    } catch (error) {
      this.onError(cameraError(error));
      this.stop();
    } finally {
      this.starting = false;
    }
  }

  pause() {
    this.paused = true;
    clearTimeout(this.timer);
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.lastRead = null;
    this.onStatus('Fit a plate in the box');
    this.scan();
  }

  stop() {
    this.running = false;
    this.paused = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.lastRead = null;
    this.ignore = null;
  }

  // Copy the part of the video under the on-screen guide box (video uses object-fit: cover).
  capture() {
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    if (!videoWidth || !videoHeight) return false;
    const stageRect = this.stage.getBoundingClientRect();
    const guideRect = this.guide.getBoundingClientRect();
    const scale = Math.max(stageRect.width / videoWidth, stageRect.height / videoHeight);
    const offsetX = (stageRect.width - videoWidth * scale) / 2;
    const offsetY = (stageRect.height - videoHeight * scale) / 2;
    const x = Math.max(0, (guideRect.left - stageRect.left - offsetX) / scale);
    const y = Math.max(0, (guideRect.top - stageRect.top - offsetY) / scale);
    const width = Math.min(videoWidth - x, guideRect.width / scale);
    const height = Math.min(videoHeight - y, guideRect.height / scale);
    if (width < 1 || height < 1) return false;
    this.canvas.width = CROP_WIDTH;
    this.canvas.height = Math.round(CROP_WIDTH * height / width);
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.video, x, y, width, height, 0, 0, this.canvas.width, this.canvas.height);
    boostContrast(context, this.canvas.width, this.canvas.height);
    return true;
  }

  handleRead(plate) {
    // Don't reopen the plate just closed until it has left the box.
    if (plate !== this.ignore) this.ignore = null;
    if (!plate || plate === this.ignore) {
      if (this.lastRead) this.onStatus('Fit a plate in the box');
      this.lastRead = null;
      return;
    }
    if (plate === this.lastRead) {
      this.ignore = plate;
      this.lastRead = null;
      this.onRead(plate);
      return;
    }
    this.lastRead = plate;
    this.onStatus(`Reading ${plate}…`);
  }

  async scan() {
    // busy keeps a pause/resume during recognition from starting a second loop.
    if (!this.running || this.paused || !this.worker || this.busy) return;
    if (!this.capture()) {
      this.timer = setTimeout(() => this.scan(), 200);
      return;
    }
    this.busy = true;
    try {
      const result = await this.worker.recognize(this.canvas, {}, { blocks: true, text: false });
      if (this.running && !this.paused) this.handleRead(bestPlate(result.data));
    } catch {
      // Skip a bad frame; the next one retries.
    } finally {
      this.busy = false;
    }
    if (this.running && !this.paused) this.timer = setTimeout(() => this.scan(), 60);
  }
}
