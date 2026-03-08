import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_FILE = path.resolve(__dirname, '../.env.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(ENV_FILE);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/admin/.env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const count = Number(process.argv[2] || 100);
const defaultPassword = process.argv[3] || process.env.DEMO_USER_PASSWORD || 'DemoAccess.2026!';
const defaultCountry = process.env.DEMO_USER_COUNTRY || 'España';
const cities = ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga', 'Lisboa', 'París', 'Roma', 'Berlín'];
const firstNames = ['Ana', 'Luis', 'Marta', 'Pablo', 'Lucía', 'David', 'Sofía', 'Javier', 'Carmen', 'Diego'];
const lastNames = ['Ruiz', 'Gómez', 'Navarro', 'López', 'Santos', 'Vega', 'Martín', 'Pérez', 'Romero', 'Castro'];

function pick(list, index) {
  return list[index % list.length];
}

async function upsertDemoUser(index) {
  const padded = String(index + 1).padStart(3, '0');
  const firstName = pick(firstNames, index);
  const lastName = pick(lastNames, index * 2);
  const city = pick(cities, index * 3);
  const email = `demo.user.${padded}@nexogo.local`;
  const name = `${firstName} ${lastName}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: {
      name,
      first_name: firstName,
      last_name: lastName,
      role: 'user',
      city,
      country: defaultCountry,
    },
  });

  if (error && !String(error.message || '').toLowerCase().includes('already registered')) {
    throw error;
  }

  let userId = data?.user?.id || null;

  if (!userId) {
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const existing = (existingUsers?.users || []).find((entry) => String(entry.email || '').toLowerCase() === email);
    userId = existing?.id || null;
  }

  if (!userId) {
    throw new Error(`No se pudo resolver el usuario ${email}`);
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        email,
        name,
        role: 'user',
        admin_access_level: 'none',
        verified: true,
        city,
        country: defaultCountry,
        bio: 'Cuenta demo para pruebas locales y entorno PRE.',
      },
      { onConflict: 'id' },
    );

  if (profileError) throw profileError;

  return { email, password: defaultPassword, city, name };
}

async function main() {
  console.log(`Creando ${count} usuarios demo con contraseña por defecto...`);
  const created = [];

  for (let index = 0; index < count; index += 1) {
    const row = await upsertDemoUser(index);
    created.push(row);
    if ((index + 1) % 10 === 0) {
      console.log(`  ${index + 1}/${count} usuarios procesados`);
    }
  }

  const outputFile = path.resolve(__dirname, './demo-users.generated.txt');
  const lines = [
    `Total: ${created.length}`,
    `Contraseña por defecto: ${defaultPassword}`,
    '',
    ...created.map((row) => `${row.email} | ${row.name} | ${row.city}`),
  ];
  fs.writeFileSync(outputFile, lines.join('\n'));

  console.log(`Hecho. Listado guardado en ${outputFile}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
