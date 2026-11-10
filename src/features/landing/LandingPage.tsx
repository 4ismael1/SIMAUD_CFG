import { useRef } from 'react';
import { useScrollReveal } from '../../ui';
import { HeroSection } from './HeroSection';
import { LandingHeader } from './LandingHeader';
import {
  AuditSection,
  ClosingCta,
  FaqSection,
  LandingFooter,
  RolesSection,
  StepsSection,
  ValueStrip,
} from './LandingSections';

export function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);

  return (
    <div ref={pageRef} className="overflow-x-clip bg-white text-slate-900">
      <LandingHeader />
      <main>
        <HeroSection />
        <ValueStrip />
        <StepsSection />
        <RolesSection />
        <AuditSection />
        <FaqSection />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
