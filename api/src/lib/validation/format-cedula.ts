export function formatCedula(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
    : value;
}
