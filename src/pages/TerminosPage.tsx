import React from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { FloatingWhatsAppBtn } from '@/components/common/FloatingWhatsAppBtn';
import { ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';
import styles from './TerminosPage.module.css';

export const TerminosPage: React.FC = () => {
  useDocumentTitle('Términos y Condiciones Oficiales');
  return (
    <div className={styles.pageLayout} data-theme="public">
      <a href="#contenido-terminos" className="skipLink">
        Saltar al contenido de términos
      </a>
      <Navbar />
      <main id="contenido-terminos" tabIndex={-1} className={styles.mainContent}>
        <div className={`container ${styles.container}`}>
          <div className={styles.header}>
            <div className={styles.badge}>
              <FileText size={16} />
              <span>Marco Legal y Bases del Concurso</span>
            </div>
            <h1 className={styles.title}>Términos y Condiciones</h1>
            <p className={styles.subtitle}>
              Reglamento oficial del sorteo "Gran Rifa Ecoturística Manaure Vive 2026".
            </p>
          </div>

          <article className={styles.contentCard}>
            <section className={styles.section}>
              <h2>1. Identificación del Organizador</h2>
              <p>
                La presente actividad promocional y turística es organizada bajo la iniciativa
                comunitaria y comercial <strong>"Manaure Vive"</strong>, con el respaldo de
                prestadores de servicios turísticos y gastronómicos formalizados en el municipio de
                Manaure Balcón del Cesar, departamento del Cesar, Colombia.
              </p>
            </section>

            <section className={styles.section}>
              <h2>2. Mecánica del Sorteo</h2>
              <p>
                La rifa consta de una emisión limitada de <strong>1.000 boletos</strong>, numerados
                de forma correlativa desde el <strong>000 al 999</strong>.
              </p>
              <ul className={styles.bulletList}>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>
                    El boleto ganador corresponderá exactamente a las{' '}
                    <strong>
                      tres (3) últimas cifras del Premio Mayor de la Lotería de Santander
                    </strong>
                    .
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>
                    En caso de que el número premiado no haya sido vendido en la fecha inicial, el
                    sorteo se reprogramará automáticamente para el siguiente sorteo ordinario de la
                    misma lotería.
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.section} id="entrega">
              <h2>3. Descripción y Entrega del Premio</h2>
              <p>
                El premio consiste en el <strong>Tour Vive Manaure de 3 días y 2 noches para la pareja (2 personas)</strong> que incluye:
              </p>
              <ul className={styles.bulletList}>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Viaje pago ida y vuelta desde tu lugar de residencia hasta Manaure - Cesar.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Hospedaje en los mejores hoteles / glamping y noche romántica.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Alimentación completa (desayunos, almuerzos campestres y cenas típicas).</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Experiencia en cuatrimoto por trochas con equipamiento y guía.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Vuelo libre en parapente tándem con piloto profesional.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Ruta a la Casa de Vidrio en la Serranía de Perijá con fogata nocturna.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className={styles.bulletIcon} />
                  <span>Registro fotográfico profesional de la experiencia.</span>
                </li>
              </ul>
              <p>
                El premio no es canjeable por dinero en efectivo, pero sí es transferible a un
                tercero mediante comunicación previa. La vigencia para disfrutar la experiencia es
                de seis (6) meses a partir de la fecha del sorteo.
              </p>
            </section>

            <section className={styles.section} id="privacidad">
              <h2>4. Tratamiento de Datos Personales (Habeas Data)</h2>
              <p>
                En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia, los
                datos personales suministrados (nombre, documento, teléfono y correo electrónico)
                serán utilizados exclusivamente para la asignación de boletos, contacto en caso de
                resultar ganador y envío de comprobantes digitales de compra. No se compartirán con
                terceros no relacionados con la operación de la rifa.
              </p>
            </section>

            <div className={styles.sealBox}>
              <ShieldCheck size={28} className={styles.sealIcon} />
              <div>
                <strong>Transparencia y Seguridad Garantizada</strong>
                <p>
                  Todos los boletos registrados cuentan con sello temporal en base de datos
                  PostgreSQL auditable.
                </p>
              </div>
            </div>
          </article>
        </div>
      </main>
      <Footer />
      <FloatingWhatsAppBtn />
    </div>
  );
};
