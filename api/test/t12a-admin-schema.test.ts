import { expect, it } from "vitest";
import { bulkInput } from "../src/modules/contracts/admin-routes.js";

it("un UUID repetido con otras mayúsculas sigue siendo el mismo contrato del lote", () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  expect(bulkInput.safeParse({ action: "archive", ids: [id] }).success).toBe(true);
  expect(bulkInput.safeParse({ action: "archive", ids: [id, id.toUpperCase()] }).success).toBe(
    false,
  );
});
