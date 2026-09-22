import React, { useState } from 'react';
import { X, CheckCircle2, Send, Sparkles, Building2, User, Mail, Phone, MapPin, Linkedin, Briefcase, FileText, Award } from 'lucide-react';
import { JobOpening, PublicTenant } from '../../types.js';
import { PublicApi } from '../../services/api.js';

interface JobApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobOpening | null;
  tenant: PublicTenant | null;
  onSuccess?: () => void;
}

export const JobApplicationModal: React.FC<JobApplicationModalProps> = ({
  isOpen,
  onClose,
  job,
  tenant,
  onSuccess
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  // Nada aqui vem preenchido por conta própria: o que o candidato não informar fica em branco (nunca inventamos dados).
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [education, setEducation] = useState('');
  const [resumeSummary, setResumeSummary] = useState('');
  const [skillsRaw, setSkillsRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);

  if (!isOpen || !job || !tenant) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !job) return;

    try {
      setLoading(true);

      const parsedSkills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);

      // Single public call: creates the profile and the application atomically.
      // Campos em branco seguem em branco: telefone, LinkedIn, habilidades, resumo e anos de experiência nunca são inventados.
      const result = await PublicApi.apply(tenant.slug, {
        jobOpeningId: job.id,
        name,
        email,
        phone,
        location,
        linkedinUrl,
        currentRole,
        yearsOfExperience: yearsOfExperience.trim() === '' ? undefined : Number(yearsOfExperience),
        education,
        resumeSummary,
        skills: parsedSkills,
      });

      setProtocol(result.applicationId);
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Failed to submit application:', err);
      alert('Erro ao enviar candidatura: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setLocation('');
    setLinkedinUrl('');
    setCurrentRole('');
    setResumeSummary('');
    setSkillsRaw('');
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                Inscrição Oficial • {tenant.tradingName || tenant.name}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                Candidatura para: {job.title}
              </h2>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8 overflow-y-auto flex-1">
          {success ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Candidatura Enviada com Sucesso!</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Sua candidatura foi registrada e enviada à equipe de <strong>{tenant.tradingName || tenant.name}</strong>.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left max-w-md mx-auto text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Candidato(a):</span>
                  <span className="font-semibold text-slate-800">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vaga Selecionada:</span>
                  <span className="font-semibold text-indigo-600">{job.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Protocolo:</span>
                  <span className="font-mono text-[11px] text-slate-600">{protocol}</span>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 text-xs text-left max-w-md mx-auto flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Próximos Passos:</strong> Nossa equipe de Atração e Seleção analisará seu perfil com o auxílio da triagem de fit cultural explicável e entrará em contato via e-mail ou WhatsApp para a etapa de entrevistas!
                </div>
              </div>

              <button
                onClick={handleReset}
                className="py-2.5 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Concluir & Voltar para as Vagas
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Vaga Selecionada</div>
                  <div className="font-bold text-slate-800 text-sm">{job.title}</div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-semibold font-mono">
                    {job.workModel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Gabriela Silva"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    E-mail Profissional *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="gabriela.silva@email.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Telefone / WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cidade / UF
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="São Paulo, SP"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Perfil no LinkedIn
                  </label>
                  <div className="relative">
                    <Linkedin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/seu-perfil"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cargo Atual / Última Atuação
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={currentRole}
                      onChange={(e) => setCurrentRole(e.target.value)}
                      placeholder="Ex: Engenheiro de Software Pleno"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Anos de Experiência Relevante
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value)}
                    placeholder="Ex: 5"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Formação Acadêmica
                  </label>
                  <select
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs bg-white"
                  >
                    <option value="">Prefiro não informar</option>
                    <option value="Ensino Superior Completo">Ensino Superior Completo</option>
                    <option value="Ensino Superior Cursando">Ensino Superior Cursando</option>
                    <option value="Pós-Graduação / MBA">Pós-Graduação / MBA</option>
                    <option value="Mestrado / Doutorado">Mestrado / Doutorado</option>
                    <option value="Técnico / Ensino Médio">Técnico / Ensino Médio</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Principais Competências / Tecnologias (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={skillsRaw}
                  onChange={(e) => setSkillsRaw(e.target.value)}
                  placeholder="Ex: React, TypeScript, Node.js, PostgreSQL, Arquitetura de Microsserviços"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mini-Bio / Apresentação Profissional & Fit com a Empresa
                </label>
                <textarea
                  rows={3}
                  value={resumeSummary}
                  onChange={(e) => setResumeSummary(e.target.value)}
                  placeholder="Conte resumidamente sobre sua trajetória profissional, principais conquistas e por que deseja fazer parte do nosso time..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {loading ? 'Processando Inscrição...' : 'Enviar Candidatura'}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
