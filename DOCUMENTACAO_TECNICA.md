# Guia de Arquitetura e Manutenção - Portal Econômico

Este documento serve como um mapa técnico para entender como os dados fluem desde o Banco Central até a tela do usuário.

## 🏗️ 1. Camada de Dados (Database)
**Arquivo:** `lib/db.js`

Este é o arquivo mais crítico para a portabilidade do projeto. Ele contém um "adapter" que decide qual banco usar:
- **Produção (Vercel)**: Usa `@vercel/postgres` (PostgreSQL).
- **Local (Desenvolvimento)**: Usa `sqlite3` (arquivo `data/database.sqlite`).
- **Função Principal**: `sql` e `getClient`. Elas traduzem pequenas diferenças de sintaxe entre os dois bancos para que o resto do código funcione em qualquer lugar.

---

## 🔄 2. Sincronização (Back-end)
**Arquivo:** `lib/sync-utils.js`

Responsável por manter os dados atualizados sem intervenção humana.
- **`checkAndSync()`**: Verifica se o mês atual já existe no banco. Se faltar dados (ou se o histórico for muito curto), ele dispara a carga.
- **`performSync()`**: Faz o "fetch" na API do SGS (Banco Central). Ele usa os códigos das séries (IPCA: 433, IGPM: 189, etc.) e faz um **Bulk Insert** (inserção em lote) para ser mais rápido.

---

## 🧠 3. Processamento de Índices (API)
**Arquivo:** `app/api/indicators/route.js`

Este arquivo é o "cérebro" matemático do site. Ele não apenas entrega os dados, ele os transforma:
- **Redução de Dados**: Agrupa os dados do banco por nome do índice.
- **Cálculo de Acumulados**:
    - **YTD (Year to Date)**: Soma multiplicativa das variações desde janeiro do ano corrente.
    - **L12M (Last 12 Months)**: Acumulado dos últimos 12 meses móveis.
    - **Número Índice (Base 100)**: Transforma as variações percentuais em um número absoluto (ex: 100.00 -> 100.50 -> 101.20) para facilitar cálculos de correção monetária.

---

## 🖥️ 4. Interface do Usuário (Front-end)

### Dashboard Principal
**Arquivo:** `app/page.js`
Controla o estado das abas (**Gráfico**, **Tabela** e **Calculadora**) e faz a chamada inicial para a API.

### Calculadora de Reajuste
**Arquivo:** `components/AdjustmentCalculator.js`
Contém a lógica de reajuste anual solicitado:
- **Lógica de Blocos**: Divide o período selecionado em "caixas" de 12 meses.
- **Variação Positiva**: Se a opção estiver marcada, ele verifica se o acumulado do bloco de 12 meses foi negativo (< 1) e, se sim, trava aquele período em 0% (fator 1).

---

## 🐍 5. Ferramenta Auxiliar (Python)
**Arquivo:** `scripts/fetch_data.py`

Um script independente que pode ser usado para popular o banco SQLite local rapidamente sem precisar rodar o servidor Next.js. É útil para depuração e análise de dados fora do navegador.

---

---

## 🔒 6. Segurança e Robustez
**Implementado em: Maio/2026**

### Camada de Autenticação
O endpoint `/api/indicators` possui uma trava de segurança para operações de escrita.
- **Leitura**: Livre.
- **Sincronização (`?sync=true`)**: Exige o parâmetro `&token=${process.env.SYNC_TOKEN}`.

### Rate Limiting
O arquivo `middleware.js` controla o tráfego na API.
- **Limite**: 30 requisições por minuto por IP.
- **Objetivo**: Proteção contra ataques de DoS e controle de custos na Vercel/Neon.

### Sanitização e Validação
- **Logs**: Stack traces são omitidos em `NODE_ENV=production`.
- **Dados Externos**: Datas vindas da API do Banco Central são validadas via Regex (`DD/MM/YYYY`) antes do processamento.

---

## 🛠️ Dicas para Manutenção
...
4. **Variáveis de Ambiente**: Certifique-se de configurar `SYNC_TOKEN` no painel da Vercel para que o botão de sincronizar funcione em produção.

---
*Documentação atualizada - Foco em Segurança e Estabilidade - 2026*
