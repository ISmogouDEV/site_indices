'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Plus,
    Trash2,
    Calculator,
    TrendingUp,
    AlertCircle,
    FileText,
    Download,
    History
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function InterestFineCalculator({ allData }) {
    const [installments, setInstallments] = useState([
        { id: crypto.randomUUID(), month: '', value: '' }
    ]);
    const [genConfig, setGenConfig] = useState({
        start: '',
        end: '',
        value: '',
        show: false
    });
    const [settings, setSettings] = useState({
        index: 'IPCA',
        interestRate: 1.0, // % per month
        fineRate: 2.0,     // % fixed
        paymentDate: new Date().toISOString().split('T')[0], // Calculation date
        positiveOnly: true
    });
    const [results, setResults] = useState(null);
    const [error, setError] = useState('');

    // Extract available dates for dropdowns
    const availableDates = useMemo(() => {
        if (!allData?.history?.[settings.index]) return [];
        return allData.history[settings.index].map(item => {
            const d = new Date(item.date + 'T12:00:00Z');
            return `${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
        });
    }, [allData, settings.index]);

    // Set default payment date to today or latest month
    useEffect(() => {
        if (availableDates.length > 0 && !settings.paymentDate) {
            const [m, y] = availableDates[0].split('/');
            const lastData = `${y}-${m.padStart(2, '0')}-01`;
            setSettings(prev => ({ ...prev, paymentDate: lastData }));
        }
    }, [availableDates, settings.paymentDate]);

    const addInstallment = () => {
        setInstallments([...installments, { id: crypto.randomUUID(), month: '', value: '' }]);
    };

    const removeInstallment = (id) => {
        if (installments.length > 1) {
            setInstallments(installments.filter(item => item.id !== id));
        }
    };

    const updateInstallment = (id, field, value) => {
        setInstallments(installments.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const generatePeriod = () => {
        if (!genConfig.start || !genConfig.end || !genConfig.value) {
            setError('Preencha as datas e o valor para gerar o período.');
            return;
        }

        const [sm, sy] = genConfig.start.split('/').map(Number);
        const [em, ey] = genConfig.end.split('/').map(Number);

        const startTotal = sy * 12 + (sm - 1);
        const endTotal = ey * 12 + (em - 1);

        if (startTotal > endTotal) {
            setError('Mês inicial não pode ser superior ao final.');
            return;
        }

        const newInstallments = [];
        for (let i = startTotal; i <= endTotal; i++) {
            const y = Math.floor(i / 12);
            const m = (i % 12) + 1;
            const monthStr = `${m.toString().padStart(2, '0')}/${y}`;
            newInstallments.push({
                id: crypto.randomUUID(),
                month: monthStr,
                value: genConfig.value
            });
        }

        setInstallments([...installments.filter(i => i.month || i.value), ...newInstallments]);
        setGenConfig({ ...genConfig, show: false });
        setError('');
    };

    const formatCurrency = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const calculate = () => {
        setError('');
        setResults(null);

        if (!settings.paymentDate) {
            setError('Selecione uma data para o pagamento.');
            return;
        }

        const history = allData?.history?.[settings.index];
        if (!history) {
            setError('Dados do índice não encontrados.');
            return;
        }

        const dateToKey = (dateStr) => {
            const [m, y] = dateStr.split('/');
            return `${y}-${m.padStart(2, '0')}`;
        };

        const [py, pm, pd] = settings.paymentDate.split('-').map(Number);
        const finalKey = `${py}-${pm.toString().padStart(2, '0')}`;

        let items = [];
        let totalPrincipal = 0;
        let totalCorrection = 0;
        let totalInterest = 0;
        let totalFine = 0;

        for (const inst of installments) {
            const val = parseFloat(inst.value.toString().replace('.', '').replace(',', '.'));
            if (isNaN(val) || val <= 0) continue;
            if (!inst.month) continue;

            const instKey = dateToKey(inst.month);
            if (instKey > finalKey) continue; // Future debt? Skip or error?

            // 1. Fine (Multa) - Applied to Principal first in rent scenarios
            const fineAmt = val * (settings.fineRate / 100);
            const valueWithFine = val + fineAmt;

            // 2. Monetary Correction
            // Correction factor is based on index variation from due month onwards
            const periodData = history.filter(h => {
                const hKey = h.date.substring(0, 7);
                return hKey >= instKey && hKey < finalKey;
            });

            let correctionFactor = 1;
            periodData.forEach(p => {
                const varM = p.value / 100;
                correctionFactor *= (1 + varM);
            });

            if (settings.positiveOnly && correctionFactor < 1) correctionFactor = 1;

            const finalBase = valueWithFine * correctionFactor;
            const correctionAmt = finalBase - valueWithFine;

            // 3. Interest (Juros Compostos pro-rata die)
            // Months + Days
            const [sm, sy] = inst.month.split('/').map(Number);

            // Full months from due date to same day in payment month
            // But usually it's full months counts + days in the current month
            const fullMonths = (py - sy) * 12 + (pm - sm);

            // Pro-rata die: days in the remaining month
            // If payment day is > 1 (due date), and it's the payment month
            const daysInMonth = new Date(py, pm, 0).getDate();
            const daysFraction = (pd - 1) / daysInMonth;

            // Compound Interest Formula: Base * (1 + rate)^months * (1 + rate * days/daysInMonth)
            const rate = settings.interestRate / 100;
            const interestFactor = Math.pow(1 + rate, Math.max(0, fullMonths)) * (1 + rate * Math.max(0, daysFraction));

            const totalWithInterest = finalBase * interestFactor;
            const interestAmt = totalWithInterest - finalBase;

            const subTotal = totalWithInterest;

            items.push({
                ...inst,
                principal: val,
                fine: fineAmt,
                correction: correctionAmt,
                corrected: finalBase,
                interest: interestAmt,
                subTotal: subTotal,
                months: fullMonths,
                days: pd - 1
            });

            totalPrincipal += val;
            totalFine += fineAmt;
            totalCorrection += correctionAmt;
            totalInterest += interestAmt;
        }

        if (items.length === 0) {
            setError('Preencha ao menos uma prestação com valor e data válidos.');
            return;
        }

        setResults({
            items,
            totalPrincipal,
            totalCorrection,
            totalInterest,
            totalFine,
            grandTotal: totalPrincipal + totalCorrection + totalInterest + totalFine
        });
    };

    const exportToExcel = () => {
        if (!results) return;

        const data = results.items.map(item => ({
            'Vencimento': item.month,
            'Valor Original': item.principal,
            'Correção': item.correction,
            'Valor Corrigido': item.corrected,
            'Juros': item.interest,
            'Multa': item.fine,
            'Total': item.subTotal
        }));

        data.push({
            'Vencimento': 'TOTAIS',
            'Valor Original': results.totalPrincipal,
            'Correção': results.totalCorrection,
            'Valor Corrigido': results.totalPrincipal + results.totalCorrection,
            'Juros': results.totalInterest,
            'Multa': results.totalFine,
            'Total': results.grandTotal
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Memória de Cálculo");
        XLSX.writeFile(wb, `Calculo_Juros_Multa_${settings.index}.xlsx`);
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Inputs Column */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                        <div className="bg-[#051B40] p-6 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Calculator size={24} className="text-[#0067B4]" />
                                <h2 className="text-xl font-black uppercase tracking-tight">Prestações em Aberto</h2>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setGenConfig({ ...genConfig, show: !genConfig.show })}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95"
                                >
                                    <TrendingUp size={16} /> GERAR PERÍODO
                                </button>
                                <button
                                    onClick={addInstallment}
                                    className="bg-[#0067B4] hover:bg-[#005a9e] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95"
                                >
                                    <Plus size={16} /> ADICIONAR LINHA
                                </button>
                            </div>
                        </div>

                        {genConfig.show && (
                            <div className="bg-slate-50 p-6 border-b border-slate-100 animate-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest pl-1">Início (MM/AAAA)</label>
                                        <input
                                            list="dates-list"
                                            value={genConfig.start}
                                            onChange={(e) => setGenConfig({ ...genConfig, start: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-emerald-500"
                                            placeholder="01/2024"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest pl-1">Fim (MM/AAAA)</label>
                                        <input
                                            list="dates-list"
                                            value={genConfig.end}
                                            onChange={(e) => setGenConfig({ ...genConfig, end: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-emerald-500"
                                            placeholder="12/2024"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest pl-1">Valor Mensal (R$)</label>
                                        <input
                                            value={genConfig.value}
                                            onChange={(e) => setGenConfig({ ...genConfig, value: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-emerald-500"
                                            placeholder="1000,00"
                                        />
                                    </div>
                                    <button
                                        onClick={generatePeriod}
                                        className="bg-[#051B40] text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-slate-800 transition-all"
                                    >
                                        INSERIR TODAS
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="p-6">
                            <div className="max-h-[500px] overflow-y-auto pr-2 space-y-4">
                                {installments.map((inst, index) => (
                                    <div key={inst.id} className="flex flex-col md:flex-row gap-4 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100 group transition-all hover:border-blue-200">
                                        <div className="flex-1 w-full">
                                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest pl-1">Vencimento (MM/AAAA)</label>
                                            <input
                                                list="dates-list"
                                                value={inst.month}
                                                onChange={(e) => updateInstallment(inst.id, 'month', e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-[#0067B4] transition-all"
                                                placeholder="01/2024"
                                            />
                                        </div>
                                        <div className="flex-1 w-full">
                                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest pl-1">Valor Original (R$)</label>
                                            <input
                                                type="text"
                                                value={inst.value}
                                                onChange={(e) => updateInstallment(inst.id, 'value', e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-[#0067B4] transition-all"
                                                placeholder="0,00"
                                            />
                                        </div>
                                        <button
                                            onClick={() => removeInstallment(inst.id)}
                                            className="bg-rose-50 text-rose-500 p-3 rounded-xl hover:bg-rose-100 transition-all active:scale-90"
                                            title="Remover linha"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-50 pt-4">
                                <span>{installments.length} Prestações inseridas</span>
                                <button
                                    onClick={() => setInstallments([{ id: crypto.randomUUID(), month: '', value: '' }])}
                                    className="text-rose-500 hover:underline"
                                >
                                    Limpar Tudo
                                </button>
                            </div>

                            {error && (
                                <div className="mt-6 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
                                    <AlertCircle size={20} />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={calculate}
                                className="mt-8 w-full bg-[#E30613] hover:bg-[#c40510] text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-3 active:scale-95"
                            >
                                <Calculator size={22} /> CALCULAR DÍVIDA TOTAL
                            </button>
                        </div>
                    </div>
                </div>

                {/* Settings Column */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <History size={16} /> Configurações de Cálculo
                        </h3>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-400 mb-2 tracking-widest">Índice de Correção</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['IPCA', 'IGP-M', 'IGP-DI', 'IPC-FIPE'].map(idx => (
                                        <button
                                            key={idx}
                                            onClick={() => setSettings({ ...settings, index: idx })}
                                            className={`py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${settings.index === idx ? 'bg-[#051B40] border-[#051B40] text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-white'}`}
                                        >
                                            {idx}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-400 mb-2 tracking-widest">Data Real do Pagamento</label>
                                <input
                                    type="date"
                                    value={settings.paymentDate}
                                    onChange={(e) => setSettings({ ...settings, paymentDate: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-[#0067B4] transition-all"
                                />
                                <span className="text-[10px] text-slate-400 italic mt-1 block">A correção e os juros serão calculados até este dia.</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2 tracking-widest">Juros (%/mês)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={settings.interestRate}
                                        onChange={(e) => setSettings({ ...settings, interestRate: parseFloat(e.target.value) })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-[#0067B4] transition-all"
                                    />
                                    <span className="text-[9px] text-slate-400 italic">Juros compostos e pro-rata</span>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2 tracking-widest">Multa (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={settings.fineRate}
                                        onChange={(e) => setSettings({ ...settings, fineRate: parseFloat(e.target.value) })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-[#051B40] outline-none focus:border-[#0067B4] transition-all"
                                    />
                                    <span className="text-[9px] text-slate-400 italic">Sobre o principal</span>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="flex items-center gap-3 group cursor-pointer">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={settings.positiveOnly}
                                            onChange={(e) => setSettings({ ...settings, positiveOnly: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-12 h-6 bg-slate-100 rounded-full peer peer-checked:bg-emerald-500 transition-all border border-slate-200"></div>
                                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-6 shadow-sm"></div>
                                    </div>
                                    <span className="text-sm font-bold text-slate-500 group-hover:text-[#051B40] transition-colors">Apenas correção positiva</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Section */}
            {results && (
                <div className="animate-in zoom-in-95 duration-500 space-y-6 pb-12">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Soma Principal</p>
                            <p className="text-2xl font-black text-[#051B40]">{formatCurrency(results.totalPrincipal)}</p>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Total Juros + Multa</p>
                            <p className="text-2xl font-black text-rose-500">{formatCurrency(results.totalInterest + results.totalFine)}</p>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl border-l-4 border-l-[#0067B4]">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Total Correção</p>
                            <p className="text-2xl font-black text-[#0067B4]">{formatCurrency(results.totalCorrection)}</p>
                        </div>
                        <div className="bg-[#051B40] p-6 rounded-3xl shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12"></div>
                            <p className="text-[10px] font-black uppercase text-blue-300 mb-2 tracking-widest">Total Atualizado</p>
                            <p className="text-3xl font-black text-white">{formatCurrency(results.grandTotal)}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-[#051B40] font-black uppercase tracking-tight antialiased">
                                <FileText size={20} className="text-[#0067B4]" />
                                Memória de Cálculo Detalhada
                            </div>
                            <button
                                onClick={exportToExcel}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 active:scale-95"
                            >
                                <Download size={16} /> EXPORTAR EXCEL
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/50">
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Mês Ref.</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Principal</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Correção</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Corrigido</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Juros</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Multa</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {results.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-4 text-sm font-bold text-[#051B40] uppercase tracking-tighter">{item.month}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-slate-600">{formatCurrency(item.principal)}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-blue-600">+{formatCurrency(item.correction)}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-900">{formatCurrency(item.corrected)}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-rose-500">
                                                <div className="flex flex-col">
                                                    <span>{formatCurrency(item.interest)}</span>
                                                    <span className="text-[10px] opacity-60 italic">{item.months}m e {item.days}d</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-rose-600">{formatCurrency(item.fine)}</td>
                                            <td className="px-6 py-4 text-sm font-black text-[#051B40] text-right">{formatCurrency(item.subTotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-[#051B40] text-white">
                                        <td className="px-6 py-6 text-sm font-black uppercase tracking-widest">TOTAIS</td>
                                        <td className="px-6 py-6 text-sm font-bold">{formatCurrency(results.totalPrincipal)}</td>
                                        <td className="px-6 py-6 text-sm font-bold">{formatCurrency(results.totalCorrection)}</td>
                                        <td className="px-6 py-6 text-sm font-black text-blue-300">{formatCurrency(results.totalPrincipal + results.totalCorrection)}</td>
                                        <td className="px-6 py-6 text-sm font-bold">{formatCurrency(results.totalInterest)}</td>
                                        <td className="px-6 py-6 text-sm font-bold">{formatCurrency(results.totalFine)}</td>
                                        <td className="px-6 py-6 text-xl font-black text-right">{formatCurrency(results.grandTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <datalist id="dates-list">
                {availableDates.map(d => (
                    <option key={d} value={d} />
                ))}
            </datalist>
        </div>
    );
}
