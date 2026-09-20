import React, { useState, useEffect } from 'react';
import { Plus, Gift, Pencil, CheckCircle2, Send, Calendar, X, Mail, Phone, Briefcase, Rocket } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { JobOffer, Candidate, JobOpening, BenefitCatalogItem, JobPosition } from '../../types.js';
import { BenefitCatalogModal } from './BenefitCatalogModal.js';
import { useAuth } from '../../context/AuthContext.js';
import { OfferEditModal } from './EntityEditModals.js';
import { formatDateSP } from '../../utils/dateUtils.js';

export const ModuleOffers: React.FC = () => {
  const { activeTenant } = useTenant();
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [editOfferId, setEditOfferId] = useState<string | null>(null);
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('offers:edit');
  // Terms are locked once the offer has gone to the candidate
  const isEditable = (o: JobOffer) => canEdit && ['draft', 'pending_approval', 'approved'].includes(o.status);

  // Form states
  const [candidateId, setCandidateId] = useState('');
  const [jobOpeningId, setJobOpeningId] = useState('');
  const [baseSalary, setBaseSalary] = useState(16000);
  const [benefits, setBenefits] = useState<BenefitCatalogItem[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [benefitsInput, setBenefitsInput] = useState('');
  const [startDate, setStartDate] = useState(new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]);

  const loadBenefits = () =>
    TenantApi.getBenefits().then(setBenefits).catch(() => setBenefits([]));

  const activeBenefits = benefits.filter(b => b.active);

  // Pacote-padrão: benefícios marcados para o nível do cargo da vaga escolhida.
  useEffect(() => {
    if (!isModalOpen) return;
    const positionId = openings.find(j => j.id === jobOpeningId)?.positionId;
    const level = positions.find(p => p.id === positionId)?.level;
    setSelectedBenefits(
      level ? benefits.filter(b => b.active && b.defaultLevels.includes(level)).map(b => b.name) : []
    );
  }, [isModalOpen, jobOpeningId, benefits, openings, positions]);

  const toggleBenefit = (name: string) =>
    setSelectedBenefits(list => (list.includes(name) ? list.filter(n => n !== name) : [...list, name]));

  const loadData = async () => {
    try {
      setLoading(true);
      const [offData, candData, opData] = await Promise.all([
        TenantApi.getOffers(),
        TenantApi.getCandidates(),
        TenantApi.getOpenings(),
        loadBenefits(),
        // Cargos só definem o pacote-padrão por nível; sem permissão de ver cargos a proposta segue funcionando.
        TenantApi.getPositions().then(setPositions).catch(() => setPositions([]))
      ]);
      setOffers(offData);
      setCandidates(candData);
      setOpenings(opData);
      if (candData.length > 0) setCandidateId(candData[0].id);
      if (opData.length > 0) setJobOpeningId(opData[0].id);
    } catch (err) {
      console.error('Failed to load offers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await TenantApi.createOffer({
        candidateId,
        jobOpeningId,
        baseSalary: Number(baseSalary),
        benefits: [...selectedBenefits, ...benefitsInput.split(',').map(s => s.trim()).filter(Boolean)],
        startDate,
        contractType: 'CLT'
      });
      setIsModalOpen(false);
      setBenefitsInput('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar proposta');
    }
  };

  const statusLabel = (status: JobOffer['status']) =>
    status === 'accepted' ? 'Aceita pelo Candidato' :
    status === 'sent' ? 'Enviada ao Candidato' :
    status === 'approved' ? 'Aprovada Internamente' :
    status === 'declined' ? 'Recusada' : 'Aprovação Pendente';

  const selectedOffer = offers.find(o => o.id === selectedOfferId);
  const selectedCandidate = candidates.find(c => c.id === selectedOffer?.candidateId);
  const selectedJob = openings.find(j => j.id === selectedOffer?.jobOpeningId);

  const handleUpdateStatus = async (id: string, status: JobOffer['status']) => {
    try {
      await TenantApi.updateOfferStatus(id, status);
      await loadData();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 11</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Gestão de Propostas & Admissão</h1>
          <p className="text-xs text-slate-500">
            Formalização de ofertas salariais, controle de alçadas de aprovação e aceite do candidato.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCatalogOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-2"
          >
            <Gift className="w-4 h-4" />
            Benefícios
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Gerar Proposta
          </button>
        </div>
      </div>

      {isCatalogOpen && (
        <BenefitCatalogModal benefits={benefits} onClose={() => setIsCatalogOpen(false)} onChanged={async () => { await loadBenefits(); }} />
      )}

      {/* Offers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {offers.map((offer) => {
          const cand = candidates.find(c => c.id === offer.candidateId);
          const job = openings.find(j => j.id === offer.jobOpeningId);

          return (
            <div
              key={offer.id}
              onClick={() => setSelectedOfferId(offer.id)}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    offer.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                    offer.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    offer.status === 'approved' ? 'bg-purple-100 text-purple-800' :
                    offer.status === 'declined' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {offer.status === 'accepted' ? 'Aceita pelo Candidato' :
                     offer.status === 'sent' ? 'Enviada ao Candidato' :
                     offer.status === 'approved' ? 'Aprovada Internamente' :
                     offer.status === 'declined' ? 'Recusada' : 'Aprovação Pendente'}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    R$ {offer.baseSalary.toLocaleString('pt-BR')}/mês
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-base">{cand?.name || 'Candidato'}</h3>
                <div className="text-xs text-slate-500 font-medium">{job?.title}</div>

                <div className="pt-2 text-xs space-y-1 text-slate-600">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                    <Calendar className="w-3 h-3 text-indigo-600" /> Início: {formatDateSP(offer.startDate)} ({offer.contractType})
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2">
                    Benefícios: {offer.benefits.join(', ')}
                  </div>
                </div>
                {isEditable(offer) && (
                  <div className="flex">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditOfferId(offer.id); }}
                      className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  </div>
                )}
              </div>

              {/* Status Actions */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs cursor-default"
              >
                {offer.status === 'pending_approval' && (
                  <button
                    onClick={() => handleUpdateStatus(offer.id, 'approved')}
                    className="w-full py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors"
                  >
                    Aprovar Alçada
                  </button>
                )}
                {offer.status === 'approved' && (
                  <button
                    onClick={() => handleUpdateStatus(offer.id, 'sent')}
                    className="w-full py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar Formalmente
                  </button>
                )}
                {offer.status === 'sent' && (
                  <div className="w-full flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateStatus(offer.id, 'accepted')}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                    >
                      Registrar Aceite
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(offer.id, 'declined')}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                    >
                      Recusa
                    </button>
                  </div>
                )}
                {offer.status === 'accepted' && (
                  <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mx-auto">
                    <CheckCircle2 className="w-4 h-4" /> Candidato contratado! Onboarding iniciado
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Offer summary modal */}
      {selectedOffer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setSelectedOfferId(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Resumo da Proposta</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{selectedCandidate?.name || 'Candidato'}</h3>
                <div className="text-xs text-slate-500 font-medium">{selectedJob?.title}</div>
              </div>
              <button
                onClick={() => setSelectedOfferId(null)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                  {statusLabel(selectedOffer.status)}
                </span>
                <span className="font-mono text-base font-bold text-slate-900">
                  R$ {selectedOffer.baseSalary.toLocaleString('pt-BR')}/mês
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Contrato</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedOffer.contractType}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> Início previsto</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{formatDateSP(selectedOffer.startDate)}</div>
                </div>
              </div>

              {selectedCandidate && (
                <div className="space-y-1 text-slate-600">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Candidato</div>
                  {selectedCandidate.currentRole && <div>{selectedCandidate.currentRole}</div>}
                  {selectedCandidate.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" /> {selectedCandidate.email}</div>}
                  {selectedCandidate.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" /> {selectedCandidate.phone}</div>}
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Benefícios ({selectedOffer.benefits.length})</div>
                <ul className="space-y-1 text-slate-700">
                  {selectedOffer.benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-px shrink-0" /> {b}</li>
                  ))}
                </ul>
              </div>

              {(selectedOffer.sentAt || selectedOffer.respondedAt) && (
                <div className="space-y-0.5 text-slate-500">
                  {selectedOffer.sentAt && <div>Enviada em {formatDateSP(selectedOffer.sentAt)}</div>}
                  {selectedOffer.respondedAt && <div>Respondida em {formatDateSP(selectedOffer.respondedAt)}</div>}
                </div>
              )}

              {selectedOffer.notes && (
                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100 text-slate-700">
                  <div className="text-[10px] uppercase font-bold text-amber-700 mb-0.5">Observações</div>
                  {selectedOffer.notes}
                </div>
              )}

              {isEditable(selectedOffer) && (
                <div className="flex justify-end">
                  <button
                    onClick={() => { setEditOfferId(selectedOffer.id); setSelectedOfferId(null); }}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar proposta
                  </button>
                </div>
              )}

              {selectedOffer.status === 'accepted' && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
                  <Rocket className="w-4 h-4 shrink-0 mt-px" />
                  <span>Candidato contratado. A jornada de onboarding foi aberta no Módulo 12.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editOfferId && offers.some(o => o.id === editOfferId) && (
        <OfferEditModal
          offer={offers.find(o => o.id === editOfferId)!}
          candidateName={candidates.find(c => c.id === offers.find(o => o.id === editOfferId)!.candidateId)?.name}
          onSaved={loadData}
          onClose={() => setEditOfferId(null)}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Gerar Nova Proposta Salarial</h3>
            <p className="text-xs text-slate-500 mb-4">A proposta será registrada na sua organização.</p>

            <form onSubmit={handleCreateOffer} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Candidato</label>
                <select
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vaga</label>
                <select
                  value={jobOpeningId}
                  onChange={(e) => setJobOpeningId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {openings.map(j => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Salário Base (R$)</label>
                  <input
                    type="number"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pacote de Benefícios</label>
                {activeBenefits.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {activeBenefits.map(b => (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => toggleBenefit(b.name)}
                        className={`px-2.5 py-1 rounded-full border font-medium transition-colors ${
                          selectedBenefits.includes(b.name)
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 mb-2">
                    Nenhum benefício no catálogo. Cadastre em "Benefícios" ou digite abaixo.
                  </p>
                )}
                <input
                  type="text"
                  value={benefitsInput}
                  onChange={(e) => setBenefitsInput(e.target.value)}
                  placeholder="Outros benefícios (separe por vírgula)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
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
                  Submeter Proposta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
