function hasJspm() {
  return typeof window !== "undefined" && window.JSPM && window.JSPM.JSPrintManager;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function ensureJspmLoaded() {
  if (hasJspm()) return true;
  const candidates = [
    "/public/vendor/jspm/JSPrintManager.js",
    "/JSPrintManager.js",
    "https://jsprintmanager.azurewebsites.net/scripts/JSPrintManager.js",
  ];
  for (const src of candidates) {
    try {
      await loadScript(src);
      if (hasJspm()) return true;
    } catch {
      /* try next source */
    }
  }
  throw new Error("JSPrintManager.js not loaded. Install JSPM 8 script in web public assets.");
}

export async function connectJspm(timeoutMs = 8000) {
  await ensureJspmLoaded();
  const manager = window.JSPM.JSPrintManager;
  manager.auto_reconnect = true;
  manager.start();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (manager.websocket_status === window.JSPM.WSStatus.Open) return true;
    if (manager.websocket_status === window.JSPM.WSStatus.Blocked) {
      throw new Error("JSPM blocked this website; allow this origin in JSPrintManager settings.");
    }
    await wait(150);
  }
  throw new Error("Could not connect to JSPrintManager desktop service.");
}

export async function getInstalledPrinters() {
  await connectJspm();
  const list = await window.JSPM.JSPrintManager.getPrinters();
  const names = (list || []).map((p) => (typeof p === "string" ? p : p?.name || String(p))).filter(Boolean);
  return [...new Set(names)];
}

export async function sendTsplToInstalledPrinter(printerName, tspl) {
  await connectJspm();
  const name = String(printerName || "").trim();
  if (!name) throw new Error("Select an installed printer.");
  const cpj = new window.JSPM.ClientPrintJob();
  cpj.clientPrinter = new window.JSPM.InstalledPrinter(name);
  cpj.printerCommands = String(tspl || "");
  cpj.sendToClient();
  return { success: true };
}
