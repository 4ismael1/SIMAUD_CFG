import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { stampStatus, statusNotice } from "../src/modules/contracts/status-notice.js";
import type { Contract } from "../src/modules/contracts/service.js";

const unusedConnection = {} as never;
const contract = (status: Contract["status"]) =>
  ({ id: "c", status, endDate: "2026-12-31", amendedByContractId: null }) as Contract;

describe("estado visible en la ficha y el PDF", () => {
  it("un contrato vigente no lleva marca; borrador y vencido sí", async () => {
    expect(await statusNotice(unusedConnection, contract("active"))).toBeNull();
    expect(await statusNotice(unusedConnection, contract("expiring_soon"))).toBeNull();
    expect((await statusNotice(unusedConnection, contract("draft")))?.stamp).toBe("BORRADOR");
    const expired = await statusNotice(unusedConnection, contract("expired"));
    expect(expired).toMatchObject({ stamp: "VENCIDO", tone: "warning" });
    expect(expired?.at?.slice(0, 10)).toBe("2026-12-31");
  });

  it("la marca se aplica a todas las páginas sin perder ninguna", async () => {
    const source = await PDFDocument.create();
    source.addPage();
    source.addPage();
    const stamped = await stampStatus(Buffer.from(await source.save()), {
      status: "cancelled",
      stamp: "CANCELADO",
      title: "Contrato cancelado: ya no tiene efecto.",
      at: new Date().toISOString(),
      detail: "Motivo: Mutuo acuerdo — texto largo ".repeat(10),
      tone: "danger",
    });
    const result = await PDFDocument.load(stamped);
    expect(result.getPageCount()).toBe(2);
    expect(stamped.length).toBeGreaterThan(1000);
  });
});
