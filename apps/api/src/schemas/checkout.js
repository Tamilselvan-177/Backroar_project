import { z } from "zod";

const trimmed = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string());

export const checkoutShippingSchema = z.object({
  full_name: trimmed.pipe(z.string().min(1).max(200)),
  phone: trimmed.pipe(z.string().min(5).max(40)),
  address_line1: trimmed.pipe(z.string().min(1).max(500)),
  address_line2: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => (s == null ? "" : String(s).trim()))
    .pipe(z.string().max(500)),
  city: trimmed.pipe(z.string().min(1).max(120)),
  state: trimmed.pipe(z.string().min(1).max(120)),
  pincode: trimmed.pipe(z.string().min(3).max(20)),
});

export const checkoutBodySchema = z.object({
  shipping: checkoutShippingSchema,
  couponCode: z.string().max(64).optional(),
});

export const checkoutCouponPreviewSchema = z.object({
  couponCode: trimmed.pipe(z.string().min(1).max(64)),
});
