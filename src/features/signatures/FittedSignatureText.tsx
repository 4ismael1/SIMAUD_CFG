import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../ui';

interface FittedSignatureTextProps {
  text: string;
  family: string;
  /** Font size in px when the text fits comfortably. */
  baseSize: number;
  className?: string;
}

/**
 * Renders text in a script font and shrinks it until it fits its container on one line:
 * a signature must never be cut off with an ellipsis.
 */
export function FittedSignatureText({ text, family, baseSize, className }: FittedSignatureTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(baseSize);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const element = textRef.current;
    if (!container || !element) return;

    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      element.style.fontSize = `${baseSize}px`;
      const available = container.clientWidth;
      const natural = element.scrollWidth;
      const next = natural > available && natural > 0 ? Math.max(10, Math.floor((baseSize * available) / natural)) : baseSize;
      element.style.fontSize = `${next}px`;
      setSize(next);
    };

    fit();
    // Script fonts load asynchronously; measure again once they are ready.
    void document.fonts.load(`${baseSize}px "${family}"`, text).then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text, family, baseSize]);

  return (
    <span ref={containerRef} className={cn('flex min-w-0 max-w-full justify-center overflow-hidden', className)}>
      <span ref={textRef} className="leading-[1.35] whitespace-nowrap" style={{ fontFamily: `"${family}", cursive`, fontSize: `${size}px` }}>
        {text}
      </span>
    </span>
  );
}
