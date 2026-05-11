import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const twigPath = path.join(root, "backroarWebstieWIthBillingSystem/App/Views/category/view.twig");
const outPath = path.join(root, "apps/web/src/styles/category-view.css");

const t = fs.readFileSync(twigPath, "utf8");
const m = t.match(/<style>([\s\S]*?)<\/style>/);
if (!m) throw new Error("No <style> in category/view.twig");
const css = m[1].trim().replace(/\bproduct-card\b/g, "cat-plp-card");
fs.writeFileSync(outPath, `${css}\n`);
console.log("Wrote", outPath);
