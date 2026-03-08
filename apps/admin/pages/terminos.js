import LegalPageLayout from '../components/LegalPageLayout';

const sections = [
  {
    title: 'Aceptación y capacidad',
    paragraphs: [
      'El acceso, registro o uso de NexoGo implica la aceptación íntegra de estas condiciones. El usuario declara tener capacidad suficiente para contratar y utilizar el servicio, así como aportar información veraz y actualizada.',
      'El uso de cualquier chat, sala, mercado social o mensajería interna queda estrictamente reservado a personas mayores de 18 años. Los menores de 18 años tienen prohibido registrarse, acceder o intervenir en conversaciones dentro de la plataforma.',
      'Si el usuario no está conforme con estas condiciones, deberá abstenerse de utilizar la plataforma o cancelar el uso de las funcionalidades disponibles.',
    ],
  },
  {
    title: 'Cuenta de usuario',
    paragraphs: [
      'Cada cuenta es personal e intransferible. El usuario es responsable de mantener la confidencialidad de su contraseña, revisar su actividad y notificar de inmediato cualquier acceso no autorizado, pérdida de control o sospecha de uso indebido.',
      'La plataforma podrá requerir verificaciones adicionales, suspender temporalmente accesos o limitar determinadas funciones cuando detecte inconsistencias, fraude, abuso o riesgo para la comunidad.',
    ],
  },
  {
    title: 'Publicación y gestión de salas',
    paragraphs: [
      'El creador de una sala es responsable del contenido, condiciones de acceso, ubicación declarada, normas del grupo y cualquier información que publique. Deberá describir la actividad de forma clara y evitar afirmaciones engañosas o promesas que no pueda cumplir.',
      'La plataforma podrá limitar, cerrar, ocultar o retirar salas cuando existan razones de seguridad, incumplimiento normativo, riesgo reputacional, uso abusivo del servicio o incumplimiento de las normas comunitarias.',
    ],
    items: [
      'Las salas privadas pueden exigir aprobación o código de acceso.',
      'Las salas premium pueden quedar reservadas a cuentas con suscripción válida.',
      'Las salas 18+ o de temática adulta quedan restringidas a premium, acceso privado y revisión reforzada.',
      'El creador puede cerrar su sala, pero sigue respondiendo por el uso previo de la misma.',
      'La plataforma podrá intervenir si aprecia abuso, fraude o amenaza para terceros.',
    ],
  },
  {
    title: 'Comportamiento prohibido',
    paragraphs: [
      'Está prohibido utilizar la plataforma para acosar, amenazar, extorsionar, suplantar, difamar, distribuir spam, publicar contenido ilícito, captar datos personales sin legitimación, manipular pagos o eludir suspensiones o bloqueos.',
    ],
    items: [
      'No se permiten amenazas ni violencia verbal o simbólica.',
      'No se permite el acceso o uso de chats por menores de 18 años bajo ninguna circunstancia.',
      'No se permite actividad sexual coercitiva, explotación o presión a terceros.',
      'No se permite utilizar chats globales o de sala para solicitar actos sexuales no consentidos, intercambio ilícito o captación agresiva.',
      'No se permite vender, alquilar o ceder cuentas a terceros.',
      'No se permite interferir con el servicio ni intentar obtener acceso no autorizado.',
    ],
  },
  {
    title: 'Pagos, renovaciones y cancelaciones',
    paragraphs: [
      'Las suscripciones premium y los pagos asociados quedan sujetos al estado real del cobro, al método seleccionado, a las condiciones específicas del plan contratado y a la vigencia temporal del período facturado. La renovación podrá ser automática o quedar programada para no renovarse al final del período vigente, según la configuración activa del usuario o de administración.',
      'La cancelación de la renovación no implica devolución automática del período ya abonado. Las devoluciones, incidencias de cobro y ajustes se analizarán caso por caso conforme a la normativa aplicable, la política comercial vigente y el historial del servicio.',
    ],
  },
  {
    title: 'Suspensión, baja y resolución',
    paragraphs: [
      'La plataforma podrá suspender, restringir o cancelar cuentas, salas o suscripciones cuando existan incumplimientos, fraude, riesgo para usuarios, impagos, abuso reiterado, uso por menores de 18 años o requerimientos legales. También podrá limitar funciones concretas de manera preventiva mientras se revisa una incidencia.',
      'El usuario podrá dejar de utilizar el servicio y solicitar la baja de su cuenta, sin perjuicio de la conservación restringida de datos que resulte necesaria por motivos legales, contractuales, de seguridad o defensa de derechos.',
    ],
  },
  {
    title: 'Responsabilidad y disponibilidad',
    paragraphs: [
      'NexoGo presta un servicio de intermediación digital y no asume responsabilidad por los hechos producidos fuera de la plataforma, por la conducta material de los asistentes, por cancelaciones entre particulares o por daños derivados de información falsa aportada por usuarios.',
      'El servicio podrá sufrir interrupciones, tareas de mantenimiento, cambios funcionales o limitaciones temporales. La plataforma no garantiza disponibilidad absoluta ni continuidad ininterrumpida.',
    ],
  },
  {
    title: 'Propiedad intelectual y contacto',
    paragraphs: [
      'Los elementos distintivos, diseño, marca, textos originales, estructura de servicio y materiales propios de la plataforma quedan protegidos por la normativa aplicable. El usuario no adquiere más derechos que los necesarios para el uso ordinario y legítimo del servicio.',
      'Cualquier reclamación contractual, notificación o comunicación formal relacionada con estas condiciones podrá dirigirse al canal habilitado por la operadora.',
    ],
    items: ['Contacto legal y contractual: info@estructuraweb.es'],
  },
];

export default function TerminosPage() {
  return (
    <LegalPageLayout
      eyebrow="Condiciones de uso, suscripción, pagos, moderación y responsabilidad"
      title="Términos y condiciones"
      lead="Este documento regula el acceso al servicio, la publicación de salas, las suscripciones premium, el régimen de conducta y las consecuencias del incumplimiento."
      sections={sections}
    />
  );
}
