import { useContext } from 'react';
import { TicketCartContext } from './TicketCartContextDefinition';

export const useTicketCart = () => {
  const context = useContext(TicketCartContext);
  if (!context) {
    throw new Error('useTicketCart debe ser usado dentro de un TicketCartProvider');
  }
  return context;
};

export const useOptionalTicketCart = () => {
  return useContext(TicketCartContext) ?? null;
};
