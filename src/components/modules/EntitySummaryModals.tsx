import React, { useEffect, useState } from 'react';
import {
  X, Pencil, Mail, Phone, MapPin, Linkedin, GraduationCap, Sparkles, Share2, ExternalLink, ArrowRight, Clock, Users, UserCircle2
} from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import {
  Department, JobOpening, JobPosition, SelectionApplication, TenantUser
} from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

// ---------------------------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------------------------
const money = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;
const DAY_MS = 86_400_000;

const Shell: React.FC<{
  kicker: string;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  onEdit?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ kicker, title, subtitle, badge, footer, onEdit, onClose, children }) => {
  const backdrop = useBackdropClose(onClose);
  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{kicker}</span>
          <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
          {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
        </div>
        <div className="flex items-start gap-2 shrink-0">
          {badge}
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="p-5 space-y-5 text-xs overflow-y-auto">{children}</div>
      <div className="p-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
        {onEdit && (
          <button onClick={onEdit} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 mr-auto">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
        {footer}
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Fechar</button>
      </div>
    </div>
  </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <div className="text-[10px] uppercase font-bold text-slate-400">{title}</div>
    {children}
  </div>
);

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
    <div className="text-[10px] uppercase font-bold text-slate-400">{label}</div>
    <div className="font-semibold text-slate-800 mt-0.5">{children}</div>
  </div>
);

const Chips: React.FC<{ items: string[]; tone?: string }> = ({ items, tone = 'bg-slate-100 text-slate-700' }) =>
  items.length === 0 ? <span className="text-slate-400">Não informado</span> : (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => <span key={i} className={`px-2 py-0.5 rounded-full font-medium ${tone}`}>{t}</span>)}
    </div>
  );

