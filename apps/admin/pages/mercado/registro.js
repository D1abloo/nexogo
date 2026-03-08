import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

const EMPTY_PROFILE = {
  name: '',
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  phone: '',
  address: '',
  district: '',
  city: 'Madrid',
  postal_code: '',
  country: 'España',
  bio: '',
  photo: '',
  emergency_contact: '',
  birth_date: '',
  password: '',
  confirm_password: '',
  confirm_adult: false,
};

function getAgeFromBirthDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

export default function MercadoRegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState('register');
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const nextUrl = typeof router.query.next === 'string' ? router.query.next : '/mercado';

  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        window.location.href = nextUrl;
      }
    };
    boot();
  }, [nextUrl]);

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({ ...current, photo: dataUrl }));
    } catch {
      setMessage('No se pudo preparar la foto.');
    }
  };

  const submitRegister = async () => {
    const age = getAgeFromBirthDate(form.birth_date);
    if (!form.email || !form.password || !form.confirm_password || !form.name) {
      setMessage('Completa nombre, correo y contraseña.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }
    if (String(form.password).length < 10) {
      setMessage('La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    if (age === null || age < 18) {
      setMessage('Debes tener al menos 18 años para usar el mercado y los chats.');
      return;
    }
    if (!form.confirm_adult) {
      setMessage('Debes confirmar que eres mayor de edad y aceptas las normas del mercado.');
      return;
    }

    try {
      setBusy(true);
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            name: form.name,
            first_name: form.first_name,
            last_name: form.last_name,
            username: form.username,
            phone: form.phone,
            address: form.address,
            district: form.district,
            city: form.city,
            postal_code: form.postal_code,
            country: form.country,
            bio: form.bio,
            photo: form.photo,
            emergency_contact: form.emergency_contact,
            birth_date: form.birth_date,
          },
        },
      });
      if (error) throw error;
      if (data?.session?.user) {
        window.location.href = nextUrl;
        return;
      }
      setMessage('Cuenta creada. Revisa tu correo y valida el acceso para terminar el alta en el mercado.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) throw error;
      window.location.href = nextUrl;
    } catch (error) {
      setMessage(error?.message || 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="market-shell market-register-shell">
      <header className="market-page-topbar">
        <div className="market-page-brand">
          <button className="brand-mark" onClick={() => { window.location.href = '/mercado'; }}>
            <span className="brand-icon">NG</span>
          </button>
          <div>
            <strong>Acceso al mercado</strong>
            <p className="muted">Usa los mismos campos y la misma base de datos que la web principal.</p>
          </div>
        </div>
        <div className="pill-row">
          <Link href="/mercado" className="btn btn-ghost">Volver al mercado</Link>
        </div>
      </header>

      <section className="market-register-card">
        <div className="pill-row market-auth-toggle">
          <button className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('register')}>Crear cuenta</button>
          <button className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('login')}>Entrar</button>
        </div>

        {mode === 'register' ? (
          <div className="market-register-grid">
            <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Nombre público" />
            <input value={form.first_name} onChange={(e) => setForm((current) => ({ ...current, first_name: e.target.value }))} placeholder="Nombre" />
            <input value={form.last_name} onChange={(e) => setForm((current) => ({ ...current, last_name: e.target.value }))} placeholder="Apellidos" />
            <input value={form.username} onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))} placeholder="Alias" />
            <input value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} placeholder="Correo" />
            <input value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} placeholder="Teléfono" />
            <input value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} placeholder="Dirección" />
            <input value={form.district} onChange={(e) => setForm((current) => ({ ...current, district: e.target.value }))} placeholder="Barrio" />
            <input value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} placeholder="Ciudad" />
            <input value={form.postal_code} onChange={(e) => setForm((current) => ({ ...current, postal_code: e.target.value }))} placeholder="Código postal" />
            <input value={form.country} onChange={(e) => setForm((current) => ({ ...current, country: e.target.value }))} placeholder="País" />
            <input value={form.emergency_contact} onChange={(e) => setForm((current) => ({ ...current, emergency_contact: e.target.value }))} placeholder="Contacto de emergencia" />
            <input type="date" value={form.birth_date} onChange={(e) => setForm((current) => ({ ...current, birth_date: e.target.value }))} />
            <input type="password" value={form.password} onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))} placeholder="Contraseña" />
            <input type="password" value={form.confirm_password} onChange={(e) => setForm((current) => ({ ...current, confirm_password: e.target.value }))} placeholder="Confirmar contraseña" />
            <input value={form.photo} onChange={(e) => setForm((current) => ({ ...current, photo: e.target.value }))} placeholder="URL de foto" />
            <label className="btn btn-ghost market-upload-label">
              <input type="file" accept="image/*" onChange={handlePhotoUpload} />
              Subir foto
            </label>
            <textarea value={form.bio} onChange={(e) => setForm((current) => ({ ...current, bio: e.target.value }))} placeholder="Biografía breve" />
            <label className="adult-confirm-row market-register-confirm-row">
              <input type="checkbox" checked={form.confirm_adult} onChange={(e) => setForm((current) => ({ ...current, confirm_adult: e.target.checked }))} />
              <span>Confirmo que soy mayor de 18 años y que usaré el mercado y los chats bajo mi responsabilidad.</span>
            </label>
            <button className="btn btn-primary" onClick={submitRegister} disabled={busy}>Crear cuenta de mercado</button>
          </div>
        ) : (
          <div className="market-register-grid market-login-grid">
            <input value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} placeholder="Correo" />
            <input type="password" value={form.password} onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))} placeholder="Contraseña" />
            <button className="btn btn-primary" onClick={submitLogin} disabled={busy}>Entrar al mercado</button>
          </div>
        )}

        {message && <p className="auth-notice">{message}</p>}
      </section>
    </main>
  );
}
