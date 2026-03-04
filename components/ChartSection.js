'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

export default function ChartSection({ data, name, title, dataKey = "value", color = "#2563eb", height = 400 }) {
    if (!data || data.length === 0) return null;

    // Prepare data for Recharts (reverse to show chronological order)
    const chartData = [...data].reverse().slice(-24); // Last 24 points

    const gradientId = `color${dataKey}`;

    return (
        <div className="glass-card p-6 rounded-2xl w-full" style={{ height: `${height}px` }}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">{title || `${name} - Evolução (24 meses)`}</h3>
                <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Histórico</span>
            </div>

            <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.1} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(str) => {
                            const date = new Date(str + 'T12:00:00Z');
                            return date.toLocaleDateString('pt-BR', { month: 'short' });
                        }}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => `${val.toFixed(2)}%`}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            padding: '12px'
                        }}
                        labelFormatter={(label) => new Date(label + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        formatter={(value) => [`${value.toFixed(2)}%`, title || "Valor"]}
                    />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={3}
                        fillOpacity={1}
                        fill={`url(#${gradientId})`}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
