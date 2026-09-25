import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BriefcaseBusiness, CalendarDays, Clock3, Download, FileText, Filter, Mail, Paperclip, Pencil, Phone, Plane, Plus, Save, Search, Trash2, UserCog, WalletCards, X } from 'lucide-react';
import { TenantApi, ApiError } from '../../services/api.js';
import { HR_DOCUMENT_STATUSES, HR_PAYROLL_STATUSES, HR_VACATION_STATUSES } from '../../types.js';
import type { Department, Employee, EmployeeOrigin, EmployeeStatus, EmployeeTimelineEvent, HrDocument, HrDocumentStatus, HrPayrollRecord, HrPayrollStatus, HrVacationPeriod, HrVacationStatus, JobPosition, TenantUser } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { formatDateSP, formatDateTimeSP } from '../../utils/dateUtils.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

const STATUS_LABEL: Record<EmployeeStatus, string> = { active: 'Ativo', onboarding: 'Onboarding', inactive: 'Inativo' };
const ORIGIN_LABEL: Record<EmployeeOrigin, string> = { hired_candidate: 'Contratação', tenant_user: 'Usuário', manual: 'Manual' };
const STATUS_CLASS: Record<EmployeeStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  onboarding: 'bg-indigo-100 text-indigo-800',
  inactive: 'bg-slate-100 text-slate-600'
};
const DOC_STATUS_LABEL: Record<HrDocumentStatus, string> = { pending: 'Pendente', valid: 'Válido', expired: 'Vencido', archived: 'Arquivado' };
const VACATION_STATUS_LABEL: Record<HrVacationStatus, string> = { accrued: 'Adquirido', scheduled: 'Programado', approved: 'Aprovado', in_progress: 'Em andamento', completed: 'Concluído', cancelled: 'Cancelado' };
const PAYROLL_STATUS_LABEL: Record<HrPayrollStatus, string> = { open: 'Aberta', collecting: 'Em coleta', review: 'Em revisão', closed: 'Fechada' };

const emptyForm: Partial<Employee> = { name: '', email: '', phone: '', status: 'active', origin: 'manual', jobTitle: 'Sem cargo cadastrado' };
type EmployeeFolder = 'profile' | 'documents' | 'vacations' | 'payroll' | 'timeline';
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysUntil = (date?: string) => date ? Math.ceil((Date.parse(`${date}T00:00:00`) - Date.parse(`${todayISO()}T00:00:00`)) / 86400000) : null;
const isExpiring = (d: HrDocument) => d.status !== 'archived' && daysUntil(d.expiresAt) !== null && daysUntil(d.expiresAt)! >= 0 && daysUntil(d.expiresAt)! <= 30;
const isExpired = (d: HrDocument) => d.status === 'expired' || (daysUntil(d.expiresAt) !== null && daysUntil(d.expiresAt)! < 0 && d.status !== 'archived');

