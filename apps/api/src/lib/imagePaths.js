/** Product image batch folder index from numeric id (default batch 1000). */
export function getImageFolder(productId, batchSize = 1000) {
  const bs = batchSize > 0 ? batchSize : 1000;
  const folderIndex = Math.floor(Number(productId) / bs);
  return String(folderIndex).padStart(3, "0");
}
