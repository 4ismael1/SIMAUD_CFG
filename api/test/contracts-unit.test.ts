import { describe, it, expect } from "vitest";
import { contractStatus } from "../src/db/schema.js";
import {
  transition,
  overrideTransition,
  transitions,
  type Status,
} from "../src/modules/contracts/state-machine.js";
import { renderTemplate, extractVariables } from "../src/lib/render-template.js";
import { loadEnv } from "../src/config/env.js";
describe("máquina de estados", () => {
  for (const status of contractStatus.enumValues)
    for (const action of [
      "submit",
      "approve",
      "reject",
      "edit",
      "sign",
      "decline",
      "cancel",
      "expireSoon",
      "expire",
      "renew",
      "uncancel",
      "invalid",
    ]) {
      it(status + " / " + action, () => {
        const next = transitions[status]?.[action];
        if (next) expect(transition(status, action)).toBe(next);
        else expect(() => transition(status, action)).toThrow();
      });
    }
  it("restaura únicamente estados cancelables", () => {
    for (const prev of ["pending_signatures", "active", "expiring_soon"] as Status[])
      expect(transition("cancelled", "uncancel", prev)).toBe(prev);
    expect(() => transition("cancelled", "uncancel", "draft")).toThrow();
    expect(overrideTransition("cancelled", "active", "active")).toBe("active");
    expect(() => overrideTransition("cancelled", "expired", "active")).toThrow();
  });
  for (const from of contractStatus.enumValues)
    for (const to of contractStatus.enumValues) {
      it("override " + from + " → " + to, () => {
        if (Object.values(transitions[from] ?? {}).includes(to))
          expect(overrideTransition(from, to)).toBe(to);
        else expect(() => overrideTransition(from, to)).toThrow();
      });
    }
});
describe("render", () => {
  it("escapa contenido y valores, conserva cero y deduplica marcadores", () => {
    expect(
      renderTemplate("<script>{{text}}</script> {{zero}} {{missing}} {{missing}}", {
        text: "<b>\"&' </b>",
        zero: 0,
      }),
    ).toEqual({
      html: "&lt;script&gt;&lt;b&gt;&quot;&amp;&#39; &lt;/b&gt;&lt;/script&gt; 0 {{missing}} {{missing}}",
      missing: ["missing"],
    });
    expect(extractVariables("{{ a }} {{a}} {{b}}")).toEqual(["a", "b"]);
  });
  it("formatea fecha es-DO, monto RD$, número sin moneda y select", () => {
    expect(
      renderTemplate(
        "{{fecha}} / {{monto}} / {{meses}} / {{opcion}}",
        { fecha: "2026-11-09", monto: "1234.56", meses: 12, opcion: "Mensual" },
        [
          { name: "fecha", type: "date" },
          { name: "monto", type: "money" },
          { name: "meses", type: "number" },
          { name: "opcion", type: "select", options: ["Mensual"] },
        ],
      ).html,
    ).toBe("9 de noviembre de 2026 / RD$ 1.234,56 / 12 / Mensual");
  });
  it("rechaza valores inválidos", () => {
    for (const [type, value] of [
      ["date", "2026-02-30"],
      ["number", "NaN"],
      ["select", "otra"],
    ])
      expect(() =>
        renderTemplate("{{v}}", { v: value }, [{ name: "v", type: type!, options: ["una"] }]),
      ).toThrow();
  });
});
it("TRUST_PROXY valida booleano, saltos, direcciones y CIDR sin exponer secretos", () => {
  const source = {
    DATABASE_URL: "postgres://u:p@localhost/dev",
    DATABASE_URL_TEST: "postgres://u:p@localhost/simaud_test",
    MAIL_PAYLOAD_KEY: "ab".repeat(32),
    SETTINGS_ENCRYPTION_KEY: "cd".repeat(32),
    JWT_ACCESS_SECRET: "a".repeat(32),
    APP_URL: "http://localhost",
  };
  expect(loadEnv(source).TRUST_PROXY).toBe(false);
  expect(loadEnv({ ...source, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
  expect(loadEnv({ ...source, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
  expect(loadEnv({ ...source, TRUST_PROXY: "127.0.0.1,10.0.0.0/8" }).TRUST_PROXY).toEqual([
    "127.0.0.1",
    "10.0.0.0/8",
  ]);
  expect(() => loadEnv({ ...source, TRUST_PROXY: "10.0.0.1/99" })).toThrow();
});
