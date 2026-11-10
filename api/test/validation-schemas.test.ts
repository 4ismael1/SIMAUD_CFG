import { expect, it } from "vitest";
import {
  zCedula,
  zRnc,
  zPhoneDo,
  zEmail,
  zPersonName,
  zMoney,
  zIsoDate,
} from "../src/lib/validation/zod.js";
import { normalizeTemplateValues } from "../src/lib/validation/template-values.js";
import { renewalInputSchema } from "../src/modules/renewals/schemas.js";
it("los adaptadores Zod devuelven valores normalizados", () => {
  expect(zCedula.parse("001-1391820-5")).toBe("00113918205");
  expect(zRnc.parse("1-01-01063-2")).toBe("101010632");
  expect(zPhoneDo.parse("+1 (809) 555-1234")).toBe("8095551234");
  expect(zEmail.parse(" A@EXAMPLE.COM ")).toBe("a@example.com");
  expect(zPersonName.parse(" Ana  Pérez ")).toBe("Ana Pérez");
  expect(zMoney.parse("87.500,50")).toBe("87500.50");
  expect(zIsoDate.safeParse("2026-02-30").success).toBe(false);
});
it("valida y normaliza variables tipadas y campos heredados del cliente", () => {
  const definitions = [
    { name: "documento", type: "cedula" },
    { name: "telefono", type: "phone" },
    { name: "correo", type: "email" },
    { name: "monto", type: "money" },
    { name: "fecha", type: "date" },
    { name: "cliente_cedula", type: "text" },
    { name: "cliente_telefono", type: "text" },
    { name: "cliente_email", type: "text" },
    { name: "valor_contrato", type: "number" },
  ];
  expect(
    normalizeTemplateValues(
      { documento: "001-1391820-5", monto: "87,500.50", cliente_cedula: "1-01-01063-2" },
      definitions,
    ),
  ).toEqual({ documento: "00113918205", monto: "87500.50", cliente_cedula: "101010632" });
  for (const [name, value] of [
    ["documento", "00000000000"],
    ["telefono", "2125551234"],
    ["correo", "x"],
    ["monto", "0"],
    ["fecha", "2026-02-30"],
    ["cliente_cedula", "x"],
    ["cliente_telefono", "x"],
    ["cliente_email", "x"],
    ["valor_contrato", "0"],
  ])
    expect(() => normalizeTemplateValues({ [name!]: value }, definitions)).toThrow();
});
it("renovación exige rango válido y valor positivo, normalizando ambos separadores", () => {
  const input = {
    contractId: "00000000-0000-4000-8000-000000000001",
    proposedStartDate: "2026-01-01",
    proposedEndDate: "2027-01-01",
    proposedValue: "87.500,50",
    reason: " Renovar ",
  };
  expect(renewalInputSchema.parse(input).proposedValue).toBe("87500.50");
  expect(renewalInputSchema.safeParse({ ...input, proposedValue: "0" }).success).toBe(false);
  expect(
    renewalInputSchema.safeParse({ ...input, proposedEndDate: input.proposedStartDate }).success,
  ).toBe(false);
});
