/**
 * Keeps auth UI in sync across tabs: session cookie is browser-wide, but each tab has its own
 * React state and CSRF memory. Notify after login / logout / register so other tabs refresh.
 */
const LS_KEY = "backroar_auth_rev";
const BC_NAME = "backroar-auth";

export function notifyAuthSessionChanged() {
  try {
    localStorage.setItem(LS_KEY, String(Date.now()));
  } catch {
    /* private mode or quota */
  }
  try {
    const bc = new BroadcastChannel(BC_NAME);
    bc.postMessage({ type: "auth" });
    bc.close();
  } catch {
    /* unsupported */
  }
}

/** @param {() => void | Promise<void>} onRefresh */
export function subscribeAuthSessionChanged(onRefresh) {
  let bc;
  const run = () => {
    Promise.resolve(onRefresh()).catch(() => {});
  };
  try {
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = run;
  } catch {
    /* ignore */
  }
  const onStorage = (e) => {
    if (e.key === LS_KEY) run();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
    window.removeEventListener("storage", onStorage);
  };
}
