import { z } from "zod";
export const placementInput = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  scale: z.number().finite(),
});
export type SignaturePlacement = z.infer<typeof placementInput>;
export const automaticPlacement: SignaturePlacement = { x: 0.5, y: 0.5, scale: 1 };

export function placeSignature(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
  input: SignaturePlacement = automaticPlacement,
) {
  const scale = Math.max(0.5, Math.min(1, input.scale));
  const fit = Math.min(boxWidth / imageWidth, boxHeight / imageHeight) * scale;
  const width = imageWidth * fit;
  const height = imageHeight * fit;
  const x = Math.max(width / boxWidth / 2, Math.min(1 - width / boxWidth / 2, input.x));
  const y = Math.max(height / boxHeight / 2, Math.min(1 - height / boxHeight / 2, input.y));
  return {
    placement: { x, y, scale },
    left: x * boxWidth - width / 2,
    top: y * boxHeight - height / 2,
    width,
    height,
  };
}
