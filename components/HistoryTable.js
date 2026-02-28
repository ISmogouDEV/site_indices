'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function HistoryTable({ data, name }) {
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedYear, setSelectedYear] = useState('all');
    const itemsPerPage = 12;

    if (!data) return null;

    // Extract unique years from data
    const years = ['all', ...new Set(data.map(item => new Date(item.date + 'T12:00:00Z').getFullYear()))].sort((a, b) => b - a);

    // Filter data based on selected year
    const filteredData = selectedYear === 'all'
        ? data
        : data.filter(item => new Date(item.date + 'T12:00:00Z').getFullYear().toString() === selectedYear.toString());

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const currentData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const exportToExcel = () => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, name);
        XLSX.writeFile(wb, `${name}_historico.xlsx`);
    };

    const exportToCSV = () => {
        const headers = ['Data', 'Valor'];
        const rows = data.map(item => [item.date, item.value]);
        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${name}_historico.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="glass-card mt-8 p-6 rounded-2xl">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Tabela de Histórico - {name}</h3>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4">
                        <span className="text-xs font-black uppercase text-[#051B40]">Filtrar Ano:</span>
                        <select
                            value={selectedYear}
                            onChange={(e) => {
                                setSelectedYear(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-bold text-[#0067B4] focus:outline-none focus:border-[#0067B4] transition-colors shadow-sm"
                        >
                            {years.map(year => (
                                <option key={year} value={year}>
                                    {year === 'all' ? 'Todos os Anos' : year}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 bg-[#f0f9ff] text-[#0067B4] px-4 py-2 rounded-xl hover:bg-[#e0f2fe] transition-colors text-xs font-black uppercase tracking-wider shadow-sm border border-blue-100"
                    >
                        <Download size={16} /> Excel
                    </button>
                    <button
                        onClick={exportToCSV}
                        className="flex items-center gap-2 bg-slate-50 text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors text-xs font-black uppercase tracking-wider shadow-sm border border-slate-100"
                    >
                        <Download size={16} /> CSV
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[#0067B4] text-white">
                            <th className="p-3 font-bold text-sm border-r border-[#005696] text-center" rowSpan="2">Mês</th>
                            <th className="p-3 font-bold text-sm border-r border-[#005696] text-center" colSpan="3">Índice</th>
                            <th className="p-3 font-bold text-sm text-center" rowSpan="2">
                                Nº índice<br />
                                <span className="text-[10px] font-normal opacity-80">Base 100</span>
                            </th>
                        </tr>
                        <tr className="bg-[#005696] text-white border-t border-[#004a82]">
                            <th className="p-2 font-medium text-xs text-center border-r border-[#004a82]">Do mês</th>
                            <th className="p-2 font-medium text-xs text-center border-r border-[#004a82]">No ano (YTD)</th>
                            <th className="p-2 font-medium text-xs text-center border-r border-[#004a82]">12 meses (L12M)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                        {currentData.map((item, idx) => (
                            <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}>
                                <td className="p-3 text-[#051B40] font-bold border-r border-slate-200">
                                    {new Date(item.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                                </td>
                                <td className="p-3 text-slate-900 text-center border-r border-slate-200 font-medium">
                                    {item.value.toFixed(2)}
                                </td>
                                <td className="p-3 text-slate-900 text-center border-r border-slate-200">
                                    {item.ytd.toFixed(4)}
                                </td>
                                <td className="p-3 text-[#1a4d55] text-center border-r border-slate-200 font-bold">
                                    {item.l12m ? item.l12m.toFixed(4) : '-'}
                                </td>
                                <td className="p-3 text-slate-800 text-right font-mono">
                                    {item.indexNumber.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex justify-between items-center text-sm text-slate-500">
                <span>Página {currentPage} de {totalPages}</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg border border-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                    >
                        Anterior
                    </button>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg border border-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                    >
                        Próxima
                    </button>
                </div>
            </div>
        </div>
    );
}
