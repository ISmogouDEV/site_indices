'use client';

import { FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ExportPDFButton({ calculateData }) {
    const exportPDF = () => {
        if (!calculateData) return;

        const doc = jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
        });

        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
        const timeStr = now.toLocaleTimeString('pt-BR');

        // Header styling
        doc.setFontSize(22);
        doc.setTextColor(5, 27, 64); // Dark blue from the app (#051B40)
        doc.setFont('helvetica', 'bold');
        doc.text('PORTAL ECONÔMICO', 20, 25);

        doc.setFontSize(14);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'normal');
        doc.text(`Relatório de Reajuste - ${calculateData.indexName}`, 20, 35);

        doc.setFontSize(10);
        doc.text(`Emitido em: ${now.toLocaleDateString('pt-BR')} às ${timeStr}`, 20, 42);

        // Separator line
        doc.setDrawColor(200);
        doc.line(20, 48, 190, 48);

        // Summary section
        doc.setFontSize(12);
        doc.setTextColor(5, 27, 64);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO DO CÁLCULO', 20, 60);

        const formatCurrency = (val) => {
            return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        };

        const formatPercent = (val) => {
            return val.toFixed(4).replace('.', ',') + '%';
        };

        const summaryData = [
            ['Índice de Correção:', calculateData.indexName],
            ['Período:', `${calculateData.startDate} até ${calculateData.endDate}`],
            ['Valor Original:', formatCurrency(calculateData.initialValue)],
            ['Regra de Reajuste:', calculateData.positiveOnlyActive ? 'Apenas Variações Positivas' : 'Variação Real'],
            ['Total de Meses:', calculateData.totalMonths.toString()],
        ];

        autoTable(doc, {
            startY: 65,
            margin: { left: 20 },
            body: summaryData,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
        });

        // Final result highlight box
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFillColor(248, 250, 252); // Soft slate bg
        doc.rect(20, finalY, 170, 30, 'F');
        doc.setDrawColor(5, 27, 64);
        doc.rect(20, finalY, 170, 30, 'S');

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('VALOR ATUALIZADO FINAL', 105, finalY + 8, { align: 'center' });

        doc.setFontSize(24);
        doc.setTextColor(5, 27, 64);
        doc.text(formatCurrency(calculateData.correctedValue), 105, finalY + 18, { align: 'center' });

        doc.setFontSize(10);
        if (calculateData.totalPercentage >= 0) {
            doc.setTextColor(22, 101, 52); // Green
        } else {
            doc.setTextColor(185, 28, 28); // Red
        }
        doc.text(`Variação Acumulada: ${calculateData.totalPercentage >= 0 ? '+' : ''}${formatPercent(calculateData.totalPercentage)}`, 105, finalY + 26, { align: 'center' });

        // Details table
        doc.setFontSize(12);
        doc.setTextColor(5, 27, 64);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO DE REAJUSTES ANUAIS', 20, finalY + 45);

        const tableRows = calculateData.details.map(d => [
            d.period,
            formatPercent(d.variation),
            (calculateData.positiveOnlyActive && d.isNegative ? '0,0000%' : formatPercent(d.applied)),
            formatCurrency(d.previousBase),
            formatCurrency(d.newBase),
            (calculateData.positiveOnlyActive && d.isNegative ? 'Deflação Congelada' : '-')
        ]);

        autoTable(doc, {
            startY: finalY + 50,
            head: [['Período', 'Var. Real', 'Var. Aplicada', 'Valor Anterior', 'Novo Valor', 'Obs.']],
            body: tableRows,
            margin: { left: 20, right: 20 },
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [5, 27, 64], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            columnStyles: {
                3: { halign: 'right' },
                4: { halign: 'right' },
            }
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount} | Portal Econômico - Este documento é informativo.`, 105, 285, { align: 'center' });
        }

        doc.save(`relatorio-reajuste-${dateStr}.pdf`);
    };

    return (
        <button
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-[#0067B4] hover:bg-[#005a9e] text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
        >
            <FileDown size={14} /> PDF
        </button>
    );
}
