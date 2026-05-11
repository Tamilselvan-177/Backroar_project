import { z } from "zod";

export const wishlistProductBodySchema = z.object({
  productId: z.coerce.number().int().positive(),
});
