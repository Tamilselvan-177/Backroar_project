import net from "node:net";

/**
 * Send raw TSPL text to a network printer (port 9100 by default).
 * Opens a TCP socket, writes TSPL bytes, then closes.
 */
export function sendTsplToNetwork({ tspl, host, port = 9100, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const payload = String(tspl ?? "");
    const targetHost = String(host ?? "").trim();
    const targetPort = Number(port) || 9100;
    const to = Math.max(1000, Number(timeoutMs) || 5000);

    function done(result) {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    }

    if (!targetHost || payload.length === 0) {
      done({ success: false, message: "host and tspl are required" });
      return;
    }

    socket.setTimeout(to, () => {
      done({ success: false, message: `Connection timed out after ${to}ms` });
    });

    socket.once("error", (err) => {
      done({ success: false, message: err?.message || "Network printer error" });
    });

    socket.connect(targetPort, targetHost, () => {
      socket.write(payload, (err) => {
        if (err) {
          done({ success: false, message: err.message || "Failed to write TSPL payload" });
          return;
        }
        socket.end(() => {
          done({
            success: true,
            message: `TSPL sent to ${targetHost}:${targetPort}`,
            bytes: Buffer.byteLength(payload, "utf8"),
          });
        });
      });
    });
  });
}
