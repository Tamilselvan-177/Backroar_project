import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const twigPath = path.join(root, "backroarWebstieWIthBillingSystem/App/Views/product/detail.twig");
const outPath = path.join(root, "apps/web/src/styles/product-detail.css");

const t = fs.readFileSync(twigPath, "utf8");
const m = t.match(/<style>([\s\S]*?)<\/style>/);
if (!m) throw new Error("No <style> block in detail.twig");
fs.writeFileSync(outPath, `${m[1].trim()}\n`);
console.log("Wrote", outPath);
