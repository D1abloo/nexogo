import Link from 'next/link';

export default function LegalPageLayout({ eyebrow, title, lead, sections }) {
  return (
    <main className="social-shell legal-shell">
      <header className="topbar legal-hero">
        <div className="brand brand-hero">
          <button className="brand-mark" type="button" onClick={() => { window.location.href = '/'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div className="brand-copy">
            <div className="brand-row">
              <h1>{title}</h1>
            </div>
            <p className="muted">{eyebrow}</p>
            <p>{lead}</p>
          </div>
        </div>
        <div className="topbar-actions legal-hero-actions">
          <Link className="btn btn-ghost" href="/">
            Volver al inicio
          </Link>
        </div>
      </header>

      <section className="legal-nav">
        <Link href="/acerca">Acerca</Link>
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/terminos">Términos</Link>
      </section>

      <section className="legal-grid">
        {sections.map((section) => (
          <article key={section.title} className="mini-card legal-card">
            <div className="legal-card-head">
              <h3>{section.title}</h3>
            </div>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.title}-${index}`}>{paragraph}</p>
            ))}
            {section.items?.length ? (
              <ul className="policy-list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
