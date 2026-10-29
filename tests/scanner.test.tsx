// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Scanner, { qrBox } from "../src/Scanner";
const mock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  scanFile: vi.fn(),
  instance: null as any,
}));
vi.mock("html5-qrcode", () => ({
  Html5QrcodeSupportedFormats: { QR_CODE: 0 },
  Html5Qrcode: class {
    isScanning = false;
    constructor() {
      mock.instance = this;
    }
    start(...args: any[]) {
      return mock.start(...args).then(() => {
        this.isScanning = true;
      });
    }
    stop() {
      this.isScanning = false;
      return mock.stop();
    }
    clear() {
      mock.clear();
    }
    scanFile(...args: any[]) {
      return mock.scanFile(...args);
    }
  },
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mock.start.mockResolvedValue(undefined);
  mock.stop.mockResolvedValue(undefined);
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
    configurable: true,
  });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(onRead = vi.fn()) {
  await act(async () => root.render(<Scanner onRead={onRead} />));
  return onRead;
}
async function click() {
  await act(async () => host.querySelector("button")!.click());
}
it.each([
  [320, 180],
  [260, 400],
  [160, 120],
])("el recuadro entra en una cámara de %i por %i", (w, h) => {
  const box = qrBox(w, h);
  expect(box.width).toBeLessThan(Math.min(w, h));
  expect(box.width).toBe(box.height);
});
it("abre desde el botón, usa cámara trasera y la cierra al salir", async () => {
  await render();
  expect(mock.start).not.toHaveBeenCalled();
  await click();
  expect(mock.start.mock.calls[0][0]).toEqual({ facingMode: "environment" });
  expect(host.textContent).toContain("Cerrar cámara");
  await click();
  expect(mock.stop).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Abrir cámara");
});
it("explica un permiso rechazado y permite reintentar", async () => {
  mock.start.mockRejectedValueOnce(
    new DOMException("denied", "NotAllowedError"),
  );
  await render();
  await click();
  expect(host.textContent).toContain("La cámara no tiene permiso");
  expect(host.querySelector("button")!.disabled).toBe(false);
  await click();
  expect(host.textContent).toContain("Cerrar cámara");
});
it("lee una sola vez y detiene la cámara antes de buscar la inscripción", async () => {
  const read = await render();
  await click();
  const callback = mock.start.mock.calls[0][2];
  await act(async () => {
    callback("CAL:qr");
    callback("CAL:qr");
  });
  expect(read).toHaveBeenCalledExactlyOnceWith("CAL:qr");
  expect(mock.stop).toHaveBeenCalledOnce();
});
it("conserva una lectura del primer fotograma durante el inicio", async () => {
  mock.start.mockImplementationOnce(async (_a, _b, success) =>
    success("CAL:primero"),
  );
  const read = await render();
  await click();
  expect(read).toHaveBeenCalledExactlyOnceWith("CAL:primero");
  expect(mock.stop).toHaveBeenCalledOnce();
});
it("cierra un inicio pendiente cuando el administrador sale de la pantalla", async () => {
  let resolve!: () => void;
  mock.start.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
  await render();
  await click();
  await act(async () => root.unmount());
  await act(async () => resolve());
  expect(mock.stop).toHaveBeenCalledOnce();
  // Evitar un segundo unmount desde afterEach.
  root = createRoot(host);
});
it("lee una foto en el dispositivo sin acceder al servidor", async () => {
  mock.scanFile.mockResolvedValue("CAL:foto");
  const read = await render();
  const input = host.querySelector("input[type=file]") as HTMLInputElement;
  const file = new File(["qr"], "qr.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(mock.scanFile).toHaveBeenCalledWith(file, false);
  expect(read).toHaveBeenCalledExactlyOnceWith("CAL:foto");
});
