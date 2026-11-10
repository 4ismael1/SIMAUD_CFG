import type { RichNode } from "./types.js";

export interface CellPosition {
  cell: RichNode;
  row: number;
  column: number;
  index: number;
}

export function tableGrid(table: RichNode) {
  const rows = table.content ?? [];
  const occupied = rows.map(() => Array<boolean>(12).fill(false));
  const positions: CellPosition[] = [];
  let width = 0;
  for (const [row, tableRow] of rows.entries()) {
    let column = 0;
    for (const [index, cell] of (tableRow.content ?? []).entries()) {
      while (occupied[row]![column]) column++;
      const colspan = cell.attrs?.colspan ?? 1;
      const rowspan = cell.attrs?.rowspan ?? 1;
      if (column + colspan > 12 || row + rowspan > rows.length)
        return { error: ["content", row, "content", index, "attrs"], positions, width };
      for (let y = row; y < row + rowspan; y++) {
        for (let x = column; x < column + colspan; x++) {
          if (occupied[y]![x])
            return { error: ["content", row, "content", index, "attrs"], positions, width };
          occupied[y]![x] = true;
        }
      }
      if (cell.attrs?.colwidth && cell.attrs.colwidth.length !== colspan)
        return { error: ["content", row, "content", index, "attrs", "colwidth"], positions, width };
      positions.push({ cell, row, column, index });
      column += colspan;
      width = Math.max(width, column);
    }
  }
  if (occupied.some((row) => row.slice(0, width).some((cell) => !cell)))
    return { error: ["content"], positions, width };
  return { positions, width };
}
