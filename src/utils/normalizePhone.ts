// Normalizira broj telefona u međunarodni format (38591...)
// Podržava: 091..., 0911..., +38591..., 38591...
export const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/\s+/g, "").replace(/^\+/, "");

  if (cleaned.startsWith("0")) {
    cleaned = "385" + cleaned.slice(1);
  }

  return cleaned;
};
