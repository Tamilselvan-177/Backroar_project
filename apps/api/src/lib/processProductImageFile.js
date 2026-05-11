import { unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { configureCloudinary, isCloudinaryConfigured } from "./cloudinary.js";
import { getImageFolder } from "./imagePaths.js";

/**
 * Upload one temp image file to Cloudinary and attach to product (and variant row when set).
 * Shared by BullMQ worker and admin route synchronous fallback when Redis is off.
 */
export async function processProductImageFile({
  products,
  productId,
  tempPath,
  isPrimary,
  displayOrder,
  variantId,
}) {
  if (!isCloudinaryConfigured()) {
    throw new Error("cloudinary_not_configured");
  }
  const cloudinary = configureCloudinary();
  const folderBatch = getImageFolder(productId);
  const publicId = `product_${productId}_${randomBytes(6).toString("hex")}`;
  const folder = `${env.CLOUDINARY_UPLOAD_PREFIX}/products/${folderBatch}`;

  const result = await cloudinary.uploader.upload(tempPath, {
    folder,
    public_id: publicId,
    resource_type: "image",
  });

  try {
    await unlink(tempPath);
  } catch {
    /* ignore */
  }

  const url = result.secure_url || result.url;
  const vid = variantId != null ? Number(variantId) : null;
  await products.addImage({
    productId,
    imagePath: url,
    isPrimary: vid ? false : Boolean(isPrimary),
    displayOrder,
    variantId: vid && vid > 0 ? vid : null,
  });
  if (vid && vid > 0) {
    await products.updateVariantImagePath(productId, vid, url);
  }
  return { url };
}
