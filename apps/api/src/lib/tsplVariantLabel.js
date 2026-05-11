/**
 * TSPL label commands (two_up_72x25 layout + single 35×25mm fallback). Code 128 barcode.
 */

const DPI = 203;

export function tsplEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function mmToDots(mm) {
  return Math.round((Number(mm) / 25.4) * DPI);
}

/** Unicode-aware length for font sizing (mirrors mb_strlen). */
export function textLen(value) {
  return [...String(value)].length;
}

export function textSubstr(value, start, length) {
  const chars = [...String(value)];
  if (length == null) return chars.slice(start).join("");
  return chars.slice(start, start + length).join("");
}

export function formatPriceInr(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return "₹0.00";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pickFont(text, cellW) {
  const len = textLen(text);
  if (len <= Math.floor(cellW / 16)) {
    return { font: "3", lineH: 24 };
  }
  if (len <= Math.floor(cellW / 10)) {
    return { font: "2", lineH: 16 };
  }
  return { font: "1", lineH: 14 };
}

export function appendLabelBlock(lines, x, itemName, brand, barcodeValue, priceText) {
  const margin = 8;
  const offsetX = x + margin;
  const cellW = 279 - margin * 2;

  const itemFont = pickFont(itemName, cellW);
  const brandFont = pickFont(brand, cellW);
  const priceFont = pickFont(priceText, cellW);

  const yItem = 20;
  const yBrand = yItem + itemFont.lineH + 6;
  const yBarcode = yBrand + brandFont.lineH + 8;

  const barcodeBottom = 162;
  const barcodeH = Math.max(50, barcodeBottom - yBarcode);
  const yPrice = barcodeBottom + 10;

  const barcodeW = 195;
  const xBarcode = offsetX + Math.floor((cellW - barcodeW) / 2);

  lines.push(
    `BLOCK ${offsetX},${yItem},${cellW},${itemFont.lineH},"${itemFont.font}",0,1,1,0,1,"${tsplEscape(itemName)}"`
  );
  lines.push(
    `BLOCK ${offsetX},${yBrand},${cellW},${brandFont.lineH},"${brandFont.font}",0,1,1,0,1,"${tsplEscape(brand)}"`
  );
  lines.push(
    `BARCODE ${xBarcode},${yBarcode},"128",${barcodeH},0,0,2,3,"${tsplEscape(barcodeValue)}"`
  );
  lines.push(
    `BLOCK ${offsetX},${yPrice},${cellW},${priceFont.lineH},"${priceFont.font}",0,1,1,0,1,"${tsplEscape(priceText)}"`
  );
}

/**
 * @param {object} opts
 * @param {string} opts.itemName
 * @param {string} opts.brand
 * @param {string} opts.barcodeValue
 * @param {string} opts.priceText
 * @param {number} opts.count
 * @param {boolean} [opts.autoCut]
 * @param {string} [opts.layout] two_up_72x25 | single_35x25
 * @param {"left"|"right"} [opts.remainderSide] For odd label count on two-up layout: print last label in left or right slot (other slot blank).
 */
export function buildTsplVariantLabel(opts) {
  let itemName = String(opts.itemName ?? "ITEM")
    .trim()
    .toUpperCase();
  let brand = String(opts.brand ?? "BRAND")
    .trim()
    .toUpperCase();
  const barcodeValue = String(opts.barcodeValue ?? "");
  const priceText = String(opts.priceText ?? "");
  const autoCut = opts.autoCut !== false;
  const rawLayout = opts.layout ?? "two_up_72x25";

  if (textLen(itemName) > 33) itemName = textSubstr(itemName, 0, 33);
  if (textLen(brand) > 33) brand = textSubstr(brand, 0, 33);

  const total = Math.max(1, Math.min(999, Number(opts.count) || 1));
  const remainderSide = opts.remainderSide === "right" ? "right" : "left";
  const lines = [];

  if (rawLayout === "two_up_72x25") {
    lines.push("SIZE 72 mm,25 mm");
    lines.push("GAP 2 mm,0");
    lines.push("DIRECTION 1,0");
    lines.push("REFERENCE 0,0");
    lines.push("OFFSET 0 mm");

    if (autoCut) lines.push("SET CUTTER ON");

    const leftX = 0;
    const rightX = mmToDots(35.0);

    const pairs = Math.floor(total / 2);
    const hasRemainder = total % 2 === 1;

    if (pairs > 0) {
      lines.push("CLS");
      appendLabelBlock(lines, leftX, itemName, brand, barcodeValue, priceText);
      appendLabelBlock(lines, rightX, itemName, brand, barcodeValue, priceText);
      lines.push(`PRINT ${pairs},1`);
    }

    if (hasRemainder) {
      lines.push("CLS");
      const oddX = remainderSide === "right" ? rightX : leftX;
      appendLabelBlock(lines, oddX, itemName, brand, barcodeValue, priceText);
      lines.push("PRINT 1,1");
    }

    if (autoCut) lines.push("SET CUTTER OFF");

    return `${lines.join("\r\n")}\r\n`;
  }

  lines.push("SIZE 35 mm,25 mm");
  lines.push("GAP 2 mm,0");
  lines.push("DIRECTION 1,0");
  lines.push("REFERENCE 0,0");
  lines.push("OFFSET 0 mm");

  if (autoCut) lines.push("SET CUTTER ON");

  lines.push("CLS");
  appendLabelBlock(lines, 0, itemName, brand, barcodeValue, priceText);
  lines.push(`PRINT ${total},1`);

  if (autoCut) lines.push("SET CUTTER OFF");

  return `${lines.join("\r\n")}\r\n`;
}
