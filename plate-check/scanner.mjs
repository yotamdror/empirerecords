const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
// fast-plate-ocr cct-xs-v2-global (MIT, see models/LICENSE): 128×64 RGB in,
// 10 character slots × 37 classes out.
const MODEL_URL = new URL('./models/cct_xs_v2_global.onnx', import.meta.url).href;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
const INPUT_WIDTH = 128;
const INPUT_HEIGHT = 64;
// Averaging a few frames cancels sensor noise; the gate waits for a sure read.
// Tuned on 222 real US plates: ~88% of daytime plates open, ~5% of those wrong.
const FUSED_FRAMES = 4;
const MIN_CHAR_CONFIDENCE = 0.7;
const IGNORE_MS = 1500;
let ortLoad;

function loadOrt() {
  if (globalThis.ort) return Promise.resolve(globalThis.ort);
  ortLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${ORT_BASE}ort.wasm.min.js`;
    script.async = true;
    script.onload = () => globalThis.ort ? resolve(globalThis.ort) : reject(new Error('Scanner did not initialize.'));
    script.onerror = () => reject(new Error('Could not load the scanner. Check your connection.'));
    document.head.append(script);
  }).catch((error) => {
    ortLoad = null;
    throw error;
  });
  return ortLoad;
}

export async function createPlateModel() {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = ORT_BASE;
  ort.env.wasm.numThreads = 1; // GitHub Pages can't send the headers threads need.
  const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
  return async (rgb) => {
    const input = new ort.Tensor('uint8', rgb, [1, INPUT_HEIGHT, INPUT_WIDTH, 3]);
    const output = await session.run({ input });
    return output.plate.data;
  };
}

// Average per-slot probabilities over frames, then read the best character per slot.
// Returns the plate and its weakest character's probability.
export function decodePlate(frames) {
  const slots = frames[0].length / ALPHABET.length;
  let plate = '';
  let confidence = 1;
  for (let slot = 0; slot < slots; slot += 1) {
    let best = 0;
    let bestProbability = -1;
    for (let k = 0; k < ALPHABET.length; k += 1) {
      let probability = 0;
      for (const frame of frames) probability += frame[slot * ALPHABET.length + k];
      probability /= frames.length;
      if (probability > bestProbability) {
        best = k;
        bestProbability = probability;
      }
    }
    confidence = Math.min(confidence, bestProbability);
    if (ALPHABET[best] !== '_') plate += ALPHABET[best];
  }
  return { plate, confidence };
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
    this.modelPromise = null;
    this.model = null;
    this.stream = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = INPUT_WIDTH;
    this.canvas.height = INPUT_HEIGHT;
    this.frames = [];
    this.lastRead = null;
    this.ignore = null;
    this.ignoreSeenAt = 0;
  }

  // Load the model ahead of time; it stays loaded for the page's life.
  warmUp() {
    if (!this.modelPromise) {
      this.modelPromise = createPlateModel();
      this.modelPromise.catch(() => { this.modelPromise = null; });
    }
    return this.modelPromise;
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
      const [modelResult, streamResult] = await Promise.allSettled([this.warmUp(), streamPromise]);
      if (streamResult.status === 'rejected' || modelResult.status === 'rejected') {
        if (streamResult.status === 'fulfilled') streamResult.value.getTracks().forEach((track) => track.stop());
        throw streamResult.status === 'rejected' ? streamResult.reason : modelResult.reason;
      }
      this.model = modelResult.value;
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
    this.frames = [];
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
    this.frames = [];
    this.lastRead = null;
    this.ignore = null;
  }

  // Scale the part of the video under the on-screen guide box (video uses
  // object-fit: cover) to the model's 128×64 RGB input.
  capture() {
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    if (!videoWidth || !videoHeight) return null;
    const stageRect = this.stage.getBoundingClientRect();
    const guideRect = this.guide.getBoundingClientRect();
    const scale = Math.max(stageRect.width / videoWidth, stageRect.height / videoHeight);
    const offsetX = (stageRect.width - videoWidth * scale) / 2;
    const offsetY = (stageRect.height - videoHeight * scale) / 2;
    const x = Math.max(0, (guideRect.left - stageRect.left - offsetX) / scale);
    const y = Math.max(0, (guideRect.top - stageRect.top - offsetY) / scale);
    const width = Math.min(videoWidth - x, guideRect.width / scale);
    const height = Math.min(videoHeight - y, guideRect.height / scale);
    if (width < 1 || height < 1) return null;
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.video, x, y, width, height, 0, 0, INPUT_WIDTH, INPUT_HEIGHT);
    const rgba = context.getImageData(0, 0, INPUT_WIDTH, INPUT_HEIGHT).data;
    const rgb = new Uint8Array(INPUT_WIDTH * INPUT_HEIGHT * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    return rgb;
  }

  handleRead({ plate, confidence }) {
    const sure = confidence >= MIN_CHAR_CONFIDENCE && /^[A-Z0-9]{2,8}$/.test(plate);
    // Don't reopen the plate just closed until it has been out of the box for a moment.
    const now = Date.now();
    if (plate === this.ignore) this.ignoreSeenAt = now;
    else if (now - this.ignoreSeenAt > IGNORE_MS) this.ignore = null;
    if (!sure || plate === this.ignore) {
      if (this.lastRead) this.onStatus('Fit a plate in the box');
      this.lastRead = null;
      return;
    }
    if (plate === this.lastRead) {
      this.ignore = plate;
      this.ignoreSeenAt = now;
      this.lastRead = null;
      this.frames = [];
      this.onRead(plate);
      return;
    }
    this.lastRead = plate;
    this.onStatus(`Reading ${plate}…`);
  }

  async scan() {
    // busy keeps a pause/resume during a read from starting a second loop.
    if (!this.running || this.paused || !this.model || this.busy) return;
    const rgb = this.capture();
    if (!rgb) {
      this.timer = setTimeout(() => this.scan(), 200);
      return;
    }
    this.busy = true;
    try {
      const probabilities = await this.model(rgb);
      if (this.running && !this.paused) {
        this.frames = [...this.frames.slice(1 - FUSED_FRAMES), probabilities];
        this.handleRead(decodePlate(this.frames));
      }
    } catch {
      // Skip a bad frame; the next one retries.
    } finally {
      this.busy = false;
    }
    if (this.running && !this.paused) this.timer = setTimeout(() => this.scan(), 50);
  }
}
