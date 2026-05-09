# Portal Econômico - Dashboard de Índices de Inflação

Dashboard moderno e automatizado para monitoramento dos principais índices de inflação brasileiros (IPCA, IGP-M, IGP-DI e IPC-FIPE), com histórico completo desde 1993.

## 🚀 Funcionalidades Principais
- **Sincronização Automática**: Dados atualizados via API do Banco Central (SGS).
- **Modo Economia**: Sincronização inteligente com trava de 4 horas para economia de recursos Neon/Vercel.
- **Segurança**: Proteção contra abusos via Token e Rate Limiting.
- **Multicalculadoras**: Reajuste anual, juros compostos e multa.
- **Exportação**: Geração de relatórios em PDF e Excel.

## 🛠️ Configuração de Ambiente
Crie um arquivo `.env.local` na raiz do projeto com as seguintes chaves:

```env
# Segurança (Crie o seu segredo)
SYNC_TOKEN=seu_token_secreto_aqui
NEXT_PUBLIC_SYNC_TOKEN=seu_token_secreto_aqui

# Banco de Dados (Neon/Postgres)
POSTGRES_URL=postgres://...
```

## 🔒 Segurança & Performance
- **Headers HTTP**: Proteção nativa contra Clickjacking e XSS.
- **Rate Limit**: Limite de requisições por IP para proteção da infraestrutura.
- **Background Sync**: Atualizações não-bloqueantes que garantem carregamento instantâneo.

## 🛠️ Tecnologias

- **Framework**: [Next.js 14+](https://nextjs.org/) (App Router)
- **Banco de Dados**: [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) (Neon)
- **Estilização**: Tailwind CSS / Vanilla CSS
- **Ícones**: Lucide React
- **Gráficos**: Recharts
- **API Fonte**: API de Dados Abertos do Banco Central do Brasil (SGS).

## 📡 Arquitetura de Dados

O projeto utiliza uma estratégia de **Stale-While-Revalidate (SWR)** no backend:
1. O usuário acessa a página.
2. O Next.js entrega os dados cacheados instantaneamente.
3. Simultaneamente, uma função em segundo plano verifica se o Banco Central publicou novos dados.
4. Caso haja novidades, o banco de dados é atualizado via transação em lote (*Bulk Insert*).

## 📦 Configuração e Instalação

### Pré-requisitos
- Node.js 18+
- Conta no Vercel com um banco de dados Postgres criado.

### Variáveis de Ambiente
Crie um arquivo `.env.local` ou configure no Vercel:
```env
POSTGRES_URL=...
POSTGRES_PRISMA_URL=...
POSTGRES_URL_NON_POOLING=...
POSTGRES_USER=...
POSTGRES_HOST=...
POSTGRES_PASSWORD=...
POSTGRES_DATABASE=...
```

### Comandos
```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build de produção
npm run build
```

## 🧹 Manutenção do Banco

Para limpar dados antigos ou reiniciar a carga total:
1. Acesse o SQL Editor no Vercel/Neon.
2. Execute: `TRUNCATE TABLE indicators;`
3. Acesse o site e o sistema repopulará tudo automaticamente desde 1993.

---
Desenvolvido para análise econômica simplificada e de alta performance.
