import { expect, it } from "vitest";
import { deltaOf } from "./report-utils";

it("conserva el sentido de una diferencia de un centavo fuera de la precisión de Number", () => {
  expect(
    deltaOf({ value: "1009999999999998.99", previous: "1009999999999998.98" }),
  ).toEqual({
    text: "+0,0 %",
    tone: "up",
  });
  expect(deltaOf({ value: "100.00", previous: "100.0" })).toEqual({
    text: "0,0 %",
    tone: "flat",
  });
  expect(deltaOf({ value: "10.00", previous: "0.00" })).toBeNull();
});
