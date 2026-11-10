/** Decorative contract with a signature that draws itself on load (static under reduced motion). */
export function HeroDocument() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full -rotate-[1.5deg] animate-float rounded-[3px] border border-slate-200 bg-paper px-6 py-8 font-serif text-[13.5px] leading-7 text-slate-800 shadow-[0_30px_70px_rgb(15_23_42/0.16),0_3px_10px_rgb(15_23_42/0.06)] sm:px-11 sm:py-10"
    >
      <p className="text-center font-bold tracking-[0.1em]">CONTRATO DE SUMINISTRO</p>
      <p className="text-center font-mono text-[11.5px] text-slate-400">CT-2026-0039 · versión 2</p>
      <p className="mt-3">
        Entre <span className="doc-var">Distribuidora Nacional SRL</span>, en lo adelante EL PROVEEDOR, y la institución, se conviene el
        suministro de material gastable a partir del <span className="doc-var">3 de noviembre de 2026</span>, por un valor total de{' '}
        <span className="doc-var">RD$ 87.500,00</span>.
      </p>
      <p className="mt-2">
        <b>PRIMERO.</b> El objeto del presente contrato es la entrega periódica de papel, tóner y artículos de oficina conforme al anexo A.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 font-sans text-[11.5px] leading-snug text-slate-500 sm:gap-7 sm:text-[12.5px]">
        <div className="border-t border-slate-800 pt-1.5">
          <svg viewBox="0 0 220 60" className="block h-11 w-full">
            <path
              className="hero-signature"
              d="M6 44c12-26 20-30 24-17s-5 23 4 16 13-27 20-23-2 23 7 19 11-16 18-14 4 12 13 9 15-12 22-10 9 7 20 2 19-11 33-7 18 4 30-2"
              fill="none"
              stroke="#0f172a"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          <b className="text-slate-900">José Rodríguez Peña</b>
          <br />
          Cliente · firmado 7 nov 2026
        </div>
        <div className="border-t border-slate-800 pt-1.5">
          <span className="flex h-11 items-center gap-1.5 text-[11px] font-semibold text-vino-600">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-vino-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-vino-600" />
            </span>
            Esperando firma
          </span>
          <b className="text-slate-900">Laura Santos</b>
          <br />
          Testigo · <span className="font-semibold text-vino-600">su turno</span>
        </div>
      </div>
    </div>
  );
}
