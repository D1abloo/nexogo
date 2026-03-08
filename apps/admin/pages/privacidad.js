import LegalPageLayout from '../components/LegalPageLayout';

const sections = [
  {
    title: 'Finalidad del tratamiento',
    paragraphs: [
      'Los datos personales se tratan para permitir el registro, autenticación, creación y gestión de salas, participación en actividades, comunicación entre usuarios, moderación, soporte, gestión de suscripciones, prevención del fraude y cumplimiento de obligaciones legales o contractuales.',
      'Solo se solicitarán datos adecuados, pertinentes y limitados a lo necesario para la prestación del servicio, la seguridad operativa de la plataforma y la correcta atención al usuario.',
    ],
  },
  {
    title: 'Datos que pueden tratarse',
    paragraphs: [
      'Dependiendo del uso que haga el usuario, pueden tratarse datos identificativos, de contacto, perfil social, preferencias declaradas, ubicación indicada por el usuario, historial de salas, actividad de suscripción, bloqueos, reportes, fotografías y mensajes dentro del servicio.',
      'El acceso a chats, salas, mercado social y mensajería interna está reservado exclusivamente a personas mayores de 18 años. La plataforma podrá reforzar comprobaciones de edad cuando resulte necesario para proteger a la comunidad o cumplir obligaciones legales.',
    ],
    items: [
      'Nombre, alias, correo electrónico y datos de contacto.',
      'Fotografía y contenidos voluntariamente subidos al perfil o a las salas.',
      'Datos de publicación, participación, solicitudes de acceso y reputación.',
      'Información asociada a pagos, renovaciones y estado de suscripción.',
      'Datos vinculados a controles reforzados sobre áreas premium 18+ cuando existan incidencias, reportes o revisión operativa.',
      'Datos necesarios para resolver incidencias, abusos o reclamaciones.',
    ],
  },
  {
    title: 'Base jurídica',
    paragraphs: [
      'El tratamiento se basa, según el caso, en la ejecución de la relación contractual con el usuario, el cumplimiento de obligaciones legales, el interés legítimo en la seguridad del servicio y, cuando proceda, el consentimiento del interesado para determinadas acciones concretas.',
      'Cuando una funcionalidad requiera consentimiento específico, el usuario podrá retirarlo dentro de los límites legalmente aplicables y sin afectar a tratamientos ya realizados con anterioridad.',
    ],
  },
  {
    title: 'Conservación',
    paragraphs: [
      'Los datos se conservarán durante el tiempo necesario para prestar el servicio, mantener la cuenta activa, atender reclamaciones, gestionar cobros o devoluciones, investigar usos indebidos y cumplir las obligaciones legales de conservación que resulten aplicables.',
      'Una vez finalizada la relación con el usuario, determinados datos podrán mantenerse bloqueados o restringidos durante los plazos legalmente exigibles antes de su supresión o anonimización.',
    ],
  },
  {
    title: 'Cesiones y acceso por terceros',
    paragraphs: [
      'Los datos no se venderán a terceros. Podrán intervenir proveedores que actúen como encargados del tratamiento en materias como alojamiento, correo, autenticación, pagos, seguridad, soporte o análisis operativo, siempre bajo instrucciones y con medidas de protección adecuadas.',
      'Asimismo, la información podrá comunicarse a autoridades u órganos competentes cuando exista obligación legal, requerimiento válido o necesidad razonable de defensa frente a usos ilícitos o daños graves.',
    ],
  },
  {
    title: 'Derechos del usuario',
    paragraphs: [
      'El usuario podrá ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad, así como retirar consentimientos cuando proceda. Para ello deberá acreditar suficientemente su identidad y concretar la solicitud.',
    ],
    items: [
      'Derecho a conocer qué datos se tratan y con qué finalidad.',
      'Derecho a corregir datos inexactos o incompletos.',
      'Derecho a solicitar la supresión cuando legalmente proceda.',
      'Derecho a oponerse o limitar tratamientos en determinados supuestos.',
      'Derecho a presentar reclamación ante la autoridad competente.',
    ],
  },
  {
    title: 'Medidas de seguridad y revisión interna',
    paragraphs: [
      'La plataforma aplica controles razonables para proteger la confidencialidad, integridad y disponibilidad de la información. Con todo, ningún servicio en línea puede garantizar seguridad absoluta, por lo que el usuario debe custodiar sus credenciales y utilizar el servicio con prudencia.',
      'Cuando sea necesario para proteger a la comunidad o gestionar incidencias, podrán revisarse eventos internos vinculados al uso del servicio, incluidos reportes, bloqueos, suscripciones, accesos, salas 18+ premium, chats globales, mercado social, verificaciones de mayoría de edad y actividad relevante de moderación.',
    ],
  },
  {
    title: 'Contacto de privacidad',
    paragraphs: [
      'Las solicitudes relacionadas con protección de datos, ejercicio de derechos o reclamaciones sobre el tratamiento podrán remitirse al canal de contacto legal habilitado por la operadora.',
    ],
    items: ['Contacto de privacidad: info@estructuraweb.es'],
  },
];

export default function PrivacidadPage() {
  return (
    <LegalPageLayout
      eyebrow="Tratamiento de datos personales, conservación y derechos"
      title="Política de privacidad"
      lead="Esta política describe qué datos pueden tratarse, con qué finalidad, durante cuánto tiempo y qué derechos asisten al usuario en relación con el servicio."
      sections={sections}
    />
  );
}
