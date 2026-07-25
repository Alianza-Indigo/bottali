import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

const PASSWORD_MIN_LENGTH = 10;

export function evaluatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    reasons.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!/[a-z]/.test(password)) reasons.push("Debe incluir una letra minúscula.");
  if (!/[A-Z]/.test(password)) reasons.push("Debe incluir una letra mayúscula.");
  if (!/[0-9]/.test(password)) reasons.push("Debe incluir un número.");
  return { valid: reasons.length === 0, reasons };
}
