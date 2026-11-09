/** Telefone → link de conversa no WhatsApp. */

/**
 * Normaliza um telefone brasileiro para o formato que o wa.me espera
 * (só dígitos, com código do país).
 *
 * "(21) 99876-5432" → "5521998765432"
 * "+55 21 99876-5432" → "5521998765432"
 * Devolve null quando não há dígitos suficientes para um número discável.
 */
export function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');

  // Já veio com código do país.
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    return digits;
  }
  // DDD + 8 ou 9 dígitos.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}

/** URL de conversa, ou null se o telefone não for utilizável. */
export function waLink(phone: string | null | undefined): string | null {
  const num = waNumber(phone);
  return num ? `https://wa.me/${num}` : null;
}
