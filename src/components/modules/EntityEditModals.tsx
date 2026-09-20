import React from 'react';
import { TenantApi } from '../../services/api.js';
import {
  CANDIDATE_DECLARED_FIELDS, Candidate, Department, JobOffer, JobOpening, JobPosition, TenantUser
} from '../../types.js';
import { EditFormModal, FieldDef } from './EditFormModal.js';

const LEVELS: JobPosition['level'][] = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenação', 'Gerência', 'Diretoria'];
const opt = (values: string[]) => values.map(v => ({ value: v, label: v }));

/** Users are only a convenience list for pickers; without permission to view them the picker is simply left out. */
function useUsers(): TenantUser[] {
  const [users, setUsers] = React.useState<TenantUser[]>([]);
  React.useEffect(() => {
    let alive = true;
    TenantApi.getUsers().then(list => { if (alive) setUsers(list.filter(u => u.active)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return users;
}
const userOptions = (users: TenantUser[]) => users.map(u => ({ value: u.id, label: `${u.name}${u.jobTitle ? ` — ${u.jobTitle}` : ''}` }));

// ---- Estrutura Organizacional
export const DepartmentEditModal: React.FC<{
  department: Department;
  departments: Department[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}> = ({ department, departments, onSaved, onClose }) => {
  const users = useUsers();

  // a department cannot be moved under itself or one of its own sub-areas
  const descendants = new Set<string>([department.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of departments) {
      if (d.parentId && descendants.has(d.parentId) && !descendants.has(d.id)) { descendants.add(d.id); grew = true; }
    }
  }

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nome da área', type: 'text', required: true },
    { key: 'code', label: 'Código', type: 'text', required: true, half: true },
    { key: 'costCenter', label: 'Centro de custo', type: 'text', required: true, half: true },
    { key: 'headcountTarget', label: 'Meta de headcount', type: 'number', min: 0, half: true },
    { key: 'currentHeadcount', label: 'Headcount atual', type: 'number', min: 0, half: true },
    { key: 'parentId', label: 'Departamento superior', type: 'select', nullable: true, options: departments.filter(d => !descendants.has(d.id)).map(d => ({ value: d.id, label: d.name })), half: true },
    ...(users.length ? [{ key: 'managerId', label: 'Gestor responsável', type: 'select' as const, nullable: true, options: userOptions(users), half: true }] : [])
  ];

  return (
    <EditFormModal
      title={department.name}
      subtitle="Altere os dados do departamento. Só o que você mudar será salvo."
      fields={fields}
      initial={department as unknown as Record<string, unknown>}
      onSave={async changes => { await TenantApi.updateDepartment(department.id, changes); await onSaved(); onClose(); }}
      onClose={onClose}
    />
  );
};

// ---- Catálogo de Cargos
export const PositionEditModal: React.FC<{
  position: JobPosition;
  departments: Department[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}> = ({ position, departments, onSaved, onClose }) => {
  const fields: FieldDef[] = [
    { key: 'title', label: 'Título do cargo', type: 'text', required: true },
    { key: 'departmentId', label: 'Departamento', type: 'select', required: true, options: departments.map(d => ({ value: d.id, label: d.name })), half: true },
    { key: 'level', label: 'Nível', type: 'select', required: true, options: opt(LEVELS), half: true },
    { key: 'careerTrack', label: 'Trilha de carreira', type: 'select', required: true, half: true, options: [
      { value: 'Y_TECNICO', label: 'Carreira em Y (técnica)' }, { value: 'GESTÃO', label: 'Gestão' }, { value: 'OPERACIONAL', label: 'Operacional' }
    ] },
    { key: 'status', label: 'Situação', type: 'select', required: true, half: true, options: [{ value: 'active', label: 'Ativo' }, { value: 'archived', label: 'Arquivado' }] },
    { key: 'minSalary', label: 'Salário mínimo (R$)', type: 'number', min: 0, half: true },
    { key: 'maxSalary', label: 'Salário máximo (R$)', type: 'number', min: 0, half: true },
    { key: 'description', label: 'Descrição', type: 'textarea' },
    { key: 'technicalRequirements', label: 'Requisitos técnicos', type: 'list' },
    { key: 'behavioralCompetencies', label: 'Competências comportamentais', type: 'list' }
  ];

  return (
    <EditFormModal
      title={position.title}
      subtitle="Altere o cargo. Vagas já abertas continuam apontando para ele."
      fields={fields}
      initial={position as unknown as Record<string, unknown>}
      onSave={async changes => { await TenantApi.updatePosition(position.id, changes); await onSaved(); onClose(); }}
      onClose={onClose}
    />
  );
};

// ---- Gestão de Vagas
export const OpeningEditModal: React.FC<{
  job: JobOpening;
  departments: Department[];
  positions: JobPosition[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}> = ({ job, departments, positions, onSaved, onClose }) => {
  const users = useUsers();
  const fields: FieldDef[] = [
    { key: 'title', label: 'Título da vaga', type: 'text', required: true },
    { key: 'positionId', label: 'Cargo base', type: 'select', required: true, options: positions.map(p => ({ value: p.id, label: p.title })), half: true },
    { key: 'departmentId', label: 'Departamento', type: 'select', required: true, options: departments.map(d => ({ value: d.id, label: d.name })), half: true },
    { key: 'status', label: 'Situação', type: 'select', required: true, half: true, options: [
      { value: 'draft', label: 'Rascunho' }, { value: 'open', label: 'Aberta / Ativa' }, { value: 'in_progress', label: 'Em andamento' },
      { value: 'offer', label: 'Em proposta' }, { value: 'filled', label: 'Preenchida' }, { value: 'cancelled', label: 'Cancelada' }
    ] },
    { key: 'openingsCount', label: 'Número de posições', type: 'number', min: 1, half: true, help: `Mínimo ${Math.max(1, job.filledCount)} (já preenchidas: ${job.filledCount}).` },
    { key: 'workModel', label: 'Modelo de trabalho', type: 'select', required: true, options: opt(['Presencial', 'Híbrido', 'Remoto']), half: true },
    { key: 'location', label: 'Local', type: 'text', required: true, half: true },
    { key: 'slaDays', label: 'SLA (dias)', type: 'number', min: 1, half: true },
    { key: 'targetFillDate', label: 'Meta de preenchimento', type: 'date', half: true },
    { key: 'salaryOfferedMin', label: 'Salário oferecido — mínimo (R$)', type: 'number', min: 0, nullable: true, half: true },
    { key: 'salaryOfferedMax', label: 'Salário oferecido — máximo (R$)', type: 'number', min: 0, nullable: true, half: true },
    ...(users.length ? [
      { key: 'hiringManagerId', label: 'Gestor da vaga', type: 'select' as const, required: true, options: userOptions(users), half: true },
      { key: 'recruiterId', label: 'Recrutador(a)', type: 'select' as const, required: true, options: userOptions(users), half: true }
    ] : []),
    { key: 'customQuestions', label: 'Perguntas para os candidatos', type: 'lines' }
  ];

  return (
    <EditFormModal
      title={job.title}
      subtitle="Altere a vaga. As etapas do funil não mudam por aqui."
      fields={fields}
      initial={job as unknown as Record<string, unknown>}
      onSave={async changes => { await TenantApi.updateOpening(job.id, changes); await onSaved(); onClose(); }}
      onClose={onClose}
    />
  );
};

// ---- Banco de Talentos
const candidateFields = (declaredLocked: boolean): FieldDef[] => {
  const lock = (f: FieldDef): FieldDef => (declaredLocked && (CANDIDATE_DECLARED_FIELDS as readonly string[]).includes(f.key) ? { ...f, readOnly: true, required: false } : f);
  return ([
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'email', label: 'E-mail', type: 'email', required: true, half: true },
    { key: 'phone', label: 'Telefone', type: 'text', half: true },
    { key: 'currentRole', label: 'Cargo atual', type: 'text', required: true, half: true },
    { key: 'yearsOfExperience', label: 'Anos de experiência', type: 'number', min: 0, max: 70, half: true },
    { key: 'location', label: 'Localização', type: 'text', half: true },
    { key: 'education', label: 'Formação', type: 'text', half: true },
    { key: 'linkedinUrl', label: 'LinkedIn', type: 'url', placeholder: 'https://linkedin.com/in/…' },
    { key: 'resumeSummary', label: 'Resumo profissional', type: 'textarea' },
    { key: 'skills', label: 'Competências', type: 'list' },
    { key: 'languages', label: 'Idiomas', type: 'list', half: true },
    { key: 'tags', label: 'Tags', type: 'list', half: true }
  ] as FieldDef[]).map(lock);
};

/**
 * Data the candidate declared on the public form is protected: it can only be changed through a justified
 * correction (the original value stays in the history). Records created by the RH are editable, always with history.
 */
export const CandidateEditModal: React.FC<{
  candidate: Candidate;
  onSaved: () => Promise<void>;
  onClose: () => void;
}> = ({ candidate, onSaved, onClose }) => {
  const [correcting, setCorrecting] = React.useState(false);
  const declared = candidate.dataOrigin === 'candidate';

  if (correcting) {
    const fields: FieldDef[] = [
      ...candidateFields(false).filter(f => (CANDIDATE_DECLARED_FIELDS as readonly string[]).includes(f.key)),
      { key: 'reason', label: 'Motivo da correção', type: 'textarea', required: true, help: 'Obrigatório (mínimo 10 caracteres). Ex.: "Candidato informou por e-mail em 12/03 que o telefone mudou."' }
    ];
    return (
      <EditFormModal
        title={`Registrar correção — ${candidate.name}`}
        subtitle="O valor original é preservado no histórico, com quem corrigiu, quando e por quê."
        notice="Altere apenas o que o candidato pediu para corrigir. Cada campo alterado gera um registro permanente no histórico."
        fields={fields}
        initial={{ ...(candidate as unknown as Record<string, unknown>), reason: '' }}
        saveLabel="Registrar correção"
        onSave={async changes => {
          const { reason, ...data } = changes;
          if (Object.keys(data).length === 0) throw new Error('Altere ao menos um dado a corrigir.');
          await TenantApi.correctCandidate(candidate.id, data, String(reason ?? ''));
          await onSaved();
          onClose();
        }}
        secondaryAction={{ label: '← Voltar', onClick: () => setCorrecting(false) }}
        onClose={onClose}
      />
    );
  }

  return (
    <EditFormModal
      title={candidate.name}
      subtitle={declared ? 'Cadastro feito pelo próprio candidato no portal.' : 'Cadastro feito pelo RH. Toda alteração fica registrada no histórico.'}
      notice={declared ? (
        <>Os dados marcados com cadeado foram <b>informados pelo candidato</b> e não podem ser editados. Se precisarem ser corrigidos, use <b>Registrar correção</b> e informe o motivo. Idiomas e tags podem ser editados normalmente.</>
      ) : undefined}
      fields={candidateFields(declared)}
      initial={candidate as unknown as Record<string, unknown>}
      secondaryAction={declared ? { label: 'Registrar correção…', onClick: () => setCorrecting(true) } : undefined}
      onSave={async changes => { await TenantApi.updateCandidate(candidate.id, changes); await onSaved(); onClose(); }}
      onClose={onClose}
    />
  );
};

// ---- Propostas
export const OfferEditModal: React.FC<{
  offer: JobOffer;
  candidateName?: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}> = ({ offer, candidateName, onSaved, onClose }) => {
  const fields: FieldDef[] = [
    { key: 'baseSalary', label: 'Salário base (R$)', type: 'number', min: 0, half: true },
    { key: 'contractType', label: 'Tipo de contrato', type: 'select', required: true, options: opt(['CLT', 'PJ']), half: true },
    { key: 'startDate', label: 'Data de início', type: 'date', required: true, half: true },
    { key: 'benefits', label: 'Benefícios', type: 'list', help: 'Separe por vírgula. Os itens do catálogo são cadastrados em "Benefícios".' },
    { key: 'notes', label: 'Observações', type: 'textarea' }
  ];

  return (
    <EditFormModal
      title={`Proposta — ${candidateName ?? 'Candidato'}`}
      subtitle={offer.status === 'approved'
        ? 'Atenção: alterar os termos de uma proposta já aprovada a envia de volta para nova aprovação.'
        : 'Altere os termos enquanto a proposta ainda não foi enviada ao candidato.'}
      fields={fields}
      initial={offer as unknown as Record<string, unknown>}
      onSave={async changes => { await TenantApi.updateOffer(offer.id, changes); await onSaved(); onClose(); }}
      onClose={onClose}
    />
  );
};