/** Related data is loaded only when a summary opens; a lookup the user may not view is simply left out. */
function useRelated<T>(load: () => Promise<T>, fallback: T): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    load().catch(() => fallback).then(value => { if (alive) setData(value); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-slate-400 italic">{children}</p>;

const JOB_STATUS: Record<JobOpening['status'], string> = {
  draft: 'Rascunho', open: 'Aberta / Ativa', in_progress: 'Em andamento', offer: 'Em proposta', filled: 'Preenchida', cancelled: 'Cancelada'
};
const CAREER_TRACK: Record<JobPosition['careerTrack'], string> = {
  Y_TECNICO: 'Carreira em Y (técnica)', 'GESTÃO': 'Gestão', OPERACIONAL: 'Operacional'
};

// ---------------------------------------------------------------------------------------------
// Estrutura Organizacional
// ---------------------------------------------------------------------------------------------
export const DepartmentSummaryModal: React.FC<{
  department: Department;
  departments: Department[];
  onEdit?: () => void;
  onClose: () => void;
}> = ({ department, departments, onEdit, onClose }) => {
  const users = useRelated(() => TenantApi.getUsers(), [] as TenantUser[]);
  const positions = useRelated(() => TenantApi.getPositions(), [] as JobPosition[]);
  const openings = useRelated(() => TenantApi.getOpenings(), [] as JobOpening[]);

  const manager = users?.find(u => u.id === department.managerId);
  const parent = departments.find(d => d.id === department.parentId);
  const children = departments.filter(d => d.parentId === department.id);
  const deptPositions = (positions ?? []).filter(p => p.departmentId === department.id);
  const deptOpenings = (openings ?? []).filter(o => o.departmentId === department.id);
  const team = (users ?? []).filter(u => u.departmentId === department.id && u.active);
  const progress = Math.min(100, Math.round((department.currentHeadcount / (department.headcountTarget || 1)) * 100));
  const gap = Math.max(0, department.headcountTarget - department.currentHeadcount);
  const openSeats = deptOpenings.filter(o => o.status === 'open').reduce((sum, o) => sum + Math.max(0, o.openingsCount - o.filledCount), 0);

  return (
    <Shell
      kicker="Resumo do departamento"
      title={department.name}
      subtitle={<>Código <span className="font-mono">{department.code}</span> · Centro de custo <span className="font-mono">{department.costCenter}</span></>}
      onEdit={onEdit}
      onClose={onClose}
    >
      <Section title="Capacidade de pessoal (headcount)">
        <div className="flex items-end justify-between">
          <span className="text-slate-600">Atual / Meta</span>
          <span className="font-mono text-base font-bold text-slate-900">{department.currentHeadcount} / {department.headcountTarget}</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : progress >= 70 ? 'bg-indigo-600' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="text-slate-500">
          {progress}% ocupado · {gap > 0 ? `faltam ${gap} pessoa(s) para a meta` : 'meta atingida'}
          {openings && ` · ${openSeats} posição(ões) em vagas abertas`}
        </div>
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Fact label="Gestor responsável">
          <span className="flex items-center gap-1.5"><UserCircle2 className="w-3.5 h-3.5 text-slate-400" />{manager ? manager.name : users ? 'Não definido' : '—'}</span>
        </Fact>
        <Fact label="Hierarquia">
          {parent ? <>Subordinado a {parent.name}</> : 'Área de primeiro nível'}
          {children.length > 0 && <div className="text-[11px] font-normal text-slate-500 mt-0.5">Contém: {children.map(c => c.name).join(', ')}</div>}
        </Fact>
      </div>

      <Section title={`Cargos da área (${deptPositions.length})`}>
        {positions === null ? <Muted>Carregando…</Muted> : deptPositions.length === 0 ? <Muted>Nenhum cargo cadastrado nesta área.</Muted> : (
          <Chips items={deptPositions.map(p => `${p.title} · ${p.level}`)} tone="bg-indigo-50 text-indigo-700" />
        )}
      </Section>

      <Section title={`Vagas da área (${deptOpenings.length})`}>
        {openings === null ? <Muted>Carregando…</Muted> : deptOpenings.length === 0 ? <Muted>Nenhuma vaga para esta área.</Muted> : (
          <ul className="space-y-1">
            {deptOpenings.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200">
                <span className="font-medium text-slate-800 truncate">{o.title}</span>
                <span className="text-slate-500 shrink-0">{JOB_STATUS[o.status]} · {o.filledCount}/{o.openingsCount} preenchida(s)</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {users && team.length > 0 && (
        <Section title={`Pessoas com acesso ao sistema nesta área (${team.length})`}>
          <Chips items={team.map(u => u.name)} />
        </Section>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------------------------------
// Catálogo de Cargos & Competências
// ---------------------------------------------------------------------------------------------
export const PositionSummaryModal: React.FC<{
  position: JobPosition;
  department?: Department;
  onEdit?: () => void;
  onClose: () => void;
}> = ({ position, department, onEdit, onClose }) => {
  const openings = useRelated(() => TenantApi.getOpenings(), [] as JobOpening[]);
  const related = (openings ?? []).filter(o => o.positionId === position.id);

  return (
    <Shell
      kicker="Resumo do cargo"
      title={position.title}
      subtitle={<>{department?.name || 'Área geral'} · {CAREER_TRACK[position.careerTrack] ?? position.careerTrack}</>}
      badge={<span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">{position.level}</span>}
      onEdit={onEdit}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Fact label="Faixa salarial">
          <span className="font-mono">{money(position.minSalary)} – {money(position.maxSalary)}</span>
        </Fact>
        <Fact label="Amplitude">
          <span className="font-mono">{position.minSalary > 0 ? `+${Math.round(((position.maxSalary - position.minSalary) / position.minSalary) * 100)}%` : '—'}</span>
        </Fact>
        <Fact label="Situação">{position.status === 'active' ? 'Ativo' : 'Arquivado'}</Fact>
      </div>

      <Section title="Descrição">
        {position.description ? <p className="text-slate-700 leading-relaxed">{position.description}</p> : <Muted>Sem descrição.</Muted>}
      </Section>

      <Section title="Requisitos técnicos"><Chips items={position.technicalRequirements} /></Section>
      <Section title="Competências comportamentais"><Chips items={position.behavioralCompetencies} tone="bg-violet-50 text-violet-700" /></Section>

      <Section title={`Vagas que usam este cargo (${related.length})`}>
        {openings === null ? <Muted>Carregando…</Muted> : related.length === 0 ? <Muted>Nenhuma vaga aberta com este cargo.</Muted> : (
          <ul className="space-y-1">
            {related.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200">
                <span className="font-medium text-slate-800 truncate">{o.title}</span>
                <span className="text-slate-500 shrink-0">{JOB_STATUS[o.status]} · {o.filledCount}/{o.openingsCount}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Shell>
  );
};

// ---------------------------------------------------------------------------------------------
// Gestão de Vagas & Requisições
// ---------------------------------------------------------------------------------------------
export const OpeningSummaryModal: React.FC<{
  job: JobOpening;
  department?: Department;
  position?: JobPosition;
  onOpenPipeline?: () => void;
  onOpenPortal?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onClose: () => void;
}> = ({ job, department, position, onOpenPipeline, onOpenPortal, onShare, onEdit, onClose }) => {
  const users = useRelated(() => TenantApi.getUsers(), [] as TenantUser[]);
  const applications = useRelated(() => TenantApi.getApplications(), [] as SelectionApplication[]);

  const jobApps = (applications ?? []).filter(a => a.jobOpeningId === job.id);
  const nameOf = (id: string) => users?.find(u => u.id === id)?.name ?? (users ? 'Não definido' : '—');
  const stages = [...job.stages].sort((a, b) => a.order - b.order);
  const opened = new Date(job.openedAt).getTime();
  const elapsed = Number.isNaN(opened) ? null : Math.max(0, Math.floor((Date.now() - opened) / DAY_MS));
  const slaLeft = elapsed === null ? null : job.slaDays - elapsed;
  const isOpen = job.status === 'open' || job.status === 'in_progress' || job.status === 'offer';

  return (
    <Shell
      kicker="Resumo da vaga"
      title={job.title}
      subtitle={<>{department?.name || 'Área geral'}{position ? ` · ${position.title} (${position.level})` : ''}</>}
      badge={
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${job.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
          {JOB_STATUS[job.status]}
        </span>
      }
      footer={
        <>
          {onShare && <button onClick={onShare} className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Divulgar</button>}
          {onOpenPortal && <button onClick={onOpenPortal} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Página pública</button>}
          {onOpenPipeline && <button onClick={onOpenPipeline} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5">Ver pipeline de candidatos <ArrowRight className="w-3.5 h-3.5" /></button>}
        </>
      }
      onEdit={onEdit}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Fact label="Posições">{job.filledCount}/{job.openingsCount} preenchida(s)</Fact>
        <Fact label="Modelo e local"><span className="flex items-start gap-1"><MapPin className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />{job.workModel} • {job.location}</span></Fact>
        <Fact label="Candidatos no funil">{applications === null ? '…' : jobApps.length}</Fact>
      </div>

      <Section title="Prazos (SLA)">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> Aberta em {formatDateSP(job.openedAt)}</span>
          <span>Meta de preenchimento: {formatDateSP(job.targetFillDate)}</span>
          <span>SLA: {job.slaDays} dias</span>
        </div>
        {isOpen && slaLeft !== null && (
          <div className={`px-3 py-2 rounded-lg font-semibold ${slaLeft < 0 ? 'bg-rose-50 text-rose-700' : slaLeft <= 5 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {slaLeft < 0 ? `SLA estourado há ${-slaLeft} dia(s)` : `${slaLeft} dia(s) restantes no SLA`} · {elapsed} dia(s) desde a abertura
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Fact label="Gestor da vaga"><span className="flex items-center gap-1.5"><UserCircle2 className="w-3.5 h-3.5 text-slate-400" />{nameOf(job.hiringManagerId)}</span></Fact>
        <Fact label="Recrutador(a)"><span className="flex items-center gap-1.5"><UserCircle2 className="w-3.5 h-3.5 text-slate-400" />{nameOf(job.recruiterId)}</span></Fact>
      </div>

      {(job.salaryOfferedMin || job.salaryOfferedMax || position) && (
        <Section title="Remuneração">
          <div className="text-slate-700">
            {job.salaryOfferedMin && job.salaryOfferedMax
              ? <>Oferecida nesta vaga: <b className="font-mono">{money(job.salaryOfferedMin)} – {money(job.salaryOfferedMax)}</b></>
              : 'Faixa da vaga não informada.'}
            {position && <div className="text-slate-500">Faixa do cargo: <span className="font-mono">{money(position.minSalary)} – {money(position.maxSalary)}</span></div>}
          </div>
        </Section>
      )}

      <Section title={`Funil de seleção (${stages.length} etapas)`}>
        <div className="space-y-1.5">
          {stages.map((s, i) => {
            const count = jobApps.filter(a => a.currentStageId === s.id).length;
            return (
              <div key={s.id} className="flex items-start justify-between gap-3 p-2 rounded-lg border border-slate-200">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{i + 1}. {s.name}</div>
                  {s.description && <div className="text-slate-500">{s.description}</div>}
                </div>
                <span className="shrink-0 flex items-center gap-1 font-mono font-bold text-slate-700"><Users className="w-3 h-3 text-slate-400" />{applications === null ? '…' : count}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {job.customQuestions && job.customQuestions.length > 0 && (
        <Section title="Perguntas para os candidatos">
          <ul className="space-y-0.5 text-slate-700 list-disc pl-4">{job.customQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </Section>
      )}
    </Shell>
  );
};
