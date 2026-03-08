import Link from 'next/link';

const FOOTER_COLUMNS = [
  {
    title: 'Producto',
    links: [
      { href: '/', label: 'Inicio' },
      { href: '/premium', label: 'Planes premium' },
      { href: '/cuenta', label: 'Mi cuenta' },
      { href: '/sala.html', label: 'Explorar salas' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/acerca', label: 'Acerca' },
      { href: '/privacidad', label: 'Privacidad' },
      { href: '/terminos', label: 'Términos' },
    ],
  },
  {
    title: 'Soporte',
    links: [
      { href: '/cuenta', label: 'Perfil y seguridad' },
      { href: '/premium', label: 'Suscripciones' },
      { href: 'mailto:info@estructuraweb.es', label: 'Contacto legal' },
      { href: 'mailto:info@estructuraweb.es', label: 'Incidencias y soporte' },
    ],
  },
];

export default function StrictFooter() {
  return (
    <footer className="site-footer-global">
      <div className="social-shell footer-global-inner">
        <section className="footer-global-top">
          <div className="footer-global-brand">
            <div className="footer-global-mark">N</div>
            <div>
              <strong>NexoGo</strong>
              <p>
                Plataforma social para descubrir, crear y gestionar planes y salas con control de acceso,
                reputación, suscripciones y moderación.
              </p>
            </div>
          </div>
          <div className="footer-status-strip">
            <span className="chip chip-owner">Publicación de salas</span>
            <span className="chip chip-pending">Privadas y premium</span>
            <span className="chip chip-private">Soporte y moderación</span>
          </div>
        </section>

        <section className="footer-global-grid">
          {FOOTER_COLUMNS.map((column) => (
            <article key={column.title} className="footer-link-card">
              <h4>{column.title}</h4>
              <nav className="footer-link-column" aria-label={column.title}>
                {column.links.map((link) => (
                  <Link key={`${column.title}-${link.label}`} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </article>
          ))}
          <article className="footer-link-card footer-contact-card">
            <h4>Lectura recomendada</h4>
            <p>
              Antes de usar funciones sensibles como pagos, salas privadas, reportes o bloqueos, revisa la
              información legal y operativa correspondiente.
            </p>
            <div className="footer-links-row">
              <Link href="/acerca">Conocer la plataforma</Link>
              <Link href="/privacidad">Ver tratamiento de datos</Link>
              <Link href="/terminos">Revisar condiciones</Link>
            </div>
          </article>
        </section>

        <section className="footer-global-bottom">
          <p>© {new Date().getFullYear()} NexoGo. Uso sujeto a normas de comunidad, privacidad y condiciones vigentes.</p>
        </section>
      </div>
    </footer>
  );
}
