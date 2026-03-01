'use client';

import { useEffect, useState } from 'react';
import IndicatorCard from '@/components/IndicatorCard';
import ChartSection from '@/components/ChartSection';
import HistoryTable from '@/components/HistoryTable';
import AdjustmentCalculator from '@/components/AdjustmentCalculator';
import { RefreshCw, BarChart4, Table as TableIcon, Calculator } from 'lucide-react';

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedIndex, setSelectedIndex] = useState('IPCA');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/indicators');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-retry if database is empty/syncing
  useEffect(() => {
    if (data?.message) {
      const timer = setTimeout(() => {
        fetchData();
      }, 5000); // Retry in 5 seconds
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#fdfdfd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-blue-600" size={40} />
          <p className="text-slate-500 font-medium">Carregando indicadores...</p>
        </div>
      </div>
    );
  }

  // Special loading state for first-time sync
  if (data?.message && !data.latest) {
    return (
      <div className="min-h-screen bg-[#fdfdfd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 max-w-md text-center p-8 bg-white rounded-3xl shadow-xl border border-blue-50">
          <div className="relative">
            <RefreshCw className="animate-spin text-blue-600" size={48} />
          </div>
          <h2 className="text-2xl font-black text-[#051B40]">Preparando Banco de Dados</h2>
          <p className="text-slate-500 font-medium">
            Seu banco de dados no Vercel está sendo populado com o histórico do Banco Central.
            Isso pode levar até 30 segundos na primeira carga.
          </p>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="bg-blue-600 h-full animate-pulse w-3/4"></div>
          </div>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Atualizando em instantes...</p>
        </div>
      </div>
    );
  }

  const indices = ['IPCA', 'IGP-M', 'IGP-DI', 'IPC-FIPE'];

  return (
    <main className="min-h-screen bg-[#fdfdfd] pb-20">
      {/* Header */}
      <div className="bg-[#051B40] border-b border-[#0067B4] px-6 py-8 md:px-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#0067B4] opacity-10 rounded-full -mr-32 -mt-32"></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-[#E30613] rounded-md flex items-center justify-center font-black text-white text-xl">PM</div>
              <h1 className="text-4xl font-black text-white tracking-tighter">Portal Econômico</h1>
            </div>
            <p className="text-blue-200 font-medium">Indicadores Monitorados - Atualização Automática</p>
          </div>
          <div className="text-blue-300 text-xs font-bold uppercase tracking-widest bg-blue-900/40 px-4 py-2 rounded-full border border-blue-700/50">
            Sincronizado com Banco Central
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-10">
        {/* Quick Summary Cards - Side by Side (4 cols) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {indices.map(name => (
            <div
              key={name}
              onClick={() => {
                setSelectedIndex(name);
                if (activeTab === 'calc') setActiveTab('summary');
              }}
              className={`cursor-pointer transition-all ${selectedIndex === name && activeTab !== 'calc' ? 'ring-4 ring-[#0067B4] ring-offset-4 rounded-2xl' : ''}`}
            >
              <IndicatorCard
                name={name}
                value={data?.latest?.[name]?.value}
                l12m={data?.latest?.[name]?.l12m}
                date={data?.latest?.[name]?.date}
              />
            </div>
          ))}
        </div>

        {/* Dynamic Detail Section */}
        <div className="mt-12">
          <div className="flex flex-wrap items-center gap-4 mb-8 bg-white p-1 rounded-full w-fit border border-slate-200 shadow-sm">
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex items-center gap-2 px-6 md:px-8 py-3 rounded-full transition-all font-black uppercase text-[10px] md:text-xs tracking-widest ${activeTab === 'summary' ? 'bg-[#0067B4] text-white shadow-lg' : 'text-[#051B40] hover:bg-slate-50'}`}
            >
              <BarChart4 size={18} /> Gráfico Trend
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-2 px-6 md:px-8 py-3 rounded-full transition-all font-black uppercase text-[10px] md:text-xs tracking-widest ${activeTab === 'table' ? 'bg-[#0067B4] text-white shadow-lg' : 'text-[#051B40] hover:bg-slate-50'}`}
            >
              <TableIcon size={18} /> Planilha Histórica
            </button>
            <button
              onClick={() => setActiveTab('calc')}
              className={`flex items-center gap-2 px-6 md:px-8 py-3 rounded-full transition-all font-black uppercase text-[10px] md:text-xs tracking-widest ${activeTab === 'calc' ? 'bg-[#E30613] text-white shadow-lg' : 'text-[#051B40] hover:bg-slate-50'}`}
            >
              <Calculator size={18} /> Calculadora de Reajuste
            </button>
          </div>

          {activeTab === 'summary' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <ChartSection
                  data={data?.history[selectedIndex]}
                  name={selectedIndex}
                  title="Variação Mensal (%) - 24 meses"
                  dataKey="value"
                  color="#2563eb"
                />
                <ChartSection
                  data={data?.history[selectedIndex]}
                  name={selectedIndex}
                  title="Acumulado 12 Meses (%)"
                  dataKey="l12m"
                  color="#E30613"
                />
              </div>
            </div>
          )}

          {activeTab === 'table' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <HistoryTable
                data={data?.history[selectedIndex]}
                name={selectedIndex}
              />
            </div>
          )}

          {activeTab === 'calc' && (
            <AdjustmentCalculator allData={data} />
          )}
        </div>
      </div>
    </main>
  );
}
