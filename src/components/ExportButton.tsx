import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown, Check } from 'lucide-react';

interface ExportButtonProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  label?: string;
  itemCount?: number;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  onExportCSV,
  onExportPDF,
  label = 'Exportar Dados',
  itemCount
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [lastExported, setLastExported] = useState<'csv' | 'pdf' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCSV = () => {
    onExportCSV();
    setLastExported('csv');
    setIsOpen(false);
    setTimeout(() => setLastExported(null), 3000);
  };

  const handlePDF = () => {
    onExportPDF();
    setLastExported('pdf');
    setIsOpen(false);
    setTimeout(() => setLastExported(null), 3000);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 shadow-xs transition-all flex items-center gap-2 hover:border-slate-300"
        title="Extrair dados em formato estruturado (PDF ou CSV)"
      >
        <Download className="w-3.5 h-3.5 text-indigo-600" />
        <span>{label}</span>
        {itemCount !== undefined && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
            {itemCount}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            Opções de Exportação
          </div>

          <button
            onClick={handlePDF}
            className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-900 transition-colors text-xs font-medium group"
          >
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-100 transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900 flex items-center justify-between">
                <span>Relatório PDF Executivo</span>
                {lastExported === 'pdf' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                Layout formatado para diretoria & RH
              </div>
            </div>
          </button>

          <button
            onClick={handleCSV}
            className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-900 transition-colors text-xs font-medium group"
          >
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900 flex items-center justify-between">
                <span>Planilha CSV (Excel)</span>
                {lastExported === 'csv' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                Compatível com Excel (delimitador ;)
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
