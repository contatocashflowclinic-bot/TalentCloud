import React, { useState, useEffect } from 'react';
import { Dna, Plus, Trash2, Save, Sparkles, CheckCircle2, Sliders, Shield } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { OrganizationalDNA, CulturePillar } from '../../types.js';

export const ModuleDNA: React.FC = () => {
  const { activeTenant } = useTenant();
  const [dna, setDna] = useState<OrganizationalDNA | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states
  const [archetype, setArchetype] = useState<OrganizationalDNA['archetype']>('Inovador & Ágil');
  const [cultureSummary, setCultureSummary] = useState('');
  const [mission, setMission] = useState('');
  const [vision, setVision] = useState('');
  const [fitThreshold, setFitThreshold] = useState(75);
  const [valuesInput, setValuesInput] = useState('');
  const [pillars, setPillars] = useState<CulturePillar[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await TenantApi.getDNA();
        setDna(data);
        if (data.archetype) setArchetype(data.archetype);
        setCultureSummary(data.cultureSummary || '');
        setMission(data.mission || '');
        setVision(data.vision || '');
        setFitThreshold(data.culturalFitThreshold || 75);
        setValuesInput((data.coreValues || []).join(', '));
        setPillars(data.pillars || []);
      } catch (err) {
        console.error('Failed to load DNA:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeTenant?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await TenantApi.updateDNA({
        archetype: archetype as OrganizationalDNA['archetype'],
        cultureSummary,
        mission,
        vision,
        culturalFitThreshold: fitThreshold,
        coreValues: valuesInput.split(/[,\n]/).map(s => s.trim()).filter(Boolean),
        pillars
      });
      setDna(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Erro ao salvar DNA: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addPillar = () => {
    const newPillar: CulturePillar = {
      id: `pil-${Date.now().toString().slice(-4)}`,
      name: 'Novo Pilar Cultural',
      weight: 4,
      description: 'Descrição do comportamento valorizado na organização.',
      expectedBehaviors: ['Colaboração proativa', 'Comunicação aberta'],
      undesiredBehaviors: ['Trabalho em silos', 'Omissão de problemas']
    };
    setPillars([...pillars, newPillar]);
  };

  const removePillar = (id: string) => {
    setPillars(pillars.filter(p => p.id !== id));
  };

  const updatePillar = (id: string, field: keyof CulturePillar, value: any) => {
    setPillars(pillars.map(p => (p.id === id ? { ...p, [field]: value } : p)));
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-xs">Carregando o DNA Organizacional...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">DNA Organizacional & Cultura</h1>
          <p className="text-xs text-slate-500">
            Define a matriz cultural e os pilares ponderados que calibram as análises da IA e o fit dos candidatos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Salvo no banco!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Gravando...' : 'Salvar DNA'}
          </button>
        </div>
      </div>

      {/* Main Culture Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Cultural Foundation */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Dna className="w-4 h-4 text-indigo-600" />
              Fundamentos da Cultura
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Arquétipo Cultural</label>
                <select
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value as OrganizationalDNA['archetype'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="Inovador & Ágil">Inovador & Ágil (Agilidade, autonomia e experimentação)</option>
                  <option value="Orientado a Resultados">Orientado a Resultados (Metas agressivas e foco no cliente)</option>
                  <option value="Colaborativo & Humanizado">Colaborativo & Humanizado (Pessoas, escuta e mentoria)</option>
                  <option value="Precisão & Segurança">Precisão & Segurança (Processos, qualidade e conformidade)</option>
                  <option value="Customer Centric">Customer Centric (Obsessão pela jornada do cliente)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nota Mínima de Fit Cultural Esperada ({fitThreshold}%)
                </label>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={fitThreshold}
                    onChange={(e) => setFitThreshold(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <span className="font-bold text-indigo-600 font-mono text-sm w-12 text-right">
                    {fitThreshold}%
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <label className="block font-semibold text-slate-700">Resumo da Cultura & Identidade</label>
              <textarea
                rows={3}
                value={cultureSummary}
                onChange={(e) => setCultureSummary(e.target.value)}
                placeholder="Descreva a atmosfera de trabalho, como tomam decisões e o que valorizam..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="text-xs space-y-1">
              <label className="block font-semibold text-slate-700">Valores Centrais (separados por vírgula)</label>
              <textarea
                rows={3}
                value={valuesInput}
                onChange={(e) => setValuesInput(e.target.value)}
                placeholder="Ex: Transparência Radical, Foco no Cliente, Excelência Técnica"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Missão</label>
                <textarea
                  rows={3}
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Visão</label>
                <textarea
                  rows={3}
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Cultural Pillars */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Pilares Culturais Ponderados ({pillars.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Cada pilar é avaliado individualmente pela IA com score e fundamentação explicada.
                </p>
              </div>
              <button
                type="button"
                onClick={addPillar}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Pilar
              </button>
            </div>

            <div className="space-y-4">
              {pillars.map((pillar) => (
                <div key={pillar.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={pillar.name}
                      onChange={(e) => updatePillar(pillar.id, 'name', e.target.value)}
                      className="font-bold text-slate-900 text-sm bg-white px-2.5 py-1 rounded-lg border border-slate-200 w-full max-w-xs"
                    />

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-medium">Peso (1 a 5):</span>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={pillar.weight}
                          onChange={(e) => updatePillar(pillar.id, 'weight', Number(e.target.value))}
                          className="w-12 px-2 py-1 rounded-lg border border-slate-200 bg-white text-center font-bold"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removePillar(pillar.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Descrição</label>
                    <input
                      type="text"
                      value={pillar.description}
                      onChange={(e) => updatePillar(pillar.id, 'description', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-[11px] font-semibold text-emerald-700 block mb-1">
                        Comportamentos Esperados (Positivos)
                      </span>
                      <input
                        type="text"
                        value={pillar.expectedBehaviors.join(', ')}
                        onChange={(e) => updatePillar(pillar.id, 'expectedBehaviors', e.target.value.split(',').map(s => s.trim()))}
                        className="w-full px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/40 text-xs"
                      />
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-rose-700 block mb-1">
                        Anti-padrões (Comportamentos Indesejados)
                      </span>
                      <input
                        type="text"
                        value={pillar.undesiredBehaviors.join(', ')}
                        onChange={(e) => updatePillar(pillar.id, 'undesiredBehaviors', e.target.value.split(',').map(s => s.trim()))}
                        className="w-full px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/40 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: AI & Culture Preview Card */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-lg space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-sm">Calibração da IA</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              O modelo de IA (Gemini) utiliza estes pilares ponderados e os valores para gerar a nota explicável de <span className="text-amber-300 font-semibold">Fit Cultural</span> de cada candidato, gerando perguntas direcionadas para o entrevistador humano validar as hipóteses.
            </p>
            <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Arquétipo:</span>
                <span className="font-semibold text-white">{archetype}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Nota de Corte:</span>
                <span className="font-mono text-emerald-300 font-bold">{fitThreshold}%</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total de Pilares:</span>
                <span className="font-mono text-white font-bold">{pillars.length} pilares</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-600" />
              Princípio: Decisão Humana
            </h4>
            <p className="text-slate-500 leading-relaxed">
              A IA não toma decisões de contratação ou eliminação por conta própria. O recrutador e gestor humano sempre revisam a nota, analisam os pontos fortes e gaps, e realizam a entrevista confirmatória.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
