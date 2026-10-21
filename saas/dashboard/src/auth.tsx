// Entrar, criar conta, recuperar a senha e definir uma nova (quando a pessoa volta pelo link do e-mail).
import { useState, type FormEvent } from 'react';
import { errorText, supabase } from './supabase.ts';

type Mode = 'signin' | 'signup' | 'forgot';
const back = () => `${window.location.origin}/painel/`;

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        const { error: failed } = await supabase.auth.signInWithPassword({ email, password });
        if (failed) throw failed;
      } else if (mode === 'signup') {
        const { data, error: failed } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: back(), data: { full_name: name } },
        });
        if (failed) throw failed;
        // com a confirmação de e-mail ligada, a conta só entra depois do link
        if (data.session === null) setSent(`Enviamos um link de confirmação para ${email}. Abra-o para entrar.`);
      } else {
        const { error: failed } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: back() });
        if (failed) throw failed;
        setSent(`Se houver uma conta com ${email}, você vai receber um link para criar uma nova senha.`);
      }
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const { error: failed } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
    if (failed) setError(errorText(failed));
  };

  const titles: Record<Mode, string> = { signin: 'Entrar', signup: 'Criar sua conta grátis', forgot: 'Recuperar a senha' };
  return (
    <main className="auth">
      <section className="auth__card">
        <p className="brand">Webconstructor</p>
        <h1>{titles[mode]}</h1>
        {mode === 'signup' ? <p className="muted">Crie sites profissionais sem código. Grátis para começar, sem cartão.</p> : null}
        {sent !== null ? (
          <p className="notice notice--ok" role="status">{sent}</p>
        ) : (
          <form className="stack" onSubmit={submit}>
            {mode === 'signup' ? (
              <label className="field">
                <span>Seu nome</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
            ) : null}
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            {mode !== 'forgot' ? (
              <label className="field">
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                />
                {mode === 'signup' ? <small className="muted">Pelo menos 8 caracteres.</small> : null}
              </label>
            ) : null}
            {error !== null ? <p className="notice notice--error" role="alert">{error}</p> : null}
            <button className="button button--primary" disabled={busy}>
              {busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
            </button>
            {mode !== 'forgot' ? (
              <>
                <div className="divider"><span>ou</span></div>
                <button type="button" className="button" onClick={google}>Continuar com Google</button>
              </>
            ) : null}
          </form>
        )}
        <nav className="auth__links">
          {mode !== 'signin' ? <button type="button" className="link" onClick={() => { setMode('signin'); setSent(null); }}>Já tenho conta</button> : null}
          {mode !== 'signup' ? <button type="button" className="link" onClick={() => { setMode('signup'); setSent(null); }}>Criar conta grátis</button> : null}
          {mode === 'signin' ? <button type="button" className="link" onClick={() => { setMode('forgot'); setSent(null); }}>Esqueci a senha</button> : null}
        </nav>
      </section>
    </main>
  );
}

// A pessoa voltou pelo link de recuperação: já está com sessão, falta a nova senha.
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error: failed } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (failed) setError(errorText(failed));
    else onDone();
  };
  return (
    <main className="auth">
      <section className="auth__card">
        <p className="brand">Webconstructor</p>
        <h1>Nova senha</h1>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Nova senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {error !== null ? <p className="notice notice--error" role="alert">{error}</p> : null}
          <button className="button button--primary" disabled={busy}>Salvar senha</button>
        </form>
      </section>
    </main>
  );
}
