import React from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { TicketCartProvider } from '@/context/TicketCartContext';
import { Navbar } from '@/components/layout/Navbar';
import { HeroRifa } from '@/components/landing/HeroRifa';
import { DetallePremio } from '@/components/landing/DetallePremio';
import { SelectorBoletos } from '@/components/ticketing/SelectorBoletos';
import { GaleriaPremio } from '@/components/landing/GaleriaPremio';
import { FilaAliados } from '@/components/landing/FilaAliados';
import { PreguntasFrecuentes } from '@/components/landing/PreguntasFrecuentes';
import { Footer } from '@/components/layout/Footer';
import { ModalCheckout } from '@/components/checkout/ModalCheckout';
import { FloatingWhatsAppBtn } from '@/components/common/FloatingWhatsAppBtn';

export const HomePage: React.FC = () => {
  useDocumentTitle('Gran Sorteo Ecoturístico y Aventura en el Perijá');
  return (
    <TicketCartProvider>
      <div className="landing-layout">
        <Navbar />
        <main>
          <HeroRifa />
          <DetallePremio />
          <SelectorBoletos />
          <GaleriaPremio />
          <FilaAliados />
          <PreguntasFrecuentes />
        </main>
        <Footer />
        <ModalCheckout />
        <FloatingWhatsAppBtn />
      </div>
    </TicketCartProvider>
  );
};
