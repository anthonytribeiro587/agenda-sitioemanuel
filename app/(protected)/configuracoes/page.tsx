"use client";

import { CalendarSync, CheckCircle2, Database, KeyRound, ShieldCheck, UserRoundCog } from "lucide-react";
import { useAgenda } from "@/components/AgendaProvider";

export default function ConfiguracoesPage() {
  const { isDemo } = useAgenda();
  return <main className="page">
    <div className="page-head"><div><h2>Configurações</h2><p>Infraestrutura, segurança e integrações do sistema interno.</p></div></div>
    <div className="grid-2">
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Banco e autenticação</h3><p className="panel-subtitle">Status da conexão com o Supabase.</p></div></div><div className="panel-body"><div className="info-grid"><div className="info-item"><span>Modo atual</span><strong>{isDemo ? "Demonstração local" : "Supabase conectado"}</strong></div><div className="info-item"><span>Segurança</span><strong>RLS + usuários autorizados</strong></div></div><div className="demo-box" style={{marginTop:14}}><Database size={18} style={{verticalAlign:'-4px',marginRight:7}}/>{isDemo ? "Cadastre as variáveis da Vercel e execute a migration para ativar dados reais." : "A aplicação está usando o banco e a autenticação configurados."}</div></div></section>
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Google Agenda</h3><p className="panel-subtitle">Integração planejada para reservas confirmadas.</p></div></div><div className="panel-body"><div className="empty" style={{textAlign:'left'}}><CalendarSync/><strong style={{display:'block',color:'var(--ink)',marginBottom:6}}>Próxima etapa</strong>Criar, atualizar e cancelar eventos automaticamente no calendário “Reservas — Sítio Emanuel”.</div><button className="button button-secondary" style={{width:'100%',marginTop:14}} disabled>Conectar Google Agenda</button></div></section>
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Usuários administrativos</h3><p className="panel-subtitle">Cada pessoa deve ter seu próprio login.</p></div></div><div className="panel-body"><div className="quick-grid"><div className="quick-action"><UserRoundCog/><strong>Acessos individuais</strong><span>Evita compartilhamento de senha e permite revogar usuários.</span></div><div className="quick-action"><ShieldCheck/><strong>Dados protegidos</strong><span>Reservas e pagamentos não são públicos.</span></div></div></div></section>
      <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Checklist de implantação</h3><p className="panel-subtitle">O que falta antes do uso oficial.</p></div></div><div className="panel-body"><div className="login-features" style={{color:'var(--ink)'}}><div className="login-feature" style={{color:'var(--ink)'}}><CheckCircle2/>Criar projeto no Supabase</div><div className="login-feature" style={{color:'var(--ink)'}}><CheckCircle2/>Executar migration do banco</div><div className="login-feature" style={{color:'var(--ink)'}}><KeyRound/>Cadastrar variáveis na Vercel</div><div className="login-feature" style={{color:'var(--ink)'}}><UserRoundCog/>Criar usuário da responsável</div></div></div></section>
    </div>
  </main>;
}
