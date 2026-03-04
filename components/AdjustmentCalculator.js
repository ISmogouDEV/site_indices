'use client';

import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, AlertCircle, Download, FileText, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';

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
    }))].sort((a, b) => {
      const [ma, ya] = a.split('/');
      const [mb, yb] = b.split('/');
      return new Date(`${yb}-${mb}`) - new Date(`${ya}-${ma}`);
    })
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

    if (!availableDates.includes(startDate)) {
      setError(`O mês inicial ${startDate} não possui dados registrados para o índice ${indexName}.`);
      return;
    }

    if (!availableDates.includes(endDate)) {
      setError(`O mês final ${endDate} não possui dados registrados para o índice ${indexName}.`);
      return;
    }

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
    let currentBase = baseValue;

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
      const newBase = currentBase * appliedBlockFactor;

      const blockStart = new Date(block[0].date + 'T12:00:00Z');
      const blockEnd = new Date(block[block.length - 1].date + 'T12:00:00Z');

      details.push({
        period: `${blockStart.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })} - ${blockEnd.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}`,
        variation: (originalBlockFactor - 1) * 100,
        applied: (appliedBlockFactor - 1) * 100,
        isNegative: originalBlockFactor < 1,
        previousBase: currentBase,
        newBase: newBase
      });

      currentBase = newBase;
    }

    const correctedValue = baseValue * currentFactor;
    const totalPercentage = (currentFactor - 1) * 100;

    setResult({
      correctedValue,
      totalPercentage,
      details,
      isAnnualized: true,
      positiveOnlyActive: positiveOnly,
      totalMonths: periodData.length,
      indexName,
      startDate,
      endDate,
      initialValue: baseValue
    });
  };

  const exportToExcel = (format = 'xlsx') => {
    if (!result) return;

    const data = [
      ['Relatório de Correção Monetária'],
      ['Índice', result.indexName],
      ['Período', `${result.startDate} a ${result.endDate}`],
      ['Valor Original', result.initialValue],
      ['Apenas Variação Positiva', result.positiveOnlyActive ? 'Sim' : 'Não'],
      [],
      ['Período', 'Variação Real (%)', 'Variação Aplicada (%)', 'Valor Anterior', 'Novo Valor', 'Observação']
    ];

    result.details.forEach(d => {
      data.push([
        d.period,
        d.variation.toFixed(4),
        d.applied.toFixed(4),
        d.previousBase.toFixed(2),
        d.newBase.toFixed(2),
        (result.positiveOnlyActive && d.isNegative) ? 'Deflação congelada em 0%' : ''
      ]);
    });

    data.push([]);
    data.push(['RESUMO FINAL']);
    data.push(['Valor Corrigido', result.correctedValue.toFixed(2)]);
    data.push(['Variação Total (%)', result.totalPercentage.toFixed(4)]);
    data.push(['Total de Meses', result.totalMonths]);
    data.push(['Método', 'Reajuste Anual (blocos de 12 meses)']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reajuste');

    if (format === 'csv') {
      XLSX.writeFile(wb, `reajuste_${result.indexName}_${result.startDate.replace('/', '-')}.csv`, { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, `reajuste_${result.indexName}_${result.startDate.replace('/', '-')}.xlsx`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatPercent = (val) => {
    return val.toFixed(4) + '%';
  };

  const PrintReport = () => {
    if (!result) return null;
    return (
      <div className="hidden print:block w-full bg-white text-black printable-content font-sans" style={{ color: 'black', backgroundColor: 'white' }}>
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight">Portal Econômico</h1>
          <p className="text-sm font-bold mt-1">Relatório de Correção Monetária - {result.indexName}</p>
          <p className="text-[10px] mt-1">Data de emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
        </div>

        <div className="border border-slate-300 p-4 mb-6 rounded-lg space-y-2">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Período Selecionado:</span>
            <span className="text-xs font-bold">{result.startDate} até {result.endDate}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Valor Nominal Original:</span>
            <span className="text-xs font-bold">{formatCurrency(result.initialValue)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Índice de Correção:</span>
            <span className="text-xs font-bold">{result.indexName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-500">Regra de Reajuste:</span>
            <span className="text-xs font-bold">
              {result.positiveOnlyActive ? 'Apenas Variações Positivas (Congelar no Negativo)' : 'Variação Real (Positiva e Negativa)'}
            </span>
          </div>
        </div>

        <div className="border-4 border-black p-6 mb-8 text-center">
          <p className="text-xs font-bold uppercase mb-2">Valor Atualizado Final</p>
          <p className="text-4xl font-black mb-2">{formatCurrency(result.correctedValue)}</p>
          <p className="text-sm font-bold text-slate-600">Variação Acumulada no Período: +{formatPercent(result.totalPercentage)}</p>
        </div>

        <div className="mb-4">
          <h3 className="text-xs font-bold uppercase mb-3 underline">Detalhamento dos Reajustes Anuais</h3>
          <table className="w-full text-left border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-50" style={{ backgroundColor: '#f8fafc' }}>
                <th className="border border-slate-300 p-2 text-[10px] uppercase font-bold">Período</th>
                <th className="border border-slate-300 p-2 text-[10px] uppercase font-bold">Var. Real</th>
                <th className="border border-slate-300 p-2 text-[10px] uppercase font-bold">Var. Aplicada</th>
                <th className="border border-slate-300 p-2 text-[10px] uppercase font-bold text-right">Observação</th>
              </tr>
            </thead>
            <tbody>
              {result.details.map((d, i) => (
                <tr key={i}>
                  <td className="border border-slate-300 p-2 text-xs">{d.period}</td>
                  <td className="border border-slate-300 p-2 text-xs">{formatPercent(d.variation)}</td>
                  <td className="border border-slate-300 p-2 text-xs font-bold">
                    {result.positiveOnlyActive && d.isNegative ? '0,0000%' : formatPercent(d.applied)}
                  </td>
                  <td className="border border-slate-300 p-2 text-right text-[10px]">
                    {result.positiveOnlyActive && d.isNegative ? 'Deflação Congelada (0%)' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-[9px] text-slate-400 italic">
          * Este é um documento informativo gerado pelo sistema Portal Econômico.
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-700">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          html, body { height: auto !important; overflow: visible !important; background: white !important; color: black !important; }
          header, nav, footer, #indicator-dashboard-global-header, .print-hidden, button, select, input { display: none !important; }
          .print\\:block { display: block !important; }
          .printable-content { display: block !important; width: 100% !important; margin: 0 !important; padding: 20px !important; }
        }
      `}} />

      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden print-hidden">
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
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400">Índice</label>
                {availableDates.length > 0 && (
                  <span className="text-[10px] font-black uppercase text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">
                    Dados até: {availableDates[0]}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {indices.map(idx => (
                  <button
                    key={idx}
                    onClick={() => { setIndexName(idx); setResult(null); setError(''); }}
                    className={`py-3 px-4 rounded-xl text-sm font-black transition-all border ${indexName === idx ? 'bg-[#0067B4] border-[#0067B4] text-white shadow-md' : 'bg-slate-50 border-slate-100 text-[#051B40] hover:bg-white hover:border-blue-200'}`}
                  >
                    {idx}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Mês/Ano Inicial</label>
                  <input
                    list="dates-start"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-blue-500 transition-all"
                    placeholder="MM/AAAA"
                  />
                  <datalist id="dates-start">{availableDates.map(d => <option key={d} value={d} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Mês/Ano Final</label>
                  <input
                    list="dates-end"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-blue-500 transition-all"
                    placeholder="MM/AAAA"
                  />
                  <datalist id="dates-end">{availableDates.map(d => <option key={d} value={d} />)}</datalist>
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
                    <input type="checkbox" checked={positiveOnly} onChange={(e) => setPositiveOnly(e.target.checked)} className="sr-only peer" />
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
                <TrendingUp size={20} /> Calcular Correção
              </button>
            </div>

            <div className="bg-slate-50 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[300px] border border-slate-100 text-center relative overflow-hidden">
              {!result && !error && (
                <div className="animate-pulse flex flex-col items-center text-slate-300">
                  <Calculator size={48} className="mb-4" />
                  <p className="text-slate-400 font-bold text-sm">Preencha os dados ao lado<br />para realizar o cálculo</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center text-red-500 animate-in fade-in zoom-in-95">
                  <AlertCircle size={48} className="mb-4" />
                  <p className="font-bold">{error}</p>
                </div>
              )}

              {result && (
                <div className="w-full space-y-6 animate-in zoom-in-95 duration-300">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[#0067B4] mb-2">Valor Corrigido</p>
                    <h3 className="text-4xl font-black text-[#051B40] tracking-tight">{formatCurrency(result.correctedValue)}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Variação Total</p>
                      <p className={`text-lg font-black ${result.totalPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>{result.totalPercentage >= 0 ? '+' : ''}{formatPercent(result.totalPercentage)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Meses</p>
                      <p className="text-lg font-black text-[#051B40]">{result.totalMonths}</p>
                    </div>
                  </div>

                  <div className="text-left bg-white rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="bg-slate-100 px-4 py-2 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <span>Resumo de Reajustes Anuais</span>
                      {result.positiveOnlyActive && <span className="text-[#0067B4]">Mínimo 0%</span>}
                    </div>
                    <div className="max-h-60 overflow-y-auto px-4 py-2 text-xs divide-y divide-slate-50">
                      {result.details.map((d, i) => (
                        <div key={i} className="py-3 flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[#051B40]">{d.period}</span>
                            <div className="flex items-center gap-2">
                              <span className={`${result.positiveOnlyActive && d.isNegative ? 'text-blue-500 line-through opacity-50' : 'font-bold text-slate-700'}`}>{formatPercent(d.variation)}</span>
                              {result.positiveOnlyActive && d.isNegative && <span className="text-green-600 font-bold">0,0000%</span>}
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-400 uppercase font-black tracking-tighter">Base</span>
                            <span className="font-mono font-bold text-slate-500">{formatCurrency(d.previousBase)} → {formatCurrency(d.newBase)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    <button onClick={() => exportToExcel('xlsx')} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black transition-all shadow-md"><Download size={14} /> EXCEL</button>
                    <button onClick={() => exportToExcel('csv')} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all shadow-md"><FileText size={14} /> CSV</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden print-printable"><PrintReport /></div>
      <p className="mt-8 text-center text-slate-400 text-xs font-medium max-w-2xl mx-auto leading-relaxed print-hidden">
        * Os cálculos realizados nesta ferramenta são informativos e baseados em dados históricos. Variações extremamente recentes podem estar sujeitas a revisão pelos órgãos competentes.
      </p>
    </div>
  );
}
