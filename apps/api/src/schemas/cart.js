import { z } from "zod";

export const cartAddBodySchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).default(1),
  variantId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

export const cartUpdateBodySchema = z.object({
  cartItemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(0),
});

export const cartRemoveBodySchema = z.object({
  cartItemId: z.coerce.number().int().positive(),
});

export const cartBuyNowBodySchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).default(1),
  variantId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});
