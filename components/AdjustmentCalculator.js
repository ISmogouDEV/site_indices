'use client';

import { useState, useEffect } from 'react';
import { Calculator, Calendar, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdjustmentCalculator({ allData }) {
  const [indexName, setIndexName] = useState('IGP-M');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [initialValue, setInitialValue] = useState('1000,00');
  const [positiveOnly, setPositiveOnly] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const indices = ['IPCA', 'IGP-M', 'IGP-DI', 'IPC-FIPE'];

  // Get unique months/years from history
  const availableDates = allData?.history?.[indexName]
    ? [...new Set(allData.history[indexName].map(item => {
      const d = new Date(item.date + 'T12:00:00Z');
      return `${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
    }))].reverse()
    : [];

  useEffect(() => {
    if (availableDates.length > 0) {
      if (!startDate) setStartDate(availableDates[Math.min(12, availableDates.length - 1)]);
      if (!endDate) setEndDate(availableDates[0]);
    }
  }, [availableDates]);

  const calculate = () => {
    setError('');
    setResult(null);

    if (!startDate || !endDate) {
      setError('Por favor, selecione as datas inicial e final.');
      return;
    }

    const history = allData?.history?.[indexName];
    if (!history) return;

    // Convert MM/YYYY to sorting format YYYY-MM
    const dateToKey = (dateStr) => {
      const [m, y] = dateStr.split('/');
      return `${y}-${m.padStart(2, '0')}`;
    };

    const startKey = dateToKey(startDate);
    const endKey = dateToKey(endDate);

    if (startKey > endKey) {
      setError('A data inicial deve ser anterior à data final.');
      return;
    }

    // Filter relevant history and sort ASC
    const periodData = history
      .filter(item => {
        const itemDate = item.date.substring(0, 7); // YYYY-MM
        return itemDate >= startKey && itemDate <= endKey;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (periodData.length === 0) {
      setError('Não há dados disponíveis para este período.');
      return;
    }

    const valStr = initialValue.replace('.', '').replace(',', '.');
    const baseValue = parseFloat(valStr);

    if (isNaN(baseValue)) {
      setError('Valor inicial inválido.');
      return;
    }

    let currentFactor = 1;
    let details = [];

    // Always use Annual block logic for grouping: 12-month chunks
    for (let i = 0; i < periodData.length; i += 12) {
      const block = periodData.slice(i, Math.min(i + 12, periodData.length));
      let blockFactor = 1;

      block.forEach(item => {
        blockFactor *= (1 + (item.value / 100));
      });

      const originalBlockFactor = blockFactor;
      let appliedBlockFactor = blockFactor;

      // If positiveOnly is checked and the block is negative, freeze at 1 (0%)
      if (positiveOnly && blockFactor < 1) {
        appliedBlockFactor = 1;
      }

      currentFactor *= appliedBlockFactor;

      const blockStart = new Date(block[0].date + 'T12:00:00Z');
      const blockEnd = new Date(block[block.length - 1].date + 'T12:00:00Z');

      details.push({
        period: `${blockStart.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })} - ${blockEnd.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}`,
        variation: (originalBlockFactor - 1) * 100,
        applied: (appliedBlockFactor - 1) * 100,
        isNegative: originalBlockFactor < 1
      });
    }

    const correctedValue = baseValue * currentFactor;
    const totalPercentage = (currentFactor - 1) * 100;

    setResult({
      correctedValue,
      totalPercentage,
      details,
      isAnnualized: true, // Always show as annualized blocks now
      positiveOnlyActive: positiveOnly,
      totalMonths: periodData.length
    });
  };

  const formatCurrency = (val) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatPercent = (val) => {
    return val.toFixed(4) + '%';
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-[#051B40] p-8 text-white flex items-center gap-4">
          <div className="w-12 h-12 bg-[#0067B4] rounded-2xl flex items-center justify-center shadow-inner">
            <Calculator size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Calculadora de Reajuste</h2>
            <p className="text-blue-200 text-sm font-medium">Correção de valores por índices econômicos</p>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Inputs Column */}
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Índice</label>
                <div className="grid grid-cols-2 gap-2">
                  {indices.map(idx => (
                    <button
                      key={idx}
                      onClick={() => setIndexName(idx)}
                      className={`py-3 px-4 rounded-xl text-sm font-black transition-all border ${indexName === idx ? 'bg-[#0067B4] border-[#0067B4] text-white shadow-md' : 'bg-slate-50 border-slate-100 text-[#051B40] hover:bg-white hover:border-blue-200'}`}
                    >
                      {idx}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Mês Inicial</label>
                  <select
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                  >
                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Mês Final</label>
                  <select
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                  >
                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Valor Nominal (R$)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                  <input
                    type="text"
                    value={initialValue}
                    onChange={(e) => setInitialValue(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 py-3 text-lg font-black text-[#051B40] outline-none focus:border-blue-500 transition-all"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 group cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={positiveOnly}
                      onChange={(e) => setPositiveOnly(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#0067B4] transition-all"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-6"></div>
                  </div>
                  <span className="text-sm font-bold text-slate-600 group-hover:text-[#051B40] transition-colors">Apenas variação positiva (congelar no negativo)</span>
                </label>
              </div>

              <button
                onClick={calculate}
                className="w-full bg-[#E30613] hover:bg-[#c40510] text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                <TrendingUp size={20} />
                Calcular Correção
              </button>
            </div>

            {/* Result Column */}
            <div className="bg-slate-50 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[300px] border border-slate-100 text-center relative overflow-hidden">
              {!result && !error && (
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                    <Calculator size={40} />
                  </div>
                  <p className="text-slate-400 font-bold text-sm">Preencha os dados ao lado<br />para realizar o cálculo</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center text-red-500">
                  <AlertCircle size={48} className="mb-4" />
                  <p className="font-bold">{error}</p>
                </div>
              )}

              {result && (
                <div className="w-full space-y-8 animate-in zoom-in-95 duration-300">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[#0067B4] mb-2">Valor Corrigido</p>
                    <h3 className="text-4xl font-black text-[#051B40] tracking-tight">{formatCurrency(result.correctedValue)}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col justify-center items-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Variação Total</p>
                      <p className="text-lg font-black text-green-600">+{formatPercent(result.totalPercentage)}</p>
                      <div className="mt-1 px-2 py-0.5 bg-slate-100 rounded-md text-[8px] font-bold text-slate-500 uppercase tracking-tighter">
                        {result.isAnnualized ? 'Reajuste Anual' : 'Variação Acumulada'}
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col justify-center items-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Meses no Período</p>
                      <p className="text-lg font-black text-[#051B40]">{result.totalMonths}</p>
                      <div className="mt-1 px-2 py-0.5 bg-slate-100 rounded-md text-[8px] font-bold text-slate-500 uppercase tracking-tighter">
                        Intervalo Real
                      </div>
                    </div>
                  </div>

                  <div className="text-left bg-white rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="bg-slate-100 px-4 py-2 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <span>Resumo de Reajustes Anuais</span>
                      {result.positiveOnlyActive && <span className="text-[#0067B4]">Mínimo 0%</span>}
                    </div>
                    <div className="max-h-40 overflow-y-auto px-4 py-2 text-xs font-medium divide-y divide-slate-50">
                      {result.details.map((d, i) => (
                        <div key={i} className="py-2 flex justify-between items-center text-slate-600">
                          <span className="font-bold">{d.period}</span>
                          <span className={`${result.positiveOnlyActive && d.isNegative ? 'text-blue-500 line-through' : ''}`}>
                            {formatPercent(d.variation)}
                          </span>
                          {result.positiveOnlyActive && d.isNegative && (
                            <span className="text-green-600 font-bold ml-1">→ 0,0000%</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-slate-400 text-xs font-medium max-w-2xl mx-auto leading-relaxed">
        * Os cálculos realizados nesta ferramenta são informativos e baseados em dados históricos.
        Variações extremamente recentes podem estar sujeitas a revisão pelos órgãos competentes.
      </p>
    </div>
  );
}
