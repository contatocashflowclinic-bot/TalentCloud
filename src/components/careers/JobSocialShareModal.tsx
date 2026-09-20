import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  Smartphone,
  Layout,
  MessageSquare,
  Linkedin,
  QrCode,
  ExternalLink,
  Sparkles,
  MapPin,
  Building2,
  Briefcase,
  Layers,
  Heart,
  ThumbsUp,
  MessageCircle,
  Repeat2,
  Send
} from 'lucide-react';
import { JobOpening, JobPosition, Department, PublicTenant, OrganizationalDNA } from '../../types.js';

type PublicDna = Pick<OrganizationalDNA, 'archetype' | 'mission' | 'cultureSummary'>;

interface JobSocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobOpening | null;
  position?: JobPosition | null;
  department?: Department | null;
  tenant: PublicTenant | null;
  dna?: PublicDna | null;
}

type TabType = 'instagram' | 'feed' | 'whatsapp' | 'linkedin' | 'link';

export const JobSocialShareModal: React.FC<JobSocialShareModalProps> = ({
  isOpen,
  onClose,
  job,
  position,
  department,
  tenant,
  dna
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('instagram');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [copiedLinkedin, setCopiedLinkedin] = useState(false);
  const [cardTheme, setCardTheme] = useState<'indigo' | 'emerald' | 'dark' | 'violet'>('indigo');
  const [isGeneratingPng, setIsGeneratingPng] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!isOpen || !tenant) return null;

  const jobTitle = job?.title || 'Oportunidades em Aberto';
  const orgName = tenant.tradingName || tenant.name;
  const deptName = department?.name || 'Inovação & Tecnologia';
  const workModel = job?.workModel || 'Híbrido';
  const location = job?.location || 'São Paulo / Remoto';
  const seniority = position?.level || 'Pleno / Sênior';
  const archetype = dna?.archetype || 'Inovador & Ágil';

  // Generate unique URL for this job in this tenant
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://talentcloud.app';
  const publicShareUrl = job 
    ? `${currentOrigin}/?view=careers&tenant=${tenant.slug}&job=${job.id}`
    : `${currentOrigin}/?view=careers&tenant=${tenant.slug}`;

  // WhatsApp formatted message text
  const whatsappMessage = `🚀 *OPORTUNIDADE DE CARREIRA: ${jobTitle.toUpperCase()}*
🏢 *Empresa:* ${orgName}
📍 *Modelo:* ${workModel} (${location})
💼 *Área:* ${deptName} | Nível: ${seniority}

✨ *Cultura & Propósito da Empresa:*
"${dna?.mission || 'Construindo o futuro com tecnologia, transparência e equipes de alto rendimento.'}"

🎯 *Pilares & Diferenciais:*
• Arquétipo Cultural: ${archetype}
• Processo seletivo humanizado, transparente e com feedback
• Banco de talentos isolado e alta valorização do potencial humano

👉 *Candidate-se ou veja mais detalhes aqui:*
${publicShareUrl}

_Compartilhe com quem possa ter o match perfeito com esta oportunidade!_`;

  // LinkedIn formatted post copy
  const linkedinPost = `🔥 Estamos com oportunidade aberta para ${jobTitle} na ${orgName}!

Na ${orgName}, acreditamos no poder das pessoas para transformar o mercado através de ${archetype.toLowerCase()}. Estamos expandindo nosso time e buscamos profissionais que queiram construir impacto real.

📍 Modelo de Trabalho: ${workModel} (${location})
🎯 Departamento: ${deptName}
💼 Nível: ${seniority}

✨ O que nos move:
"${dna?.cultureSummary || 'Ambiente colaborativo, autonomia responsável e foco contínuo no desenvolvimento profissional.'}"

Confira todos os detalhes e candidate-se pelo nosso portal oficial:
🔗 ${publicShareUrl}

#Vagas #Oportunidade #${orgName.replace(/[^a-zA-Z0-9]/g, '')} #Carreiras #Recrutamento #TechJobs #TrabalheConosco`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicShareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleCopyWhatsapp = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2200);
  };

  const handleCopyLinkedin = () => {
    navigator.clipboard.writeText(linkedinPost);
    setCopiedLinkedin(true);
    setTimeout(() => setCopiedLinkedin(false), 2200);
  };

  const handleOpenWhatsapp = () => {
    const encoded = encodeURIComponent(whatsappMessage);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handleOpenLinkedin = () => {
    const encoded = encodeURIComponent(publicShareUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`, '_blank');
  };

  // Helper for downloading high-res image rendered onto HTML5 Canvas
  const handleDownloadImage = (format: 'stories' | 'feed') => {
    setIsGeneratingPng(true);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsGeneratingPng(false);
      return;
    }

    if (format === 'stories') {
      // Instagram Stories: 1080 x 1920
      canvas.width = 1080;
      canvas.height = 1920;

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
      if (cardTheme === 'indigo') {
        grad.addColorStop(0, '#1e1b4b'); // slate-indigo dark
        grad.addColorStop(0.5, '#312e81');
        grad.addColorStop(1, '#0f172a');
      } else if (cardTheme === 'emerald') {
        grad.addColorStop(0, '#064e3b');
        grad.addColorStop(0.5, '#047857');
        grad.addColorStop(1, '#022c22');
      } else if (cardTheme === 'violet') {
        grad.addColorStop(0, '#4c1d95');
        grad.addColorStop(0.5, '#6d28d9');
        grad.addColorStop(1, '#1e1b4b');
      } else {
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e293b');
        grad.addColorStop(1, '#020617');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Ambient decorative tech circles
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(900, 200, 320, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(100, 1600, 400, 0, Math.PI * 2);
      ctx.stroke();

      // Top Tag Badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      drawRoundedRect(ctx, 100, 180, 420, 60, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.letterSpacing = '2px';
      ctx.fillText('ESTAMOS CONTRATANDO', 130, 218);

      // Company Name
      ctx.font = 'bold 54px sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(orgName, 100, 340);

      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(dna?.archetype ? `Cultura: ${dna.archetype}` : 'Time de Alto Impacto', 100, 390);

      // Divider line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(100, 450);
      ctx.lineTo(980, 450);
      ctx.stroke();

      // Main Job Title - Large typography
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 76px sans-serif';
      wrapText(ctx, jobTitle, 100, 580, 880, 90);

      // Info Pills
      let pillY = 860;
      const pills = [
        `📍 ${workModel} (${location})`,
        `🏢 ${deptName}`,
        `🎯 Nível: ${seniority}`
      ];

      pills.forEach((pText) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        drawRoundedRect(ctx, 100, pillY, 880, 80, 20);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(pText, 140, pillY + 52);
        pillY += 105;
      });

      // Culture mission card
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      drawRoundedRect(ctx, 100, 1220, 880, 240, 24);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('NOSSO PROPÓSITO & CULTURA', 140, 1270);

      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'italic 30px sans-serif';
      const quote = `"${dna?.mission || 'Construindo inovação com ética, autonomia e excelência técnica.'}"`;
      wrapText(ctx, quote, 140, 1325, 800, 42);

      // Bottom Call To Action Banner
      ctx.fillStyle = '#4f46e5';
      drawRoundedRect(ctx, 100, 1540, 880, 140, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText('CANDIDATE-SE AGORA', 260, 1625);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '26px sans-serif';
      ctx.fillText('Link de candidatura na bio ou acesse o portal de carreiras', 180, 1740);

      // Footer branding
      ctx.fillStyle = '#64748b';
      ctx.font = '22px sans-serif';
      ctx.fillText('TalentCloud • Portal Oficial de Carreiras', 260, 1840);

    } else {
      // Feed / LinkedIn: 1200 x 630
      canvas.width = 1200;
      canvas.height = 630;

      const grad = ctx.createLinearGradient(0, 0, 1200, 630);
      if (cardTheme === 'indigo') {
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(1, '#0f172a');
      } else if (cardTheme === 'emerald') {
        grad.addColorStop(0, '#064e3b');
        grad.addColorStop(1, '#022c22');
      } else if (cardTheme === 'violet') {
        grad.addColorStop(0, '#4c1d95');
        grad.addColorStop(1, '#1e1b4b');
      } else {
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#1e293b');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 630);

      // Subtle decorative lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(1050, 150, 200, 0, Math.PI * 2);
      ctx.stroke();

      // Top Tag
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      drawRoundedRect(ctx, 70, 60, 280, 44, 22);
      ctx.fillStyle = '#c7d2fe';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('VAGA EM ABERTO', 96, 88);

      // Company
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(orgName, 370, 90);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      wrapText(ctx, jobTitle, 70, 180, 1060, 60);

      // Badges
      let bx = 70;
      const badges = [
        `📍 ${workModel}`,
        `🏢 ${deptName}`,
        `🎯 ${seniority}`
      ];
      badges.forEach(b => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        drawRoundedRect(ctx, bx, 280, 280, 52, 14);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 19px sans-serif';
        ctx.fillText(b, bx + 20, 313);
        bx += 300;
      });

      // Culture quote
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      drawRoundedRect(ctx, 70, 370, 1060, 120, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('NOSSA CULTURA & FIT', 100, 405);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'italic 20px sans-serif';
      const quote = `"${dna?.mission || 'Tecnologia com propósito, autonomia e governança humanizada.'}"`;
      wrapText(ctx, quote, 100, 445, 1000, 26);

      // Bottom bar
      ctx.fillStyle = '#4f46e5';
      drawRoundedRect(ctx, 70, 520, 420, 60, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Candidate-se no Portal Oficial', 100, 558);

      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText('TalentCloud • Carreiras', 820, 558);
    }

    // Trigger download
    setTimeout(() => {
      const link = document.createElement('a');
      const cleanTitle = jobTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const cleanOrg = orgName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.download = `vaga_${cleanOrg}_${cleanTitle}_${format}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setIsGeneratingPng(false);
    }, 150);
  };

  // Canvas utility: rounded rectangle
  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // Canvas utility: wrap text
  function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-4xl border border-slate-200 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:px-8 sm:py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-800">
                  Estúdio de Divulgação Social
                </span>
                <span className="text-slate-400 text-xs">• {orgName}</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
                Compartilhar Cargo nas Redes Sociais
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-4 sm:px-8 gap-2 overflow-x-auto shrink-0 scrollbar-none py-2">
          <button
            onClick={() => setActiveTab('instagram')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'instagram'
                ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Instagram Stories (9:16)
          </button>

          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'feed'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Layout className="w-4 h-4" />
            Card Feed & Banner (1.91:1)
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'whatsapp'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            WhatsApp
          </button>

          <button
            onClick={() => setActiveTab('linkedin')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'linkedin'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Linkedin className="w-4 h-4" />
            LinkedIn
          </button>

          <button
            onClick={() => setActiveTab('link')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'link'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Link & QR Code
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-slate-50/40">
          
          {/* TAB 1: INSTAGRAM STORIES */}
          {activeTab === 'instagram' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* Preview Phone Mockup */}
              <div className="md:col-span-6 flex justify-center">
                <div className="relative w-64 sm:w-72 aspect-[9/16] rounded-3xl p-3 bg-slate-900 shadow-2xl ring-4 ring-slate-800">
                  <div className="w-full h-full rounded-2xl overflow-hidden relative flex flex-col justify-between p-4 text-white select-none transition-all duration-300"
                    style={{
                      background:
                        cardTheme === 'indigo'
                          ? 'linear-gradient(145deg, #1e1b4b 0%, #312e81 60%, #0f172a 100%)'
                          : cardTheme === 'emerald'
                          ? 'linear-gradient(145deg, #064e3b 0%, #047857 60%, #022c22 100%)'
                          : cardTheme === 'violet'
                          ? 'linear-gradient(145deg, #4c1d95 0%, #6d28d9 60%, #1e1b4b 100%)'
                          : 'linear-gradient(145deg, #0f172a 0%, #1e293b 60%, #020617 100%)'
                    }}
                  >
                    {/* Top stories header */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <span className="font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
                          Estamos Contratando
                        </span>
                        <span className="text-white/80 font-mono text-[9px]">{orgName}</span>
                      </div>
                      <h4 className="text-base font-extrabold text-white leading-tight tracking-tight line-clamp-3">
                        {jobTitle}
                      </h4>
                    </div>

                    {/* Middle Highlights */}
                    <div className="space-y-1.5 my-auto">
                      <div className="bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur-xs border border-white/10 text-[11px] flex items-center gap-1.5 font-medium">
                        <MapPin className="w-3 h-3 text-emerald-300 shrink-0" />
                        <span className="truncate">{workModel} ({location})</span>
                      </div>
                      <div className="bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur-xs border border-white/10 text-[11px] flex items-center gap-1.5 font-medium">
                        <Briefcase className="w-3 h-3 text-indigo-300 shrink-0" />
                        <span className="truncate">{deptName} • {seniority}</span>
                      </div>

                      {dna?.archetype && (
                        <div className="bg-white/5 rounded-xl p-2 border border-white/10 text-[10px] space-y-0.5">
                          <span className="text-indigo-200 font-bold block">Cultura & Fit:</span>
                          <span className="text-slate-200 line-clamp-2 italic">
                            "{dna.archetype} — {dna.cultureSummary.slice(0, 70)}..."
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom CTA */}
                    <div className="pt-2 border-t border-white/10 text-center space-y-1">
                      <div className="py-2 px-3 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-lg flex items-center justify-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Candidatar-se na Bio
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {tenant.slug}.talentcloud.app
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls & Download */}
              <div className="md:col-span-6 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Personalizar & Baixar Imagem para o Instagram</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gere uma arte pronta em proporção 9:16 (1080x1920px) para postar nos Stories do Instagram da sua empresa ou dos gestores.
                  </p>
                </div>

                {/* Color Scheme Picker */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Paleta Visual do Card</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'indigo', name: 'Indigo Dark', bg: 'bg-indigo-700' },
                      { id: 'emerald', name: 'Emerald Pro', bg: 'bg-emerald-700' },
                      { id: 'violet', name: 'Violet Neon', bg: 'bg-purple-700' },
                      { id: 'dark', name: 'Onyx Slate', bg: 'bg-slate-800' },
                    ].map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => setCardTheme(theme.id as any)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                          cardTheme === theme.id
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-bold ring-2 ring-indigo-200'
                            : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full ${theme.bg}`}></div>
                        <span className="text-[10px]">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => handleDownloadImage('stories')}
                    disabled={isGeneratingPng}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 hover:opacity-95 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    {isGeneratingPng ? 'Renderizando PNG HD...' : 'Baixar Imagem dos Stories (PNG 1080x1920)'}
                  </button>

                  <button
                    onClick={handleCopyLink}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                    {copiedLink ? 'Link Copiado para o Clipboard!' : 'Copiar Link da Vaga para Inserir na Bio / Sticker'}
                  </button>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
                  💡 <strong>Dica de Recrutamento:</strong> Poste a arte nos Stories do Instagram oficial da empresa e peça para o time ou gestores repostarem com a figurinha de link apontando para a página da vaga.
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: FEED & LINKEDIN BANNER */}
          {activeTab === 'feed' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Card de Feed / OpenGraph Banner (1200x630px)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Formato paisagem perfeito para postagens de feed no LinkedIn, Instagram ou como capa visual de vagas.
                </p>
              </div>

              {/* Feed Card Preview */}
              <div className="w-full aspect-[1.91/1] max-w-2xl mx-auto rounded-2xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between relative overflow-hidden"
                style={{
                  background:
                    cardTheme === 'indigo'
                      ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #0f172a 100%)'
                      : cardTheme === 'emerald'
                      ? 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #022c22 100%)'
                      : cardTheme === 'violet'
                      ? 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 60%, #1e1b4b 100%)'
                      : 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #020617 100%)'
                }}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 border border-white/20">
                      Oportunidade em Aberto
                    </span>
                    <span className="font-semibold text-xs tracking-wide text-slate-300">{orgName}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
                    {jobTitle}
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">📍 {workModel} ({location})</span>
                  <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">🏢 {deptName}</span>
                  <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">🎯 {seniority}</span>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="text-[11px] text-slate-300 italic max-w-sm truncate">
                    "{dna?.cultureSummary || 'Inovação contínua e valorização das pessoas.'}"
                  </div>
                  <div className="px-4 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs">
                    Candidate-se
                  </div>
                </div>
              </div>

              {/* Theme and Download */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Tema:</span>
                  {(['indigo', 'emerald', 'violet', 'dark'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setCardTheme(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                        cardTheme === t
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleDownloadImage('feed')}
                  disabled={isGeneratingPng}
                  className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {isGeneratingPng ? 'Gerando...' : 'Baixar Imagem de Feed (PNG 1200x630)'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: WHATSAPP */}
          {activeTab === 'whatsapp' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* WhatsApp Bubble Preview */}
              <div className="md:col-span-6 space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  Visualização da Mensagem no WhatsApp
                </div>

                {/* WhatsApp Chat Container */}
                <div className="p-4 rounded-2xl bg-[#efeae2] border border-slate-300 shadow-inner min-h-[340px] flex flex-col justify-end">
                  <div className="max-w-[90%] bg-white rounded-2xl rounded-tl-xs p-3.5 shadow-sm text-xs text-slate-800 space-y-2 border border-slate-100">
                    <div className="font-bold text-emerald-800">
                      🚀 OPORTUNIDADE DE CARREIRA: {jobTitle.toUpperCase()}
                    </div>
                    <div className="space-y-0.5 text-[11px] text-slate-700">
                      <div>🏢 <strong>Empresa:</strong> {orgName}</div>
                      <div>📍 <strong>Modelo:</strong> {workModel} ({location})</div>
                      <div>💼 <strong>Área:</strong> {deptName} | {seniority}</div>
                    </div>

                    <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      ✨ <em>"{dna?.mission || 'Construindo o futuro com tecnologia e equipes de alta performance.'}"</em>
                    </div>

                    <div className="pt-1 text-[11px] text-indigo-600 font-semibold underline truncate">
                      👉 {publicShareUrl}
                    </div>

                    <div className="text-[9px] text-slate-400 text-right">
                      Agora • ✓✓
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Actions & Controls */}
              <div className="md:col-span-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Disparo de Vaga via WhatsApp</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Envie a vaga diretamente para contatos, candidatos em prospecção ativa ou grupos de desenvolvedores e profissionais da área.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={handleOpenWhatsapp}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Abrir e Enviar no WhatsApp Web / App
                  </button>

                  <button
                    onClick={handleCopyWhatsapp}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {copiedWhatsapp ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                    {copiedWhatsapp ? 'Texto Formatado Copiado!' : 'Copiar Texto Completo para o Clipboard'}
                  </button>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] leading-relaxed">
                  📲 <strong>Formatação Automática:</strong> A mensagem já vem com asteriscos para negrito (*...*), emojis categorizados e link direto pronto para o WhatsApp reconhecer a prévia do card!
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: LINKEDIN */}
          {activeTab === 'linkedin' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* Mockup LinkedIn Feed Post */}
              <div className="md:col-span-7 space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Linkedin className="w-4 h-4 text-blue-600" />
                  Pré-visualização do Post no LinkedIn
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 text-xs">
                  {/* Author Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                      {orgName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{orgName}</div>
                      <div className="text-[10px] text-slate-400">Talent Acquisition & Pessoas • Agora • 🌐</div>
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="text-slate-800 space-y-1.5 text-xs leading-relaxed">
                    <p>🔥 Estamos com oportunidade aberta para <strong>{jobTitle}</strong> na {orgName}!</p>
                    <p className="text-slate-600 text-[11px]">
                      📍 Modelo: {workModel} ({location}) • Área: {deptName}
                    </p>
                    <p className="text-slate-600 text-[11px]">
                      ✨ <em>"{dna?.cultureSummary || 'Buscamos talentos alinhados com excelência técnica e cultura transparente.'}"</em>
                    </p>
                    <p className="text-blue-600 font-semibold truncate">
                      🔗 {publicShareUrl}
                    </p>
                    <p className="text-blue-500 text-[10px]">
                      #Vagas #TechJobs #Carreiras #{orgName.replace(/[^a-zA-Z0-9]/g, '')}
                    </p>
                  </div>

                  {/* OpenGraph Preview Card */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    <div className="p-3 bg-indigo-900 text-white">
                      <div className="text-[10px] uppercase font-bold text-indigo-300">Carreiras • {orgName}</div>
                      <div className="font-bold text-sm text-white truncate">{jobTitle}</div>
                    </div>
                    <div className="p-2.5 text-[11px] bg-slate-50 text-slate-500 flex justify-between items-center">
                      <span>talentcloud.app</span>
                      <span className="font-semibold text-indigo-600">Candidate-se</span>
                    </div>
                  </div>

                  {/* LinkedIn Reactions bar */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-500 text-[11px]">
                    <span className="flex items-center gap-1 hover:text-blue-600 cursor-pointer">
                      <ThumbsUp className="w-3.5 h-3.5" /> Curtir
                    </span>
                    <span className="flex items-center gap-1 hover:text-blue-600 cursor-pointer">
                      <MessageCircle className="w-3.5 h-3.5" /> Comentar
                    </span>
                    <span className="flex items-center gap-1 hover:text-blue-600 cursor-pointer">
                      <Repeat2 className="w-3.5 h-3.5" /> Compartilhar
                    </span>
                    <span className="flex items-center gap-1 hover:text-blue-600 cursor-pointer">
                      <Send className="w-3.5 h-3.5" /> Enviar
                    </span>
                  </div>
                </div>
              </div>

              {/* LinkedIn Actions */}
              <div className="md:col-span-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Post Profissional para LinkedIn</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compartilhe em 1 clique na timeline do LinkedIn ou copie o texto completo e as hashtags otimizadas.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={handleOpenLinkedin}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-colors"
                  >
                    <Linkedin className="w-4 h-4" />
                    Publicar no LinkedIn
                  </button>

                  <button
                    onClick={handleCopyLinkedin}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {copiedLinkedin ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                    {copiedLinkedin ? 'Post Copiado com Hashtags!' : 'Copiar Texto com Hashtags'}
                  </button>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                  💼 <strong>Engajamento no LinkedIn:</strong> Peça para o Gestor da Vaga e colaboradores do time comentarem no post para aumentar o alcance orgânico da publicação!
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: LINK & QR CODE */}
          {activeTab === 'link' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              
              {/* QR Code Card */}
              <div className="md:col-span-5 flex justify-center">
                <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-lg text-center space-y-3">
                  <div className="w-44 h-44 mx-auto p-2 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center">
                    {/* SVG Vector QR Code Placeholder with High Resolution */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicShareUrl)}`}
                      alt="QR Code de Divulgação"
                      className="w-40 h-40 rounded-lg"
                      onError={(e) => {
                        // Fallback SVG if offline
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="text-xs font-bold text-slate-900">QR Code Oficial da Vaga</div>
                  <div className="text-[11px] text-slate-500 leading-tight">
                    Aponte a câmera do celular para abrir diretamente a página de inscrição.
                  </div>
                </div>
              </div>

              {/* Link Box & Instructions */}
              <div className="md:col-span-7 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Link Direto de Divulgação</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Este link pode ser enviado por e-mail, Slack, Teams, Telegram ou inserido em anúncios de contratação.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-500">URL Pública da Vaga</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={publicShareUrl}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 select-all"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 transition-colors"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      {copiedLink ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={publicShareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-600" />
                    Abrir Página Pública da Vaga
                  </a>
                </div>

                <div className="p-3 bg-slate-100 rounded-xl text-slate-700 text-[11px] space-y-1">
                  <div className="font-semibold text-slate-900">🔒 Dados protegidos por organização:</div>
                  <div>As candidaturas recebidas por este link ficam disponíveis apenas para a equipe de <strong>{orgName}</strong>.</div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:px-8 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Divulgação otimizada com branding individual de <strong>{orgName}</strong></span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors"
          >
            Fechar Estúdio
          </button>
        </div>

      </div>
    </div>
  );
};
