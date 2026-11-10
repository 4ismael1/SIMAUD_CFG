import { describe, expect, it } from "vitest";
import cases from "./cases.json";
import * as validation from "./index";
const validators: Record<
  string,
  (input: string) => validation.ValidationResult
> = {
  validateCedula: validation.validateCedula,
  validateRnc: validation.validateRnc,
  validatePhoneDo: validation.validatePhoneDo,
  validateEmail: validation.validateEmail,
  validatePersonName: validation.validatePersonName,
  validatePassword: validation.validatePassword,
  validateMoney: validation.validateMoney,
  validateIsoDate: validation.validateIsoDate,
  validateFreeText: validation.validateFreeText,
};
for (const [name, rows] of Object.entries(cases)) {
  describe(name, () => {
    for (const [input, expected] of rows) {
      it("valida " + JSON.stringify(input), () => {
        const result = validators[name]!(input!);
        if (expected === null) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
        } else expect(result).toEqual({ ok: true, value: expected });
      });
    }
  });
}
it("identifica cédula o RNC y rechaza documentos inválidos", () => {
  expect(validation.validateTaxId("001-1391820-5")).toEqual({
    ok: true,
    value: { type: "cedula", value: "00113918205" },
  });
  expect(validation.validateTaxId("1-01-01063-2")).toEqual({
    ok: true,
    value: { type: "rnc", value: "101010632" },
  });
  expect(validation.validateTaxId("123").ok).toBe(false);
});
it("exige rango cronológico válido y permite configurar texto y nombre", () => {
  expect(validation.isAfter("2026-01-02", "2026-01-01")).toBe(true);
  for (const end of ["2026-01-01", "2025-01-01", "2026-02-30"])
    expect(validation.validateDateRange("2026-01-01", end).ok).toBe(false);
  expect(validation.validateDateRange("2026-01-01", "2026-01-02").ok).toBe(
    true,
  );
  expect(validation.validateFreeText("abc", 4, 5).ok).toBe(false);
  expect(validation.validateFreeText("abcdef", 1, 5).ok).toBe(false);
  expect(validation.validatePersonName("Ana", false).ok).toBe(true);
  expect(validation.formatPhoneDo("+1 (809) 555-1234")).toBe("809-555-1234");
});
