import { NextResponse } from 'next/server';

// RISCO-03: Rate Limiting Simples para API
// Armazenamento em memória (limite por instância do Edge)
const rateLimitMap = new Map();

export function middleware(request) {
    const ip = request.ip || '127.0.0.1';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minuto
    const maxRequests = 30; // 30 requisições por minuto

    const userRequests = rateLimitMap.get(ip) || [];
    const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs);

    if (recentRequests.length >= maxRequests) {
        console.warn(`[RATE LIMIT] IP bloqueado temporariamente: ${ip}`);
        return NextResponse.json(
            { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
            { status: 429, headers: { 'Retry-After': '60' } }
        );
    }

    recentRequests.push(now);
    rateLimitMap.set(ip, recentRequests);
    
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', (maxRequests - recentRequests.length).toString());
    
    // Limpeza periódica do Map para não estourar memória do Edge
    if (rateLimitMap.size > 1000) rateLimitMap.clear();

    return response;
}

export const config = {
    matcher: '/api/:path*',
};
