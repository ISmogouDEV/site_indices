'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function IndicatorCard({ name, value, date, l12m, unit = '%' }) {
    const isPositive = l12m > 0;

    return (
        <div className="bg-white border-2 border-slate-100 p-6 rounded-2xl flex flex-col justify-between transition-all hover:border-blue-500 hover:shadow-xl duration-300 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#0067B4]"></div>
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-[#051B40] font-black text-lg tracking-tight uppercase">{name}</h3>
                <div className={`p-2 rounded-lg ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </div>
            </div>

            <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase mb-1">Acumulado 12 Meses</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-[#0067B4] leading-none">
                        {l12m ? l12m.toFixed(2) : '0.00'}
                    </span>
                    <span className="text-xl font-bold text-[#0067B4]">{unit}</span>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-50 flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium italic">Variação do mês:</span>
                    <span className="font-bold text-[#051B40] bg-slate-100 px-2 py-0.5 rounded-md">{value?.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-300 uppercase mt-2 font-bold tracking-widest">
                    <span>Atualização</span>
                    <span>
                        {date ? new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '-'}
                    </span>
                </div>
            </div>
        </div>
    );
}
