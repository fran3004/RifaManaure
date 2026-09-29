import React, { useMemo } from 'react';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/outfit';
import '@fontsource-variable/jetbrains-mono';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { TicketCartProvider } from '@/context/TicketCartContext';
import { useTicketCart } from '@/context/useTicketCart';
import { Navbar } from '@/components/layout/Navbar';
import { HeroRifa } from '@/components/landing/HeroRifa';
import { DetallePremio } from '@/components/landing/DetallePremio';
import { SelectorBoletos } from '@/components/ticketing/SelectorBoletos';
import { GaleriaPremio } from '@/components/landing/GaleriaPremio';
import { FilaAliados } from '@/components/landing/FilaAliados';
import { PreguntasFrecuentes } from '@/components/landing/PreguntasFrecuentes';
import { PortalRaffleClosed } from '@/components/landing/PortalRaffleClosed';
import { Footer } from '@/components/layout/Footer';
import { ModalCheckout } from '@/components/checkout/ModalCheckout';
import { FloatingWhatsAppBtn } from '@/components/common/FloatingWhatsAppBtn';

const HomePageContent: React.FC = () => {
  const { raffle, winner } = useTicketCart();

  const isDrawDatePassed = useMemo(() => {
    if (!raffle?.draw_date) return false;
    const drawTime = new Date(raffle.draw_date).getTime();
    return !isNaN(drawTime) && drawTime <= Date.now();
  }, [raffle?.draw_date]);

  // Modo cerrado ("🔒 Cerrada (Ventas concluidas antes del sorteo)"):
  // Se activa dinámicamente cuando el admin selecciona la opción 'closed' en el portal
  // y la rifa no se encuentra en estado 'finished' ni ha cumplido la fecha límite de sorteo
  const isRaffleClosedMode = raffle?.status === 'closed' && !isDrawDatePassed && !winner;

  useDocumentTitle(
    isRaffleClosedMode
      ? 'Edición Concluida · Manaure Vive Turismo y Experiencias'
      : 'Gran Sorteo Ecoturístico y Aventura en el Perijá'
  );

  if (isRaffleClosedMode) {
    return (
      <div className="landing-layout" data-theme="public">
        <Navbar isRaffleClosed />
        <main id="contenido-principal" tabIndex={-1}>
          <PortalRaffleClosed />
          <FilaAliados isRaffleClosed />
        </main>
        <Footer isRaffleClosed />
        <FloatingWhatsAppBtn />
      </div>
    );
  }

  return (
    <div className="landing-layout" data-theme="public">
      <a href="#contenido-principal" className="skipLink">
        Saltar al contenido
      </a>
      <a href="#boletos" className="skipLink">
        Ir a la selección de boletos
      </a>
      <Navbar />
      <main id="contenido-principal" tabIndex={-1}>
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
  );
};

export const HomePage: React.FC = () => {
  return (
    <TicketCartProvider>
      <HomePageContent />
    </TicketCartProvider>
  );
};
