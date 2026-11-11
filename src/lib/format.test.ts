import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyShort,
  formatDate,
  formatDateTime,
  formatRelative,
  daysUntil,
  formatCedula,
  isValidCedula,
  formatPhone,
  compareMoney,
  moneyChangePercent,
} from "./format";
describe("formato dominicano", () => {
  it("compara centavos de grandes importes y calcula porcentajes con decimales exactos", () => {
    expect(compareMoney("1009999999999998.99", "1009999999999998.98")).toBe(1);
    expect(compareMoney("1.0", "1.00")).toBe(0);
    expect(moneyChangePercent("100.01", "100.00")).toBe("+0,0 %");
    expect(moneyChangePercent("150.00", "100.00")).toBe("+50,0 %");
    expect(moneyChangePercent("99.00", "100.00")).toBe("-1,0 %");
    expect(moneyChangePercent("1.00", "0.00")).toBeNull();
  });
  it("formatea montos decimales y conserva precisión sin convertir strings a float", () => {
    expect(formatMoney("87500")).toBe("RD$ 87.500,00");
    expect(formatMoney("9007199254740993.99")).toBe(
      "RD$ 9.007.199.254.740.993,99",
    );
    expect(formatMoney("9.995")).toBe("RD$ 10,00");
    expect(formatMoney("-12.30")).toBe("-RD$ 12,30");
    expect(formatMoney(0)).toBe("RD$ 0,00");
    expect(() => formatMoney("texto")).toThrow(RangeError);
  });
  it("abrevia miles y millones", () => {
    expect(formatMoneyShort("42600000")).toBe("RD$ 42,6 M");
    expect(formatMoneyShort("-42600000")).toBe("-RD$ 42,6 M");
    expect(formatMoneyShort("12500")).toBe("RD$ 12,5 mil");
    expect(formatMoneyShort(50)).toBe("RD$ 50,00");
  });
  it("muestra fechas sin desplazar el día ISO por la zona horaria", () => {
    expect(formatDate("2026-11-09")).toBe("9 nov 2026");
    expect(formatDateTime("2026-11-09T16:30:00Z")).toBe("9 nov 2026, 12:30");
    expect(() => formatDate("inválida")).toThrow(RangeError);
  });
  it("calcula días de calendario y tiempos relativos con reloj inyectado", () => {
    const now = "2026-11-09T16:00:00Z";
    expect(formatRelative("2026-11-09T14:00:00Z", now)).toBe("hace 2 h");
    expect(formatRelative("2026-11-21T16:00:00Z", now)).toBe("en 12 días");
    expect(formatRelative("2026-11-09T15:59:45Z", now)).toBe("ahora");
    expect(daysUntil("2026-11-10", now)).toBe(1);
    expect(daysUntil("2026-11-08", now)).toBe(-1);
    expect(daysUntil("2026-11-09", now)).toBe(0);
  });
  it("acepta toda cédula de 11 dígitos (también las que no cumplen el dígito verificador) y rechaza lo mal formado", () => {
    expect(isValidCedula("00113918205")).toBe(true);
    expect(isValidCedula("001-1391820-5")).toBe(true);
    expect(isValidCedula("40200700678")).toBe(true);
    // Real cédulas issued by the JCE that fail the usual check-digit formula.
    expect(isValidCedula("402-3454518-6")).toBe(true);
    expect(isValidCedula("00113918206")).toBe(true);
    expect(isValidCedula("00000000000")).toBe(false);
    expect(isValidCedula("abc00113918205")).toBe(false);
    expect(isValidCedula("123")).toBe(false);
    expect(formatCedula("00113918205")).toBe("001-1391820-5");
    expect(formatCedula("123")).toBe("123");
  });
  it("formatea teléfonos locales y con prefijo de país", () => {
    expect(formatPhone("8095551234")).toBe("(809) 555-1234");
    expect(formatPhone("18095551234")).toBe("+1 (809) 555-1234");
    expect(formatPhone("123")).toBe("123");
  });
});
