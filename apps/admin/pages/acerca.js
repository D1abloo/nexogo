import LegalPageLayout from '../components/LegalPageLayout';

const sections = [
  {
    title: 'Objeto de la plataforma',
    paragraphs: [
      'NexoGo es una plataforma digital orientada a facilitar la publicación, búsqueda, gestión y participación en salas y planes sociales. El servicio permite descubrir actividades, abrir espacios privados o públicos, gestionar acceso, comunicarse mediante chat y operar con planes de suscripción.',
      'La plataforma tiene una finalidad instrumental: poner en contacto a usuarios que desean organizar o unirse a actividades, sin asumir por ello el control material del encuentro, la identidad real de todos los asistentes ni el resultado efectivo de la interacción fuera del entorno digital.',
    ],
    items: [
      'Publicación de salas abiertas, privadas y premium.',
      'Áreas 18+ y temáticas adultas solo dentro de circuitos premium, privados y moderados.',
      'Gestión de perfiles, reputación, bloqueos y reportes.',
      'Control de acceso y aprobación por parte del anfitrión.',
      'Funciones premium sujetas a contratación, vigencia y revisión.',
    ],
  },
  {
    title: 'Alcance del servicio',
    paragraphs: [
      'El servicio cubre la capa digital de descubrimiento, coordinación y administración de la actividad. No sustituye la diligencia personal del usuario, ni garantiza afinidad, puntualidad, asistencia efectiva, ausencia de conflicto o cumplimiento exacto de lo publicado por el creador de una sala.',
      'El usuario debe utilizar la plataforma con criterio propio, revisar el detalle de cada sala, confirmar las condiciones de acceso y abstenerse de participar cuando existan señales de riesgo, incoherencia, suplantación o comportamiento abusivo.',
    ],
  },
  {
    title: 'Normas comunitarias esenciales',
    paragraphs: [
      'Toda cuenta debe comportarse de forma respetuosa, veraz y compatible con la convivencia de la comunidad. La plataforma rechaza el uso del servicio para amenazas, coacciones, spam, fraude, captación abusiva, difusión no consentida de datos o acoso.',
    ],
    items: [
      'No se permite publicar información deliberadamente falsa o engañosa.',
      'No se permite hostigar, intimidar o presionar a otros usuarios.',
      'No se permite utilizar temáticas adultas para coacción, captación sexual agresiva o actividad ilegal.',
      'No se permite reutilizar perfiles para eludir bloqueos o sanciones.',
      'No se permite recopilar datos personales de otros usuarios sin base legítima.',
    ],
  },
  {
    title: 'Moderación y decisiones operativas',
    paragraphs: [
      'NexoGo podrá revisar perfiles, salas, mensajes, reportes y eventos internos cuando exista una razón operativa, de seguridad, soporte, cumplimiento o protección de la comunidad. La plataforma podrá suspender, limitar, ocultar o retirar contenidos o cuentas cuando resulte razonable para evitar daños o abusos.',
      'Las decisiones de moderación se adoptan con base en señales de riesgo, reportes recibidos, reincidencia, incumplimiento de normas, integridad del servicio y protección del resto de usuarios.',
    ],
  },
  {
    title: 'Suscripciones y funciones premium',
    paragraphs: [
      'Las funciones premium amplían la visibilidad, analítica, posicionamiento y herramientas de publicación, pero no alteran las obligaciones legales ni la responsabilidad del usuario sobre el contenido que publica. El acceso premium solo es válido mientras el estado de la suscripción sea activo y la cuenta se mantenga en regla.',
      'La concesión manual o administrativa de una suscripción por motivos de soporte, promoción o revisión no implica un derecho permanente, ni elimina la posibilidad de suspensión, cancelación o retirada cuando proceda.',
      'Las salas o chats de carácter adulto, íntimo o 18+ no forman una categoría abierta de uso general: quedan sujetas a premium, acceso privado, revisión reforzada, edad mínima y tolerancia cero frente a presión, explotación, captación o conducta ilícita.',
    ],
  },
  {
    title: 'Contacto',
    paragraphs: [
      'Las consultas generales, incidencias legales, solicitudes de información o reclamaciones relacionadas con el funcionamiento de la plataforma pueden dirigirse al correo de contacto habilitado por la operadora.',
    ],
    items: ['Canal de contacto principal: info@estructuraweb.es'],
  },
];

export default function AcercaPage() {
  return (
    <LegalPageLayout
      eyebrow="Información corporativa y de funcionamiento del servicio"
      title="Acerca de NexoGo"
      lead="Esta sección describe la finalidad de la plataforma, el alcance real del servicio, las reglas básicas de uso y el marco general bajo el que opera la comunidad."
      sections={sections}
    />
  );
}
