/** Decorative contract with a signature that draws itself on load (static under reduced motion). */
export function HeroDocument() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-[470px] -rotate-[1.5deg] rounded-[3px] border border-slate-200 bg-paper px-8 py-9 font-serif text-sm leading-7 text-slate-800 shadow-[0_30px_70px_rgb(15_23_42/0.16),0_3px_10px_rgb(15_23_42/0.06)] sm:px-11 sm:py-10"
    >
      <style>{`
        .hero-signature { stroke-dasharray: 900; stroke-dashoffset: 900; animation: hero-sign 2.6s .6s cubic-bezier(.6,.1,.3,1) forwards; }
        @keyframes hero-sign { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { .hero-signature { animation: none; stroke-dashoffset: 0; } }
      `}</style>
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
      <div className="mt-6 grid grid-cols-2 gap-7 font-sans text-[12.5px] text-slate-500">
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
          <span className="block h-11" />
          <b className="text-slate-900">Laura Santos</b>
          <br />
          Testigo · <span className="font-semibold text-vino-600">su turno</span>
        </div>
      </div>
    </div>
  );
}
