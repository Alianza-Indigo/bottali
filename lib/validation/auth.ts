import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Correo electrónico inválido").max(320),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200),
  displayName: z.string().min(1, "El nombre es obligatorio").max(120),
  acceptedPrivacyPolicy: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar el aviso de privacidad." }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const resendVerificationSchema = z.object({
  email: z.string().email().max(320),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(320),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200),
});
