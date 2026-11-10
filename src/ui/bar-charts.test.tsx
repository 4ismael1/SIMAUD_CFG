import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ColumnChart } from "./bar-charts";

it("el tooltip conserva el importe exacto aunque la altura de la barra use una aproximación", () => {
  render(
    <ColumnChart
      labels={["Noviembre"]}
      ariaLabel="Importes"
      series={[
        {
          label: "Actual",
          color: "#000",
          values: [Number("1009999999999998.99")],
          displayValues: ["RD$ 1.009.999.999.999.998,99"],
        },
      ]}
    />,
  );
  expect(screen.getByText("RD$ 1.009.999.999.999.998,99")).toBeTruthy();
});