export const ModuleHR: React.FC = () => {
  const { user } = useAuth();
  const canCreate = !!user?.permissions.includes('hr:create');
  const canEdit = !!user?.permissions.includes('hr:edit');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<HrDocument[]>([]);
  const [vacations, setVacations] = useState<HrVacationPeriod[]>([]);
  const [payroll, setPayroll] = useState<HrPayrollRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | EmployeeStatus>('all');
  const [origin, setOrigin] = useState<'all' | EmployeeOrigin>('all');
  const [departmentId, setDepartmentId] = useState('all');
  const [positionId, setPositionId] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [emps, docs, vacs, pay, deps, pos, members] = await Promise.all([
        TenantApi.getEmployees(), TenantApi.getHrDocuments(), TenantApi.getHrVacations(), TenantApi.getHrPayroll(),
        TenantApi.getDepartments(), TenantApi.getPositions(), TenantApi.getUsers()
      ]);
      setEmployees(emps);
      setDocuments(docs);
      setVacations(vacs);
      setPayroll(pay);
      setDepartments(deps);
      setPositions(pos);
      setUsers(members);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar colaboradores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const depName = (id?: string) => departments.find(d => d.id === id)?.name ?? 'Sem departamento';
  const managerName = (id?: string) => users.find(u => u.id === id)?.name ?? 'Sem gestor';
  const positionName = (id?: string, fallback?: string) => positions.find(p => p.id === id)?.title ?? fallback ?? 'Sem cargo cadastrado';

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(e => {
      if (status !== 'all' && e.status !== status) return false;
      if (origin !== 'all' && e.origin !== origin) return false;
      if (departmentId !== 'all' && e.departmentId !== departmentId) return false;
      if (positionId !== 'all' && e.positionId !== positionId) return false;
      return !q || `${e.name} ${e.email ?? ''} ${e.jobTitle}`.toLowerCase().includes(q);
    });
  }, [employees, query, status, origin, departmentId, positionId]);

  const selected = employees.find(e => e.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">RH / Colaboradores</h1>
          <p className="text-xs text-slate-500">Base mestre, documentos vencendo, férias e controle operacional de folha.</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo colaborador
          </button>
        )}
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <HrKpi icon={<UserCog className="w-4 h-4" />} label="Ativos" value={employees.filter(e => e.status === 'active').length} />
        <HrKpi icon={<AlertTriangle className="w-4 h-4" />} label="Documentos vencendo" value={documents.filter(isExpiring).length} warn={documents.some(isExpiring)} />
        <HrKpi icon={<Plane className="w-4 h-4" />} label="Férias em aberto" value={vacations.filter(v => !['completed', 'cancelled'].includes(v.status)).length} />
        <HrKpi icon={<WalletCards className="w-4 h-4" />} label="Folhas abertas" value={payroll.filter(p => p.status !== 'closed').length} warn={payroll.some(p => p.status !== 'closed')} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome, email ou cargo" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <Select value={status} onChange={setStatus} options={[['all', 'Todos status'], ['active', 'Ativos'], ['onboarding', 'Onboarding'], ['inactive', 'Inativos']]} />
          <Select value={origin} onChange={setOrigin} options={[['all', 'Todas origens'], ['hired_candidate', 'Contratação'], ['tenant_user', 'Usuário'], ['manual', 'Manual']]} />
          <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <option value="all">Todos departamentos</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Filter className="w-3.5 h-3.5" /> {shown.length} de {employees.length} colaborador(es)
          <select value={positionId} onChange={e => setPositionId(e.target.value)} className="ml-auto px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600">
            <option value="all">Todos os cargos</option>
            {positions.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? <div className="py-10 text-center text-xs text-slate-400">Carregando colaboradores...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                <tr><th className="text-left px-4 py-3">Colaborador</th><th className="text-left px-4 py-3">Cargo</th><th className="text-left px-4 py-3">Departamento</th><th className="text-left px-4 py-3">Gestor</th><th className="text-left px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(e => (
                  <tr key={e.id} onClick={() => setSelectedId(e.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3"><div className="font-semibold text-slate-900">{e.name}</div><div className="text-slate-400">{e.email || 'Sem email'} · {ORIGIN_LABEL[e.origin]}</div></td>
                    <td className="px-4 py-3 text-slate-600">{positionName(e.positionId, e.jobTitle)}</td>
                    <td className="px-4 py-3 text-slate-600">{depName(e.departmentId)}</td>
                    <td className="px-4 py-3 text-slate-600">{managerName(e.managerId)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_CLASS[e.status]}`}>{STATUS_LABEL[e.status]}</span></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Nenhum colaborador encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <EmployeeModal employee={selected} canEdit={canEdit} departments={departments} positions={positions} users={users} onClose={() => setSelectedId(null)} onChanged={(e) => { setEmployees(list => list.map(item => item.id === e.id ? e : item)); }} />}
      {creating && <EmployeeModal employee={null} canEdit departments={departments} positions={positions} users={users} onClose={() => setCreating(false)} onChanged={(e) => { setEmployees(list => [e, ...list]); setCreating(false); setSelectedId(e.id); }} />}
    </div>
  );
};

const Select: React.FC<{ value: string; onChange: (v: any) => void; options: [string, string][] }> = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
    {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
  </select>
);


const HrKpi: React.FC<{ icon: React.ReactNode; label: string; value: number; warn?: boolean }> = ({ icon, label, value, warn }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
    <div className={`p-2 rounded-xl ${warn ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>{icon}</div>
    <div><div className="text-xl font-bold text-slate-900">{value}</div><div className="text-xs text-slate-500">{label}</div></div>
  </div>
);

const HrBadge: React.FC<{ children: React.ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'muted' }> = ({ children, tone = 'muted' }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tone === 'ok' ? 'bg-emerald-100 text-emerald-800' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : tone === 'danger' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>{children}</span>
);

const EmployeeModal: React.FC<{
  employee: Employee | null;
  canEdit: boolean;
  departments: Department[];
  positions: JobPosition[];
  users: TenantUser[];
  onClose: () => void;
  onChanged: (employee: Employee) => void;
}> = ({ employee, canEdit, departments, positions, users, onClose, onChanged }) => {
  const backdrop = useBackdropClose(onClose);
  const [folderTab, setFolderTab] = useState<EmployeeFolder>('profile');
  const [form, setForm] = useState<Partial<Employee>>(employee ?? emptyForm);
  const [timeline, setTimeline] = useState<EmployeeTimelineEvent[]>([]);
  const [hrDocs, setHrDocs] = useState<HrDocument[]>([]);
  const [hrVacations, setHrVacations] = useState<HrVacationPeriod[]>([]);
  const [hrPayroll, setHrPayroll] = useState<HrPayrollRecord[]>([]);
  const [docDraft, setDocDraft] = useState<Partial<HrDocument>>({ name: '', category: 'Geral', status: 'valid' });
  const [vacDraft, setVacDraft] = useState<Partial<HrVacationPeriod>>({ acquisitionStart: todayISO(), acquisitionEnd: todayISO(), days: 30, status: 'accrued' });
  const [payDraft, setPayDraft] = useState<Partial<HrPayrollRecord>>({ period: new Date().toISOString().slice(0, 7), status: 'open', admissionEvent: false, vacationEvent: false, leaveEvent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(employee ?? emptyForm);
    setFolderTab('profile');
    if (employee) {
      TenantApi.getEmployeeTimeline(employee.id).then(setTimeline).catch(() => setTimeline([]));
      TenantApi.getHrDocuments(employee.id).then(setHrDocs).catch(() => setHrDocs([]));
      TenantApi.getHrVacations(employee.id).then(setHrVacations).catch(() => setHrVacations([]));
      TenantApi.getHrPayroll(employee.id).then(setHrPayroll).catch(() => setHrPayroll([]));
    } else {
      setTimeline([]); setHrDocs([]); setHrVacations([]); setHrPayroll([]);
    }
  }, [employee?.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      const saved = employee ? await TenantApi.updateEmployee(employee.id, form) : await TenantApi.createEmployee(form);
      onChanged(saved);
      setForm(saved);
      if (employee) setTimeline(await TenantApi.getEmployeeTimeline(saved.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o colaborador.');
    } finally {
      setBusy(false);
    }
  };


  const ensureSavedEmployee = () => {
    if (!employee?.id) throw new Error('Salve o colaborador antes de cadastrar itens de RH.');
    return employee.id;
  };

  const addDocument = async () => {
    try {
      setBusy(true); setError('');
      const saved = await TenantApi.createHrDocument({ ...docDraft, employeeId: ensureSavedEmployee() });
      setHrDocs(list => [saved, ...list]);
      setDocDraft({ name: '', category: 'Geral', status: 'valid' });
      setTimeline(await TenantApi.getEmployeeTimeline(saved.employeeId));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o documento.'); }
    finally { setBusy(false); }
  };

  const addVacation = async () => {
    try {
      setBusy(true); setError('');
      const saved = await TenantApi.createHrVacation({ ...vacDraft, employeeId: ensureSavedEmployee() });
      setHrVacations(list => [saved, ...list]);
      setVacDraft({ acquisitionStart: todayISO(), acquisitionEnd: todayISO(), days: 30, status: 'accrued' });
      setTimeline(await TenantApi.getEmployeeTimeline(saved.employeeId));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar as férias.'); }
    finally { setBusy(false); }
  };

  const addPayroll = async () => {
    try {
      setBusy(true); setError('');
      const saved = await TenantApi.createHrPayroll({ ...payDraft, employeeId: ensureSavedEmployee() });
      setHrPayroll(list => [saved, ...list]);
      setPayDraft({ period: new Date().toISOString().slice(0, 7), status: 'open', admissionEvent: false, vacationEvent: false, leaveEvent: false });
      setTimeline(await TenantApi.getEmployeeTimeline(saved.employeeId));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a folha.'); }
    finally { setBusy(false); }
  };

  const updateDocument = async (id: string, patch: Partial<HrDocument>) => {
    try {
      setError('');
      const saved = await TenantApi.updateHrDocument(id, patch);
      setHrDocs(list => list.map(item => item.id === id ? saved : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o documento.'); throw err; }
  };

  const deleteDocument = async (id: string) => {
    try {
      setError('');
      await TenantApi.deleteHrDocument(id);
      setHrDocs(list => list.filter(item => item.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir o documento.'); }
  };

  const uploadDocumentFile = async (doc: HrDocument, file: File) => {
    try {
      setError('');
      if (doc.source === 'admission' && doc.onboardingId && doc.sourceId) {
        await TenantApi.uploadAdmissionFile(doc.onboardingId, doc.sourceId, file);
        setHrDocs(await TenantApi.getHrDocuments(ensureSavedEmployee()));
      } else {
        const saved = await TenantApi.uploadHrDocumentFile(doc.id, file);
        setHrDocs(list => list.map(item => item.id === doc.id ? saved : item));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível anexar o arquivo.'); }
  };

  const downloadDocumentFile = (doc: HrDocument) => {
    if (doc.source === 'admission' && doc.onboardingId && doc.sourceId) {
      void TenantApi.downloadAdmissionFile(doc.onboardingId, doc.sourceId, doc.fileName || doc.name);
    } else {
      void TenantApi.downloadHrDocumentFile(doc.id, doc.fileName || doc.name);
    }
  };

  const removeDocumentFile = async (doc: HrDocument) => {
    try {
      setError('');
      if (doc.source === 'admission' && doc.onboardingId && doc.sourceId) {
        await TenantApi.deleteAdmissionFile(doc.onboardingId, doc.sourceId);
        setHrDocs(await TenantApi.getHrDocuments(ensureSavedEmployee()));
      } else {
        const saved = await TenantApi.deleteHrDocumentFile(doc.id);
        setHrDocs(list => list.map(item => item.id === doc.id ? saved : item));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover o anexo.'); }
  };

  const updateVacation = async (id: string, patch: Partial<HrVacationPeriod>) => {
    try {
      setError('');
      const saved = await TenantApi.updateHrVacation(id, patch);
      setHrVacations(list => list.map(item => item.id === id ? saved : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar as férias.'); throw err; }
  };

  const deleteVacation = async (id: string) => {
    try {
      setError('');
      await TenantApi.deleteHrVacation(id);
      setHrVacations(list => list.filter(item => item.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir as férias.'); }
  };

  const updatePayroll = async (id: string, patch: Partial<HrPayrollRecord>) => {
    try {
      setError('');
      const saved = await TenantApi.updateHrPayroll(id, patch);
      setHrPayroll(list => list.map(item => item.id === id ? saved : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a folha.'); throw err; }
  };

  const deletePayroll = async (id: string) => {
    try {
      setError('');
      await TenantApi.deleteHrPayroll(id);
      setHrPayroll(list => list.filter(item => item.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir a folha.'); }
  };

  const readonly = !canEdit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={employee ? `Perfil de ${employee.name}` : 'Novo colaborador'}
        className="w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div><h3 className="text-sm font-bold text-slate-900">{employee ? employee.name : 'Novo colaborador'}</h3><p className="text-xs text-slate-500">Dossiê do colaborador com pastas integradas ao RH.</p></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-1">
          <FolderButton active={folderTab === 'profile'} onClick={() => setFolderTab('profile')} icon={<UserCog className="w-3.5 h-3.5" />} label="Perfil" />
          <FolderButton active={folderTab === 'documents'} onClick={() => setFolderTab('documents')} icon={<FileText className="w-3.5 h-3.5" />} label={'Documentos (' + hrDocs.length + ')'} disabled={!employee} />
          <FolderButton active={folderTab === 'vacations'} onClick={() => setFolderTab('vacations')} icon={<Plane className="w-3.5 h-3.5" />} label={'Férias (' + hrVacations.length + ')'} disabled={!employee} />
          <FolderButton active={folderTab === 'payroll'} onClick={() => setFolderTab('payroll')} icon={<WalletCards className="w-3.5 h-3.5" />} label={'Folha (' + hrPayroll.length + ')'} disabled={!employee} />
          <FolderButton active={folderTab === 'timeline'} onClick={() => setFolderTab('timeline')} icon={<Clock3 className="w-3.5 h-3.5" />} label="Linha do tempo" disabled={!employee} />
        </div>
        <form onSubmit={save} className="p-5 space-y-5 text-xs overflow-y-auto">
          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}
          {folderTab === 'profile' && <section className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome" value={form.name ?? ''} disabled={readonly} required onChange={v => setForm({ ...form, name: v })} />
              <Field label="Email" value={form.email ?? ''} disabled={readonly} onChange={v => setForm({ ...form, email: v })} icon={<Mail className="w-3.5 h-3.5" />} />
              <Field label="Telefone" value={form.phone ?? ''} disabled={readonly} onChange={v => setForm({ ...form, phone: v })} icon={<Phone className="w-3.5 h-3.5" />} />
              <Field label="Admissão" type="date" value={form.hireDate ?? ''} disabled={readonly} onChange={v => setForm({ ...form, hireDate: v })} icon={<CalendarDays className="w-3.5 h-3.5" />} />
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Status</span><select disabled={readonly} value={form.status ?? 'active'} onChange={e => setForm({ ...form, status: e.target.value as EmployeeStatus })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"><option value="active">Ativo</option><option value="onboarding">Onboarding</option><option value="inactive">Inativo</option></select></label>
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Origem</span><select disabled={readonly} value={form.origin ?? 'manual'} onChange={e => setForm({ ...form, origin: e.target.value as EmployeeOrigin })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"><option value="manual">Manual</option><option value="tenant_user">Usuário</option><option value="hired_candidate">Contratação</option></select></label>
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Cargo</span><select disabled={readonly} value={form.positionId ?? ''} onChange={e => setForm({ ...form, positionId: e.target.value || undefined })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"><option value="">Sem cargo cadastrado</option>{positions.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Departamento</span><select disabled={readonly} value={form.departmentId ?? ''} onChange={e => setForm({ ...form, departmentId: e.target.value || undefined })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"><option value="">Sem departamento</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Gestor</span><select disabled={readonly} value={form.managerId ?? ''} onChange={e => setForm({ ...form, managerId: e.target.value || undefined })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"><option value="">Sem gestor</option>{users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Vincular usuário</span><select disabled={readonly} value={form.userId ?? ''} onChange={e => setForm({ ...form, userId: e.target.value || undefined })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"><option value="">Sem usuário</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} - {u.email}</option>)}</select></label>
            </div>
            {canEdit && <button disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 disabled:opacity-60"><Save className="w-3.5 h-3.5" /> {busy ? 'Salvando...' : 'Salvar'}</button>}
          </section>}
          {folderTab === 'documents' && <section className="space-y-4">
            <FolderHeader icon={<FileText className="w-4 h-4" />} title="Documentos" subtitle="Documentos próprios do RH e itens integrados da Pasta de Admissão." />
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 rounded-2xl border border-slate-200 p-3">
              <Field label="Nome" value={docDraft.name ?? ''} disabled={!canEdit || !employee} onChange={v => setDocDraft({ ...docDraft, name: v })} />
              <Field label="Categoria" value={docDraft.category ?? ''} disabled={!canEdit || !employee} onChange={v => setDocDraft({ ...docDraft, category: v })} />
              <Field label="Vencimento" type="date" value={docDraft.expiresAt ?? ''} disabled={!canEdit || !employee} onChange={v => setDocDraft({ ...docDraft, expiresAt: v })} />
              {canEdit && <button type="button" disabled={busy || !employee} onClick={addDocument} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-60 self-end">Adicionar documento</button>}
            </div>
            <DocumentFolderList documents={hrDocs} canEdit={canEdit} onUpdate={updateDocument} onDelete={deleteDocument} onUploadFile={uploadDocumentFile} onDownloadFile={downloadDocumentFile} onRemoveFile={removeDocumentFile} />
          </section>}
          {folderTab === 'vacations' && <section className="space-y-4">
            <FolderHeader icon={<Plane className="w-4 h-4" />} title="Férias" subtitle="Períodos aquisitivos, programação e acompanhamento do colaborador." />
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 rounded-2xl border border-slate-200 p-3">
              <Field label="Início aquisitivo" type="date" value={vacDraft.acquisitionStart ?? ''} disabled={!canEdit || !employee} onChange={v => setVacDraft({ ...vacDraft, acquisitionStart: v })} />
              <Field label="Fim aquisitivo" type="date" value={vacDraft.acquisitionEnd ?? ''} disabled={!canEdit || !employee} onChange={v => setVacDraft({ ...vacDraft, acquisitionEnd: v })} />
              <Field label="Início das férias" type="date" value={vacDraft.startDate ?? ''} disabled={!canEdit || !employee} onChange={v => setVacDraft({ ...vacDraft, startDate: v })} />
              {canEdit && <button type="button" disabled={busy || !employee} onClick={addVacation} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-60 self-end">Adicionar férias</button>}
            </div>
            <VacationFolderList vacations={hrVacations} canEdit={canEdit} onUpdate={updateVacation} onDelete={deleteVacation} />
          </section>}
          {folderTab === 'payroll' && <section className="space-y-4">
            <FolderHeader icon={<WalletCards className="w-4 h-4" />} title="Folha" subtitle="Controle operacional por competência, sem valores salariais no v1." />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 rounded-2xl border border-slate-200 p-3">
              <Field label="Competência" type="month" value={payDraft.period ?? ''} disabled={!canEdit || !employee} onChange={v => setPayDraft({ ...payDraft, period: v })} />
              <label className="flex items-center gap-2 text-slate-600 font-semibold self-end"><input type="checkbox" checked={!!payDraft.admissionEvent} disabled={!canEdit || !employee} onChange={e => setPayDraft({ ...payDraft, admissionEvent: e.target.checked })} /> Admissão</label>
              <label className="flex items-center gap-2 text-slate-600 font-semibold self-end"><input type="checkbox" checked={!!payDraft.vacationEvent} disabled={!canEdit || !employee} onChange={e => setPayDraft({ ...payDraft, vacationEvent: e.target.checked })} /> Férias</label>
              <label className="flex items-center gap-2 text-slate-600 font-semibold self-end"><input type="checkbox" checked={!!payDraft.leaveEvent} disabled={!canEdit || !employee} onChange={e => setPayDraft({ ...payDraft, leaveEvent: e.target.checked })} /> Afastamento</label>
              {canEdit && <button type="button" disabled={busy || !employee} onClick={addPayroll} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-60 self-end">Adicionar competência</button>}
            </div>
            <PayrollFolderList payroll={hrPayroll} canEdit={canEdit} onUpdate={updatePayroll} onDelete={deletePayroll} />
          </section>}
          {folderTab === 'timeline' && <section className="space-y-4">
            <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-1.5"><Clock3 className="w-4 h-4" /> Linha do tempo</h4>
            {timeline.length === 0 ? <p className="text-slate-400">Sem eventos consolidados ainda.</p> : (
              <ul className="space-y-2">
                {timeline.map(ev => <li key={ev.id} className="p-3 rounded-xl border border-slate-200"><div className="flex items-start gap-2"><TimelineIcon kind={ev.kind} /><div className="min-w-0"><div className="font-semibold text-slate-800">{ev.title}</div>{ev.description && <div className="text-slate-500 mt-0.5">{ev.description}</div>}<div className="text-[11px] text-slate-400 mt-1">{ev.at.includes('T') ? formatDateTimeSP(ev.at) : formatDateSP(ev.at)}</div></div></div></li>)}
              </ul>
            )}
          </section>}
        </form>
      </div>
    </div>
  );
};



const FolderButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }> = ({ active, onClick, icon, label, disabled }) => (
  <button type="button" disabled={disabled} onClick={onClick} className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white'}`}>{icon}{label}</button>
);

const FolderHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">{icon}</div>
    <div><h4 className="font-bold text-slate-900">{title}</h4><p className="text-[11px] text-slate-500">{subtitle}</p></div>
  </div>
);

const RowActions: React.FC<{ onEdit: () => void; onDelete: () => void; busy?: boolean }> = ({ onEdit, onDelete, busy }) => (
  <span className="inline-flex items-center gap-1">
    <button type="button" title="Editar" disabled={busy} onClick={onEdit} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
    <button type="button" title="Excluir" disabled={busy} onClick={onDelete} className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
  </span>
);

const FileAction: React.FC<{ uploaded: boolean; canUpload: boolean; busy?: boolean; onUpload: (file: File) => void; onDownload: () => void; onRemove: () => void }> = ({ uploaded, canUpload, busy, onUpload, onDownload, onRemove }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const picker = canUpload && (
    <>
      <button type="button" title={uploaded ? 'Trocar anexo' : 'Anexar arquivo'} disabled={busy} onClick={() => inputRef.current?.click()} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"><Paperclip className="w-3.5 h-3.5" /></button>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
    </>
  );
  if (!uploaded) return canUpload ? <>{picker}</> : null;
  return (
    <>
      <button type="button" title="Baixar anexo" disabled={busy} onClick={onDownload} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"><Download className="w-3.5 h-3.5" /></button>
      {picker}
      {canUpload && <button type="button" title="Remover anexo (reverter envio errado)" disabled={busy} onClick={onRemove} className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>}
    </>
  );
};

const DocumentFolderList: React.FC<{ documents: HrDocument[]; canEdit: boolean; onUpdate: (id: string, patch: Partial<HrDocument>) => Promise<void>; onDelete: (id: string) => Promise<void>; onUploadFile: (doc: HrDocument, file: File) => Promise<void>; onDownloadFile: (doc: HrDocument) => void; onRemoveFile: (doc: HrDocument) => Promise<void> }> = ({ documents, canEdit, onUpdate, onDelete, onUploadFile, onDownloadFile, onRemoveFile }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<HrDocument>>({});
  const [busy, setBusy] = useState(false);

  const startEdit = (d: HrDocument) => { setEditingId(d.id); setDraft({ name: d.name, category: d.category, expiresAt: d.expiresAt ?? '', status: d.status }); };
  const cancelEdit = () => { setEditingId(null); setDraft({}); };
  const save = async (id: string) => { setBusy(true); try { await onUpdate(id, draft); cancelEdit(); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm('Excluir este documento?')) return; setBusy(true); try { await onDelete(id); } finally { setBusy(false); } };
  const upload = async (d: HrDocument, file: File) => { setBusy(true); try { await onUploadFile(d, file); } finally { setBusy(false); } };
  const removeFile = async (d: HrDocument) => { if (!window.confirm('Remover o anexo deste documento?')) return; setBusy(true); try { await onRemoveFile(d); } finally { setBusy(false); } };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-xs"><tbody className="divide-y divide-slate-100">
        {documents.map(d => editingId === d.id ? (
          <tr key={d.id} className="bg-slate-50">
            <td className="px-3 py-2" colSpan={3}>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                <Field label="Nome" value={draft.name ?? ''} onChange={v => setDraft({ ...draft, name: v })} />
                <Field label="Categoria" value={draft.category ?? ''} onChange={v => setDraft({ ...draft, category: v })} />
                <Field label="Vencimento" type="date" value={draft.expiresAt ?? ''} onChange={v => setDraft({ ...draft, expiresAt: v })} />
                <label className="block"><span className="block font-semibold text-slate-600 mb-1">Status</span><select value={draft.status ?? 'valid'} onChange={e => setDraft({ ...draft, status: e.target.value as HrDocumentStatus })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">{HR_DOCUMENT_STATUSES.map(s => <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>)}</select></label>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button type="button" disabled={busy} onClick={() => save(d.id)} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-60">Salvar</button>
                <button type="button" disabled={busy} onClick={cancelEdit} className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">Cancelar</button>
              </div>
            </td>
          </tr>
        ) : (
          <tr key={d.id}><td className="px-3 py-2"><div className="font-semibold text-slate-900">{d.name}</div><div className="text-slate-400">{d.category}{d.source === 'admission' ? ' · Pasta de Admissão' : ''}{d.fileUploaded ? ' · com arquivo' : ''}</div></td><td className="px-3 py-2 text-slate-600">{d.expiresAt ? formatDateSP(d.expiresAt) : 'Sem vencimento'}</td><td className="px-3 py-2 text-right"><span className="inline-flex items-center gap-2"><HrBadge tone={isExpired(d) ? 'danger' : isExpiring(d) ? 'warn' : d.status === 'valid' ? 'ok' : 'muted'}>{d.source === 'admission' && d.status === 'pending' ? 'Pendente admissão' : isExpiring(d) ? 'Vencendo' : DOC_STATUS_LABEL[d.status]}</HrBadge><FileAction uploaded={!!d.fileUploaded} canUpload={canEdit} busy={busy} onUpload={file => upload(d, file)} onDownload={() => onDownloadFile(d)} onRemove={() => removeFile(d)} />{canEdit && d.source !== 'admission' && <RowActions busy={busy} onEdit={() => startEdit(d)} onDelete={() => remove(d.id)} />}</span></td></tr>
        ))}
        {documents.length === 0 && <tr><td className="py-8 text-center text-slate-400">Nenhum documento nesta pasta.</td></tr>}
      </tbody></table>
    </div>
  );
};

const VacationFolderList: React.FC<{ vacations: HrVacationPeriod[]; canEdit: boolean; onUpdate: (id: string, patch: Partial<HrVacationPeriod>) => Promise<void>; onDelete: (id: string) => Promise<void> }> = ({ vacations, canEdit, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<HrVacationPeriod>>({});
  const [busy, setBusy] = useState(false);

  const startEdit = (v: HrVacationPeriod) => { setEditingId(v.id); setDraft({ acquisitionStart: v.acquisitionStart, acquisitionEnd: v.acquisitionEnd, startDate: v.startDate ?? '', endDate: v.endDate ?? '', days: v.days, status: v.status }); };
  const cancelEdit = () => { setEditingId(null); setDraft({}); };
  const save = async (id: string) => { setBusy(true); try { await onUpdate(id, draft); cancelEdit(); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm('Excluir este período de férias?')) return; setBusy(true); try { await onDelete(id); } finally { setBusy(false); } };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden"><table className="w-full text-xs"><tbody className="divide-y divide-slate-100">
      {vacations.map(v => editingId === v.id ? (
        <tr key={v.id} className="bg-slate-50">
          <td className="px-3 py-2" colSpan={3}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
              <Field label="Início aquisitivo" type="date" value={draft.acquisitionStart ?? ''} onChange={v2 => setDraft({ ...draft, acquisitionStart: v2 })} />
              <Field label="Fim aquisitivo" type="date" value={draft.acquisitionEnd ?? ''} onChange={v2 => setDraft({ ...draft, acquisitionEnd: v2 })} />
              <Field label="Início das férias" type="date" value={draft.startDate ?? ''} onChange={v2 => setDraft({ ...draft, startDate: v2 })} />
              <Field label="Fim das férias" type="date" value={draft.endDate ?? ''} onChange={v2 => setDraft({ ...draft, endDate: v2 })} />
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Status</span><select value={draft.status ?? 'accrued'} onChange={e => setDraft({ ...draft, status: e.target.value as HrVacationStatus })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">{HR_VACATION_STATUSES.map(s => <option key={s} value={s}>{VACATION_STATUS_LABEL[s]}</option>)}</select></label>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button type="button" disabled={busy} onClick={() => save(v.id)} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-60">Salvar</button>
              <button type="button" disabled={busy} onClick={cancelEdit} className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">Cancelar</button>
            </div>
          </td>
        </tr>
      ) : (
        <tr key={v.id}><td className="px-3 py-2"><div className="font-semibold text-slate-900">{VACATION_STATUS_LABEL[v.status]}</div><div className="text-slate-400">Aquisitivo: {formatDateSP(v.acquisitionStart)} a {formatDateSP(v.acquisitionEnd)}</div></td><td className="px-3 py-2 text-slate-600">{v.startDate ? formatDateSP(v.startDate) + ' a ' + (v.endDate ? formatDateSP(v.endDate) : '-') : 'Sem programação'}</td><td className="px-3 py-2 text-right"><span className="inline-flex items-center gap-2"><HrBadge>{v.days} dias</HrBadge>{canEdit && <RowActions busy={busy} onEdit={() => startEdit(v)} onDelete={() => remove(v.id)} />}</span></td></tr>
      ))}
      {vacations.length === 0 && <tr><td className="py-8 text-center text-slate-400">Nenhum período de férias nesta pasta.</td></tr>}
    </tbody></table></div>
  );
};

const PayrollFolderList: React.FC<{ payroll: HrPayrollRecord[]; canEdit: boolean; onUpdate: (id: string, patch: Partial<HrPayrollRecord>) => Promise<void>; onDelete: (id: string) => Promise<void> }> = ({ payroll, canEdit, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<HrPayrollRecord>>({});
  const [busy, setBusy] = useState(false);

  const startEdit = (p: HrPayrollRecord) => { setEditingId(p.id); setDraft({ period: p.period, status: p.status, admissionEvent: p.admissionEvent, vacationEvent: p.vacationEvent, leaveEvent: p.leaveEvent }); };
  const cancelEdit = () => { setEditingId(null); setDraft({}); };
  const save = async (id: string) => { setBusy(true); try { await onUpdate(id, draft); cancelEdit(); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm('Excluir este registro de folha?')) return; setBusy(true); try { await onDelete(id); } finally { setBusy(false); } };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden"><table className="w-full text-xs"><tbody className="divide-y divide-slate-100">
      {payroll.map(p => editingId === p.id ? (
        <tr key={p.id} className="bg-slate-50">
          <td className="px-3 py-2" colSpan={3}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
              <Field label="Competência" type="month" value={draft.period ?? ''} onChange={v => setDraft({ ...draft, period: v })} />
              <label className="flex items-center gap-2 text-slate-600 font-semibold self-end"><input type="checkbox" checked={!!draft.admissionEvent} onChange={e => setDraft({ ...draft, admissionEvent: e.target.checked })} /> Admissão</label>
              <label className="flex items-center gap-2 text-slate-600 font-semibold self-end"><input type="checkbox" checked={!!draft.vacationEvent} onChange={e => setDraft({ ...draft, vacationEvent: e.target.checked })} /> Férias</label>
              <label className="flex items-center gap-2 text-slate-600 font-semibold self-end"><input type="checkbox" checked={!!draft.leaveEvent} onChange={e => setDraft({ ...draft, leaveEvent: e.target.checked })} /> Afastamento</label>
              <label className="block"><span className="block font-semibold text-slate-600 mb-1">Status</span><select value={draft.status ?? 'open'} onChange={e => setDraft({ ...draft, status: e.target.value as HrPayrollStatus })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">{HR_PAYROLL_STATUSES.map(s => <option key={s} value={s}>{PAYROLL_STATUS_LABEL[s]}</option>)}</select></label>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button type="button" disabled={busy} onClick={() => save(p.id)} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-60">Salvar</button>
              <button type="button" disabled={busy} onClick={cancelEdit} className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">Cancelar</button>
            </div>
          </td>
        </tr>
      ) : (
        <tr key={p.id}><td className="px-3 py-2"><div className="font-semibold text-slate-900">Competência {p.period}</div><div className="text-slate-400">{[p.admissionEvent && 'Admissão', p.vacationEvent && 'Férias', p.leaveEvent && 'Afastamento'].filter(Boolean).join(', ') || 'Sem eventos marcados'}</div></td><td className="px-3 py-2 text-right" colSpan={2}><span className="inline-flex items-center gap-2"><HrBadge tone={p.status === 'closed' ? 'ok' : 'warn'}>{PAYROLL_STATUS_LABEL[p.status]}</HrBadge>{canEdit && <RowActions busy={busy} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} />}</span></td></tr>
      ))}
      {payroll.length === 0 && <tr><td className="py-8 text-center text-slate-400">Nenhuma competência nesta pasta.</td></tr>}
    </tbody></table></div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean; type?: string; icon?: React.ReactNode }> = ({ label, value, onChange, disabled, required, type = 'text', icon }) => (
  <label className="block"><span className="block font-semibold text-slate-600 mb-1">{label}</span><span className="relative block">{icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}<input type={type} required={required} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} className={`w-full ${icon ? 'pl-8' : 'pl-3'} pr-3 py-2 rounded-xl border border-slate-200 disabled:bg-slate-50`} /></span></label>
);

const TimelineIcon: React.FC<{ kind: EmployeeTimelineEvent['kind'] }> = ({ kind }) => {
  const cls = 'w-4 h-4 text-indigo-500 shrink-0 mt-0.5';
  if (kind === 'hire') return <BriefcaseBusiness className={cls} />;
  if (kind === 'profile') return <UserCog className={cls} />;
  return <Clock3 className={cls} />;
};

export default ModuleHR;
