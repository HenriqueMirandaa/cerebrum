# 🗓️ Fix: Marcação de Eventos no Cronograma

## Problema
O chatbot respondia dizendo que tinha marcado o evento, mas **não salvava nada** no banco de dados.

**Exemplo:**
```
User: "eu tenho exame de matematica B no dia 23 de junho as 9:30 marca isso pra mim"

Bot: "O exame está agora marcado para o dia 23 de junho de 2026, às 09:30..."
     ❌ Mas nada era salvo no banco!
```

## Solução Implementada ✅

### 1. **Nova Função: `createEventFromMessage()`**
**Arquivo:** `backend/services/aiAssistantService.js`

Função inteligente que:
- ✅ Extrai data e hora de mensagens em português
- ✅ Detecta tipos de evento (exame, prova, teste, reunião, etc)
- ✅ Associa à disciplina/matéria automaticamente
- ✅ Define duração apropriada (3h para exames, 1h para outros)
- ✅ **Salva no banco de dados**

**Padrões suportados:**
```
- "exame de matemática B no dia 23 de junho as 9:30"
- "prova de física em 15/06/26 às 14:00"
- "teste de química no dia 10/05 às 11:30"
- "reunião em 25 de maio às 10:00"
```

### 2. **Detecção Automática de Contexto**
```javascript
const isEventRequest = /(?:marca|schedule|marca-me|agendar|exame|prova|teste|reunião)/i.test(message);
```

Quando detecta um pedido de marcação:
1. ✅ Extrai data/hora
2. ✅ Busca a disciplina no banco
3. ✅ Cria o evento
4. ✅ Confirma ao usuário

### 3. **Parsing de Data Robusto**

**Suporta múltiplos formatos:**

```javascript
// Formato 1: DD/MM/YYYY HH:MM
"23/06/2026 às 9:30"

// Formato 2: DD de Mês de YYYY HH:MM
"23 de junho de 2026 às 9:30"

// Formato 3: DD de Mês HH:MM (detecta ano automaticamente)
"23 de junho às 9:30"

// Detecta:
- Vírgulas, hífens, barras como separadores
- "às", "at", ":" como separadores de hora
- Meses em português ou inglês
```

### 4. **Resposta Aprimorada**

**Antes:**
```json
{
  "answer": "O exame está marcado... (texto genérico)"
}
```

**Depois:**
```json
{
  "answer": "O exame está marcado... (texto da IA)",
  "event": {
    "success": true,
    "eventId": 42,
    "title": "Exame de Matemática B",
    "start_iso": "2026-06-23T09:30:00Z",
    "end_iso": "2026-06-23T12:30:00Z",
    "materia_id": 1
  },
  "eventMessage": "Evento \"Exame de Matemática B\" marcado com sucesso para 23/06/2026, 09:30"
}
```

---

## Arquivos Modificados

### `backend/services/aiAssistantService.js`
✅ Adicionada função `createEventFromMessage()`
✅ Parsing inteligente de datas
✅ Detecção automática de matéria
✅ Exportação da nova função

### `backend/routes/offline_ai.js`
✅ Melhorado POST `/api/ai/assistant` para detectar e criar eventos
✅ Adicionado POST `/api/ai/create-event` (rota direta)
✅ Respostas enriquecidas com informações do evento

---

## Como Usar

### User Story 1: Marcar evento via chat
```
POST /api/ai/assistant
{
  "message": "eu tenho exame de matematica B no dia 23 de junho as 9:30 marca isso pra mim"
}

Resposta:
{
  "answer": "(resposta do chatbot)",
  "event": { ... },
  "eventMessage": "Evento \"Exame de Matemática B\" marcado..."
}
```

### User Story 2: Rota direta para criar evento
```
POST /api/ai/create-event
{
  "message": "prova de física em 15/06/26 às 14:00"
}

Resposta:
{
  "success": true,
  "message": "Evento \"Prova de Física\" marcado para 15/06/2026, 14:00",
  "event": { ... }
}
```

---

## Lógica de Parsing

### Passo 1: Extrair Título
```javascript
// Busca padrão: "exame/prova/teste de MATÉRIA"
"exame de matemática B" → title: "Exame de Matemática B"
```

### Passo 2: Extrair Data e Hora
```javascript
// Tenta 3 patterns:
1. DD/MM/YYYY HH:MM      // "23/06/2026 às 9:30"
2. DD de Mês de YYYY HH:MM // "23 de junho de 2026 às 9:30"
3. DD de Mês HH:MM       // "23 de junho às 9:30" (ano automático)
```

### Passo 3: Buscar Matéria
```javascript
// Procura na tabela "materias" por nome similar
"matemática B" → busca por "matemática" → materia_id = 1
```

### Passo 4: Calcular Duração
```javascript
// Exame/Prova: 3 horas
// Outros (reunião, teste): 1 hora
```

### Passo 5: Salvar no BD
```sql
INSERT INTO events 
  (user_id, title, materia_id, start_iso, end_iso, all_day, color, notes, created_at)
VALUES 
  (userId, title, materiId, startISO, endISO, 0, NULL, NULL, NOW())
```

---

## Tratamento de Erros

```javascript
// Data inválida
"marca o exame para 35 de junho"
→ "Não consegui extrair a data e hora da mensagem."

// Matéria não encontrada (não erro, assume null)
"exame de matéria inexistente em 23/06"
→ Evento marcado sem disciplina associada

// Erro no BD
"Erro ao salvar evento no banco de dados."
```

---

## Testes

### ✅ Teste 1: Formato "DD de Mês às HH:MM"
```
Input: "exame de matemática B no dia 23 de junho as 9:30"
Output: Event created com start_iso = 2026-06-23T09:30:00Z
```

### ✅ Teste 2: Formato "DD/MM/YYYY HH:MM"
```
Input: "prova de física em 15/06/26 às 14:00"
Output: Event created com start_iso = 2026-06-15T14:00:00Z
```

### ✅ Teste 3: Data sem ano
```
Input: "reunião em 25 de maio às 10:00"
Output: Detecta ano automaticamente (2026 se passado, ou próximo)
```

### ✅ Teste 4: Associação de Matéria
```
Input: "exame de matemática B no dia 23/06/26 às 9:30"
Output: materia_id detectado e associado
```

---

## Benefícios

| Antes | Depois |
|-------|--------|
| Resposta fake (sem BD) | ✅ Evento salvo no BD |
| Usuário vê "marcado" mas nada acontece | ✅ Evento real no cronograma |
| Sem integração | ✅ Integração total com BD |
| Resposta genérica | ✅ Confirmação específica |

---

## Status: ✅ COMPLETO

- ✅ Função de parsing de datas
- ✅ Detecção automática de contexto
- ✅ Salvamento no banco de dados
- ✅ Resposta enriquecida ao usuário
- ✅ Rota direta para criar eventos
- ✅ Tratamento de erros

**Pronto para produção!**
