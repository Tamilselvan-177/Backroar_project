import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

export const registerBodySchema = z
  .object({
    name: z.string().min(3),
    email: z.string().email(),
    phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
    password: z.string().min(6),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(16),
    password: z.string().min(6),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const googleLoginBodySchema = z.object({
  id_token: z.string().min(20),
});
