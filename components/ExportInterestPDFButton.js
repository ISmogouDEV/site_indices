'use client';

import { FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ExportInterestPDFButton({ results, settings }) {
    const exportPDF = () => {
        if (!results) return;

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
        doc.text('Relatório de Juros e Multa', 20, 35);

        doc.setFontSize(10);
        doc.text(`Emitido em: ${now.toLocaleDateString('pt-BR')} às ${timeStr}`, 20, 42);

        // Separator line
        doc.setDrawColor(200);
        doc.line(20, 48, 190, 48);

        // Summary section
        doc.setFontSize(12);
        doc.setTextColor(5, 27, 64);
        doc.setFont('helvetica', 'bold');
        doc.text('CONFIGURAÇÕES DO CÁLCULO', 20, 60);

        const formatCurrency = (val) => {
            return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const [y, m, d] = dateStr.split('-');
            return `${d}/${m}/${y}`;
        };

        const summaryData = [
            ['Índice de Correção:', settings.index],
            ['Data de Pagamento:', formatDate(settings.paymentDate)],
            ['Taxa de Juros:', `${settings.interestRate.toFixed(2).replace('.', ',')}% ao mês`],
            ['Multa:', `${settings.fineRate.toFixed(2).replace('.', ',')}%`],
            ['Apenas Corr. Positiva:', settings.positiveOnly ? 'Sim' : 'Não'],
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
        doc.setFillColor(5, 27, 64); // Dark blue bg
        doc.rect(20, finalY, 170, 30, 'F');

        doc.setFontSize(10);
        doc.setTextColor(200, 220, 255);
        doc.text('TOTAL ATUALIZADO', 105, finalY + 10, { align: 'center' });

        doc.setFontSize(24);
        doc.setTextColor(255, 255, 255);
        doc.text(formatCurrency(results.grandTotal), 105, finalY + 22, { align: 'center' });

        // Details table
        doc.setFontSize(12);
        doc.setTextColor(5, 27, 64);
        doc.setFont('helvetica', 'bold');
        doc.text('MEMÓRIA DE CÁLCULO DETALHADA', 20, finalY + 45);

        const tableRows = results.items.map(item => [
            item.month,
            formatCurrency(item.principal),
            formatCurrency(item.correction),
            formatCurrency(item.corrected),
            formatCurrency(item.interest),
            formatCurrency(item.fine),
            formatCurrency(item.subTotal)
        ]);

        // Totals row
        tableRows.push([
            { content: 'TOTAIS', styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } },
            { content: formatCurrency(results.totalPrincipal), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } },
            { content: formatCurrency(results.totalCorrection), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } },
            { content: formatCurrency(results.totalPrincipal + results.totalCorrection), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } },
            { content: formatCurrency(results.totalInterest), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } },
            { content: formatCurrency(results.totalFine), styles: { fontStyle: 'bold', fillColor: [240, 245, 255] } },
            { content: formatCurrency(results.grandTotal), styles: { fontStyle: 'bold', fillColor: [5, 27, 64], textColor: 255 } }
        ]);

        autoTable(doc, {
            startY: finalY + 50,
            head: [['Mês Ref.', 'Principal', 'Correção', 'Corrigido', 'Juros', 'Multa', 'Subtotal']],
            body: tableRows,
            margin: { left: 15, right: 15 },
            styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
            headStyles: { fillColor: [5, 27, 64], textColor: 255, fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { halign: 'center', fontStyle: 'bold' }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount} | Portal Econômico`, 105, 282, { align: 'center' });

            doc.setFontSize(7);
            doc.setTextColor(180);
            const disclaimer = "Isenção de Responsabilidade: Este cálculo é uma simulação informativa. Recomendamos a conferência dos valores por um contador ou calculista antes de utilizá-los em processos judiciais ou decisões financeiras. O Portal Econômico não se responsabiliza pelo uso indevido destas informações.";
            const splitDisclaimer = doc.splitTextToSize(disclaimer, 170);
            doc.text(splitDisclaimer, 105, 287, { align: 'center' });
        }

        doc.save(`calculo-juros-multa-${dateStr}.pdf`);
    };

    return (
        <button
            onClick={exportPDF}
            className="bg-[#0067B4] hover:bg-[#005a9e] text-white px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95"
        >
            <FileDown size={16} /> EXPORTAR PDF
        </button>
    );
}
