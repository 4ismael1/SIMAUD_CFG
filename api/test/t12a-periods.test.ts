import { expect, it } from "vitest";
import { overviewRanges, periods, periodInfo } from "../src/modules/reports/overview-periods.js";

it("calcula noventa días inclusivos con hoy en Santo Domingo y período previo de igual duración", () => {
  expect(overviewRanges({}, new Date("2026-11-01T03:00:00Z"))).toEqual({
    range: { from: "2026-08-03", to: "2026-10-31" },
    previousRange: { from: "2026-05-05", to: "2026-08-02" },
  });
  expect(overviewRanges({ from: "2024-02-28", to: "2024-03-01" })).toEqual({
    range: { from: "2024-02-28", to: "2024-03-01" },
    previousRange: { from: "2024-02-25", to: "2024-02-27" },
  });
});

it("usa año ISO y semana ISO al cruzar el año", () => {
  expect(periodInfo("2027-01-01", "week")).toEqual({ period: "2026-W53", label: "Sem 53" });
  expect(periodInfo("2027-01-04", "week")).toEqual({ period: "2027-W01", label: "Sem 1" });
  expect(
    periods({ from: "2026-12-31", to: "2027-01-05" }, "week").map((point) => point.period),
  ).toEqual(["2026-W53", "2027-W01"]);
});

it("delimita meses y trimestres parciales sin omitir ceros del rango", () => {
  expect(periods({ from: "2026-03-31", to: "2026-04-01" }, "quarter")).toEqual([
    { period: "2026-Q1", label: "T1 2026", from: "2026-03-31", to: "2026-03-31" },
    { period: "2026-Q2", label: "T2 2026", from: "2026-04-01", to: "2026-04-01" },
  ]);
  expect(
    periods({ from: "2026-01-31", to: "2026-03-01" }, "month").map((point) => point.period),
  ).toEqual(["2026-01", "2026-02", "2026-03"]);
});
