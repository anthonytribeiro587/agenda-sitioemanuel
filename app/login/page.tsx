"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import {
  createSupabaseBrowserClient,
  isDemoModeEnabled,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const demo = !configured && isDemoModeEnabled();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (demo) {
      router.replace("/dashboard");
      return;
    }

    if (!configured) {
      setError("O acesso está temporariamente indisponível. Contate o administrador.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("O acesso está temporariamente indisponível.");
      return;
    }

    setLoading(true);
    setError("");
    const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: password.slice(0, 256),
    });

    if (authError) {
      setLoading(false);
      setError("Não foi possível entrar. Confira os dados e tente novamente.");
      return;
    }

    const bootstrapResponse = await fetch("/api/profile/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!bootstrapResponse.ok) {
      const body = (await bootstrapResponse.json().catch(() => null)) as { error?: string } | null;
      await supabase.auth.signOut();
      setLoading(false);
      setError(body?.error ?? "Seu usuário não está autorizado.");
      return;
    }

    setLoading(false);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-visual">
          <div>
            <div className="brand">
              <div className="brand-mark">SE</div>
              <div><h1 style={{fontSize:16,margin:0}}>Sítio Emanuel</h1><p>Agenda interna</p></div>
            </div>
            <h1>Reservas organizadas. Rotina tranquila.</h1>
            <p>Agenda, clientes, pagamentos e histórico em um só lugar — do jeito que o Sítio realmente trabalha.</p>
          </div>
          <div className="login-features">
            <div className="login-feature"><CalendarCheck2 size={18}/> Controle visual de datas e reservas</div>
            <div className="login-feature"><ShieldCheck size={18}/> Acesso privado e dados protegidos</div>
            <div className="login-feature"><Sparkles size={18}/> Cálculo automático de pagos e saldo</div>
          </div>
        </section>
        <section className="login-form">
          <LockKeyhole size={28} color="#245f4a" />
          <h2>Acesso administrativo</h2>
          <p>Entre com o usuário autorizado para gerenciar a agenda do Sítio Emanuel.</p>
          {error ? <div className="error-box">{error}</div> : null}
          <form onSubmit={submit} className="form-grid" style={{gridTemplateColumns:"1fr"}}>
            <label className="field"><span className="label">E-mail</span><input className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value.slice(0, 254))} required={!demo} autoComplete="username" inputMode="email" maxLength={254} placeholder="seuemail@exemplo.com" /></label>
            <label className="field"><span className="label">Senha</span><input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value.slice(0, 256))} required={!demo} autoComplete="current-password" maxLength={256} placeholder="••••••••" /></label>
            <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Entrando..." : demo ? "Entrar na demonstração" : "Entrar"}</button>
          </form>
          {demo ? <div className="demo-box"><strong>Modo de demonstração ativo.</strong><br/>Os dados ficam apenas neste navegador até o Supabase ser conectado.</div> : null}
        </section>
      </div>
    </main>
  );
}
