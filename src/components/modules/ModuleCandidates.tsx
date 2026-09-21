import React, { useState, useEffect } from 'react';
import { Plus, Search, Mail, MapPin, Sparkles, ArrowRight, Pencil } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { Candidate, JobOpening, AIAssistedEvaluation } from '../../types.js';
import { ExportButton } from '../ExportButton.js';
import { exportCandidatesToCSV, exportCandidatesToPDF } from '../../utils/exportUtils.js';
import { useAuth } from '../../context/AuthContext.js';
import { CandidateSummaryModal } from './CandidateSummaryModal.js';
import { CandidateEditModal } from './EntityEditModals.js';
import { isLocalEstimate } from '../../utils/aiEvaluation.js';
import { useAiAccess } from '../../hooks/useAiAccess.js';

export const ModuleCandidates: React.FC<{
  onSelectCandidateForAI?: (candidateId: string, jobId?: string) => void;
  onNavigateToProcess?: (jobId: string, candidateId?: string) => void;
  initialSearchTerm?: string;
  initialSelectedCandidateId?: string;
}> = ({ onSelectCandidateForAI, onNavigateToProcess, initialSearchTerm, initialSelectedCandidateId }) => {
  const { activeTenant } = useTenant();
  const { aiEnabled } = useAiAccess();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [evaluations, setEvaluations] = useState<AIAssistedEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('candidates:edit');

  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState(4);
  const [education, setEducation] = useState('Bacharelado em Ciência da Computação');
  const [skills, setSkills] = useState('');
  const [resumeSummary, setResumeSummary] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [candData, opsData, evalsData] = await Promise.all([
        TenantApi.getCandidates(),
        TenantApi.getOpenings(),
        aiEnabled ? TenantApi.getAIEvaluations() : Promise.resolve([] as AIAssistedEvaluation[])
      ]);
      setCandidates(candData);
      setOpenings(opsData);
      setEvaluations(evalsData);
    } catch (err) {
      console.error('Failed to load candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    try {
      await TenantApi.createCandidate({
        name,
        email,
        phone,
        currentRole,
        yearsOfExperience: Number(yearsOfExperience),
        education,
        resumeSummary,
        skills: skills.split(',').map(s => s.trim()).filter(Boolean)
      });
      setName('');
      setEmail('');
      setPhone('');
      setCurrentRole('');
      setSkills('');
      setResumeSummary('');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar candidato');
    }
  };

  const archivedCount = candidates.filter(c => c.archived).length;

  const filtered = candidates.filter(c => (showArchived || !c.archived) && (
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.currentRole.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.skills.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
  ));

  const handleExportCSV = () => {
    exportCandidatesToCSV(filtered, evaluations, activeTenant?.name || 'Vértice 360', aiEnabled);
  };

  const handleExportPDF = () => {
    exportCandidatesToPDF(
      filtered,
      evaluations,
      activeTenant?.name || 'Vértice 360',
      activeTenant?.dbConfig?.dbName || 'tenant',
      aiEnabled
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Banco de Talentos Isolado</h1>
          <p className="text-xs text-slate-500">
            Candidatos cadastrados exclusivamente na base da sua organização com sigilo corporativo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ExportButton
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            label="Exportar Talent Pool"
            itemCount={filtered.length}
          />

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Candidato
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, cargo atual ou competências (ex: React, Python, Scrum)..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-indigo-500 bg-white"
          />
        </div>
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Mostrar arquivados ({archivedCount})
          </label>
        )}
      </div>

      {/* Candidates List - Expanded Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 sm:gap-6">
        {filtered.map((cand) => {
          const evalItem = evaluations.find(e => e.candidateId === cand.id);
          const isHighlighted = initialSelectedCandidateId === cand.id;
          const initials = cand.name
            .split(' ')
            .slice(0, 2)
            .map(n => n[0])
            .join('')
            .toUpperCase();

          return (
            <div
              key={cand.id}
              onClick={() => setSummaryId(cand.id)}
              className={`p-6 rounded-3xl bg-white border transition-all duration-200 flex flex-col justify-between space-y-5 group relative cursor-pointer ${cand.archived ? 'opacity-70 ' : ''}${
                isHighlighted
                  ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-lg'
                  : 'border-slate-200/90 shadow-xs hover:shadow-lg hover:border-indigo-300'
              }`}
            >
              <div className="space-y-4">
                {/* Header with Avatar and Basic Info */}
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                    {initials || 'CD'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors tracking-tight truncate">
                        {cand.name}
                      </h3>
                      {isHighlighted && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                          Foco
                        </span>
                      )}
                      {cand.archived && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                          Arquivado
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-indigo-600 mt-0.5 truncate">
                      {cand.currentRole}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {cand.yearsOfExperience} anos de experiência
                    </div>
                  </div>
                </div>

                {/* Candidate Performance / AI Evaluation Badge if evaluated (never shown by organizations without the AI module) */}
                {aiEnabled && (evalItem ? (
                  <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100/90 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-xs">{isLocalEstimate(evalItem) ? 'Estimativa local (não é IA):' : 'Fit Cultural & Técnico:'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700 text-xs">
                          {evalItem.overallFitScore}%
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          evalItem.humanReviewerDecision === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          evalItem.humanReviewerDecision === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {evalItem.humanReviewerDecision === 'APPROVED' ? 'Aprovado' :
                           evalItem.humanReviewerDecision === 'REJECTED' ? 'Reprovado' : 'Em Análise'}
                        </span>
                      </div>
                    </div>

                    {/* Fit score bar */}
                    <div className="w-full bg-indigo-200/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, evalItem.overallFitScore))}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-slate-400" />
                      Avaliação Preditiva IA:
                    </span>
                    <span className="text-slate-400 font-medium italic">Pendente</span>
                  </div>
                ))}

                {/* Professional summary */}
                <div className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100 text-xs text-slate-600 leading-relaxed line-clamp-3">
                  {cand.resumeSummary}
                </div>

                {/* Skills tags */}
                <div className="pt-0.5 flex flex-wrap gap-1.5">
                  {cand.skills.slice(0, 4).map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60"
                    >
                      {skill}
                    </span>
                  ))}
                  {cand.skills.length > 4 && (
                    <span className="px-2 py-1 text-[11px] text-slate-500 font-medium bg-slate-50 rounded-xl border border-slate-200/60">
                      +{cand.skills.length - 4}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3.5 border-t border-slate-100 text-xs space-y-3">
                <div className="flex items-center justify-between text-slate-500 text-[11px] gap-2">
                  <span className="truncate flex items-center gap-1" title={cand.email}>
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    {cand.email}
                  </span>
                  <span className="shrink-0 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    {cand.location}
                  </span>
                </div>

                {onSelectCandidateForAI && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectCandidateForAI(cand.id, openings[0]?.id); }}
                    className="w-full py-2.5 rounded-xl bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-all flex items-center justify-center gap-2 border border-indigo-200/80 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-transparent active:scale-99"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 group-hover:text-white" />
                    <span>{evalItem ? 'Ver Avaliação com IA' : 'Avaliar com IA Assistida'}</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditId(cand.id); }}
                    className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {summaryId && candidates.some(c => c.id === summaryId) && (
        <CandidateSummaryModal
          candidate={candidates.find(c => c.id === summaryId)!}
          evaluations={evaluations}
          showAI={aiEnabled}
          openings={openings}
          canEdit={canEdit}
          onEdit={canEdit ? () => { setEditId(summaryId); setSummaryId(null); } : undefined}
          onOpenAI={onSelectCandidateForAI ? (jobId) => onSelectCandidateForAI(summaryId, jobId ?? openings[0]?.id) : undefined}
          onOpenApplication={onNavigateToProcess ? (jobId) => onNavigateToProcess(jobId, summaryId) : undefined}
          onArchive={async (reason) => {
            try {
              await TenantApi.archiveCandidate(summaryId, reason);
              await loadData();
              setSummaryId(null);
            } catch (err: any) {
              alert(err.message || 'Erro ao arquivar o perfil');
            }
          }}
          onUnarchive={async () => {
            try {
              await TenantApi.unarchiveCandidate(summaryId);
              await loadData();
            } catch (err: any) {
              alert(err.message || 'Erro ao reativar o perfil');
            }
          }}
          onClose={() => setSummaryId(null)}
        />
      )}

      {editId && candidates.some(c => c.id === editId) && (
        <CandidateEditModal
          candidate={candidates.find(c => c.id === editId)!}
          onSaved={loadData}
          onClose={() => setEditId(null)}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Cadastrar Candidato</h3>
            <p className="text-xs text-slate-500 mb-4">Cadastra o talento no banco de talentos da sua organização.</p>

            <form onSubmit={handleCreateCandidate} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Beatriz Lima"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="beatriz@email.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+55 11 98888-7777"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cargo Atual</label>
                  <input
                    type="text"
                    value={currentRole}
                    onChange={(e) => setCurrentRole(e.target.value)}
                    placeholder="Ex: Frontend Developer"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Anos de Experiência</label>
                  <input
                    type="number"
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Competências (separadas por vírgula)</label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="React, TypeScript, CSS, Jest, GraphQL"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Resumo Profissional</label>
                <textarea
                  rows={3}
                  value={resumeSummary}
                  onChange={(e) => setResumeSummary(e.target.value)}
                  placeholder="Breve resumo da trajetória, projetos de destaque e realizações..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  Salvar Candidato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
