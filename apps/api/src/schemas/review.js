import { z } from "zod";

export const reviewCreateBodySchema = z.object({
  productId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(1, "Review title is required").max(200),
  comment: z
    .string()
    .trim()
    .min(10, "Comment must be at least 10 characters")
    .max(2000, "Comment must be 2000 characters or less"),
});
