import { ApiError } from "../errors.js";

export function concurrencyLimit(maximum: number) {
  let active = 0;
  return async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    if (active >= maximum)
      throw new ApiError(
        503,
        "RATE_LIMITED",
        "El servicio de autenticación está ocupado. Reintenta más tarde.",
      );
    active++;
    try {
      return await operation();
    } finally {
      active--;
    }
  };
}
