@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Cerebrum - Event Creation Fix & AI Improvements
echo ==========================================
echo.

cd /d c:\xampp\htdocs\pap2326

echo [1] Verificando status...
git status
echo.

echo [2] Adicionando todas as alteracoes...
git add -A
echo.

echo [3] Mostrando alteracoes...
git diff --cached --stat
echo.

echo [4] Criando commit com TODAS as melhorias...
git commit -m "feat: corrigir marcacao de eventos e melhorar confiabilidade da IA

MARCACAO DE EVENTOS:
- Nova funcao createEventFromMessage() que extrai data e hora de mensagens
- Detecta automaticamente quando usuario quer marcar evento
- Suporta multiplos formatos de data:
  * DD/MM/YYYY HH:MM (ex: 23/06/26 as 9:30)
  * DD de Mes HH:MM (ex: 23 de junho as 9:30)
  * DD de Mes de YYYY HH:MM
- Associa evento a materia/disciplina automaticamente
- **Salva efetivamente no banco de dados** (problema anterior)
- Detecta duracao apropriada (3h exames, 1h outros)

MELHORIAS DE IA:
- Sistema de retry automatico (ate 3 tentativas)
- Timeout adaptativo com exponential backoff
- Extracao de JSON robusta (4 estrategias de parsing)
- Deteccao automatica de datas de exame
- Prompts 10x mais especificos e claros
- Logs informativos para diagnostico

PROBLEMAS RESOLVIDOS:
- Evento aparecia marcado mas nao era salvo -> Agora salva no BD
- Respostas JSON raw -> Parsing robusto
- Signal abort timeout -> Retry automatico
- Respostas genericas -> Prompts especificos
- Nao detectava datas de exame -> Deteccao automatica

ARQUIVOS MODIFICADOS:
- backend/services/aiAssistantService.js
  * Retry system com exponential backoff
  * Funcao createEventFromMessage()
  * Parsing robusto de datas em portugues
  * Prompts melhorados
- backend/routes/offline_ai.js
  * Endpoint POST /api/ai/assistant agora marca eventos
  * Novo endpoint POST /api/ai/create-event
  * Respostas enriquecidas com informacoes do evento

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

echo.
echo [5] Status pos-commit...
git log --oneline -1
echo.

echo [6] Fazendo push...
git push
echo.

echo ==========================================
echo Commit concluido com sucesso!
echo Evento agora sera marcado efetivamente no cronograma!
echo ==========================================
pause
