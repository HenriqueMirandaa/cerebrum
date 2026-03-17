import * as db from './data.js';
import api from './api.js';
import { formatHours } from './utils/helpers.js';

// IA local, totalmente client-side. Sem chaves, sem rede.
// Objetivo: ajudar nos estudos com uma conversa mais natural.

const chatState = {
    awaitingSubjectName: false,
    lastSubjectId: null
};

const GENERATED_QUIZ_STORAGE_KEY = 'cerebrum_generated_quizzes';
const QUIZ_CREATED_EVENT = 'cerebrum:quiz-created';

function normalizeQuizScope(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function getGeneratedQuizStorageKey() {
    const currentUser = window.dashboard && window.dashboard.user ? window.dashboard.user : null;
    const scopedUser =
        currentUser?.id
        || currentUser?.email
        || currentUser?.username
        || localStorage.getItem('user_name')
        || 'guest';

    return `${GENERATED_QUIZ_STORAGE_KEY}:${normalizeQuizScope(scopedUser) || 'guest'}`;
}

function getStoredGeneratedQuizzes() {
    try {
        const parsed = JSON.parse(localStorage.getItem(getGeneratedQuizStorageKey()) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Falha ao ler quizzes gerados', error);
        return [];
    }
}

function persistGeneratedQuiz(quiz) {
    const current = getStoredGeneratedQuizzes();
    current.unshift(quiz);
    localStorage.setItem(getGeneratedQuizStorageKey(), JSON.stringify(current.slice(0, 20)));
}

function emitGeneratedQuizCreated(quiz) {
    try {
        window.dispatchEvent(new CustomEvent(QUIZ_CREATED_EVENT, { detail: { quiz } }));
    } catch (error) {
        console.warn('Falha ao emitir evento de quiz criado', error);
    }
}

function cleanupTopicPart(value) {
    return String(value || '')
        .replace(/[?.!,:;]+$/g, '')
        .replace(/\bde\s+\d+\s+perguntas?\b/gi, '')
        .replace(/\bcom\s+\d+\s+perguntas?\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function subjectMatches(subjectName = '', aliases = []) {
    const normalized = normalizeText(subjectName);
    if (!normalized) return false;

    return aliases.some((alias) => {
        const normalizedAlias = normalizeText(alias);
        if (!normalizedAlias) return false;
        if (normalized === normalizedAlias) return true;
        if (normalized.startsWith(`${normalizedAlias} `)) return true;
        if (normalized.endsWith(` ${normalizedAlias}`)) return true;
        if (normalized.includes(` ${normalizedAlias} `)) return true;
        return false;
    });
}

function getSuggestedQuizTopics(subjectName = '') {
    if (subjectMatches(subjectName, ['portugues', 'português', 'lingua portuguesa', 'língua portuguesa'])) {
        return ['interpretacao de texto', 'gramatica', 'sintaxe', 'ortografia', 'literatura'];
    }
    if (subjectMatches(subjectName, ['matematica', 'matemática', 'algebra', 'álgebra'])) {
        return ['equacoes', 'fracoes', 'geometria', 'funcoes', 'probabilidade'];
    }
    if (subjectMatches(subjectName, ['historia', 'história'])) {
        return ['revolucao industrial', 'primeira guerra', 'idade media', 'imperialismo', 'brasil colonia'];
    }
    if (subjectMatches(subjectName, ['geografia'])) {
        return ['globalizacao', 'clima', 'relevo', 'populacao', 'cartografia'];
    }
    if (subjectMatches(subjectName, ['fisica', 'física'])) {
        return ['movimento', 'forca', 'energia', 'eletricidade', 'optica'];
    }
    if (subjectMatches(subjectName, ['quimica', 'química'])) {
        return ['atomos', 'ligacoes quimicas', 'reacoes', 'tabela periodica', 'solucoes'];
    }
    if (subjectMatches(subjectName, ['biologia'])) {
        return ['celula', 'genetica', 'ecologia', 'corpo humano', 'evolucao'];
    }
    if (subjectMatches(subjectName, ['ciencias naturais', 'ciências naturais', 'ciencias', 'ciências', 'science'])) {
        return ['seres vivos', 'ecossistemas', 'corpo humano', 'ambiente', 'materia e energia'];
    }
    if (subjectMatches(subjectName, ['filosofia'])) {
        return ['etica', 'logica', 'politica', 'conhecimento', 'filosofos'];
    }
    if (subjectMatches(subjectName, ['ingles', 'inglês', 'english', 'lingua inglesa', 'língua inglesa'])) {
        return ['vocabulary', 'reading comprehension', 'verb tenses', 'grammar', 'interpretation'];
    }
    if (subjectMatches(subjectName, ['frances', 'francês', 'french', 'lingua francesa', 'língua francesa'])) {
        return ['vocabulaire', 'comprehension', 'grammaire', 'verbes', 'interpretation'];
    }

    return ['conceitos centrais', 'definicoes', 'aplicacoes', 'exercicios base', 'revisao geral'];
}

function extractQuizRequest(rawText, subjects = []) {
    const raw = String(rawText || '').trim();
    const normalized = normalizeText(raw);

    const countMatch = normalized.match(/(\d+)\s+perguntas?/);
    const questionCount = Math.max(3, Math.min(10, Number(countMatch?.[1] || 5)));

    let topic = '';
    const topicMatch = raw.match(/\bsobre\s+(.+)$/i);
    if (topicMatch) topic = cleanupTopicPart(topicMatch[1]);

    let subject = '';
    const subjectWithCountMatch = raw.match(/\bquiz\s+de\s+\d+\s+perguntas?\s+de\s+(.+?)(?=\s+sobre\s+|$)/i);
    const subjectDirectMatch = raw.match(/\bquiz\s+de\s+(.+?)(?=\s+sobre\s+|$)/i);
    if (subjectWithCountMatch) subject = cleanupTopicPart(subjectWithCountMatch[1]);
    else if (subjectDirectMatch) subject = cleanupTopicPart(subjectDirectMatch[1]);

    const mentioned = findMentionedSubject(raw, subjects);
    if (mentioned) {
        subject = mentioned.name;
    } else if (!subject) {
        subject = extractSubjectName(raw) || 'Estudos Gerais';
    }

    if (!topic) {
        topic = getSuggestedQuizTopics(mentioned?.name || subject)[0] || 'revisao geral';
    }

    return {
        questionCount,
        subject: cleanupTopicPart(subject || 'Estudos Gerais'),
        topic: cleanupTopicPart(topic || 'revisao geral')
    };
}

function buildHistoryQuizTemplates(topic) {
    return [
        {
            prompt: `O que melhor define ${topic}?`,
            correctOption: 'Um processo de transformacoes economicas, sociais e tecnologicas que alterou a producao e o trabalho.',
            distractors: [
                'Um acordo diplomatico voltado apenas para a divisao territorial da Europa.',
                'Uma crise exclusivamente agricola, sem impacto na industria.',
                'Um movimento artistico focado apenas em literatura.'
            ],
            explanation: `A forma mais segura de definir ${topic} e destacar suas mudancas tecnicas, economicas e sociais.`
        },
        {
            prompt: `Qual fator impulsionou ${topic}?`,
            correctOption: 'A combinacao entre inovacao tecnica, capital e ampliacao da producao.',
            distractors: [
                'A proibicao completa do comercio internacional.',
                'O abandono total das cidades em favor do campo.',
                'A extincao imediata do trabalho assalariado.'
            ],
            explanation: 'Os processos historicos ligados a industrializacao avancam quando tecnologia, investimento e demanda se combinam.'
        },
        {
            prompt: `Qual efeito social foi comum em ${topic}?`,
            correctOption: 'Urbanizacao acelerada e reorganizacao das relacoes de trabalho.',
            distractors: [
                'Fim de qualquer desigualdade entre grupos sociais.',
                'Desaparecimento das fabricas e retorno ao artesanato como unica forma de producao.',
                'Reducao completa do uso de maquinas.'
            ],
            explanation: 'Mudancas produtivas costumam reconfigurar cidades, jornadas e formas de contratacao.'
        },
        {
            prompt: `Que fonte ajuda a analisar ${topic}?`,
            correctOption: 'Dados de producao, relatos de trabalhadores, leis e inovacoes tecnicas.',
            distractors: [
                'Apenas lendas sem contexto documental.',
                'Somente mapas climaticos, sem relacao com economia.',
                'Exclusivamente obras de ficcao sem fonte historica.'
            ],
            explanation: 'Fontes economicas, sociais e tecnologicas permitem compreender o processo historico de forma mais completa.'
        },
        {
            prompt: `Por que ${topic} segue relevante hoje?`,
            correctOption: 'Porque ajuda a explicar as bases do mundo urbano-industrial contemporaneo.',
            distractors: [
                'Porque foi um evento sem qualquer efeito duradouro.',
                'Porque eliminou todos os conflitos sociais do periodo.',
                'Porque ocorreu da mesma forma em todos os paises e epocas.'
            ],
            explanation: 'O tema ajuda a conectar passado, trabalho, tecnologia e desigualdades do presente.'
        },
        {
            prompt: `Ao revisar ${topic}, o que e mais importante?`,
            correctOption: 'Relacionar causas, mudancas tecnicas e consequencias sociais em cadeia.',
            distractors: [
                'Memorizar uma data isolada e ignorar o contexto.',
                'Decorar nomes aleatorios sem ligar conceitos.',
                'Evitar comparar fontes e interpretacoes.'
            ],
            explanation: 'Em Historia, compreender conexoes costuma ser mais forte do que decorar fatos soltos.'
        },
        {
            prompt: `Qual mudanca economica marcou ${topic}?`,
            correctOption: 'A ampliacao da producao mecanizada e do sistema fabril.',
            distractors: [
                'O fim imediato de todo comercio e manufatura.',
                'A substituicao completa das cidades por zonas rurais.',
                'O abandono de qualquer inovacao tecnica.'
            ],
            explanation: 'A mecanizacao e a fabrica estao no centro das transformacoes economicas desse processo.'
        },
        {
            prompt: `Que grupo social ganhou destaque durante ${topic}?`,
            correctOption: 'A burguesia industrial e o operariado urbano.',
            distractors: [
                'A nobreza feudal como unico grupo relevante.',
                'Somente artistas e escritores, sem trabalhadores.',
                'Apenas lideres religiosos, sem impacto economico.'
            ],
            explanation: 'O crescimento das fabricas reorganizou classes sociais e relacoes de trabalho.'
        }
    ];
}

function buildGeographyQuizTemplates(topic) {
    return [
        {
            prompt: `O que melhor define ${topic}?`,
            correctOption: 'A intensificacao das conexoes entre lugares por meio de fluxos de mercadorias, pessoas, capitais e informacoes.',
            distractors: [
                'O isolamento total dos paises e o fim das trocas internacionais.',
                'Um processo restrito ao clima, sem impacto social ou economico.',
                'A substituicao de redes globais por economias totalmente fechadas.'
            ],
            explanation: 'Em Geografia, o conceito destaca redes, fluxos e interdependencia espacial.'
        },
        {
            prompt: `Qual situacao exemplifica ${topic}?`,
            correctOption: 'Uma empresa produz em varios paises e vende para mercados de diferentes continentes.',
            distractors: [
                'Uma comunidade sem qualquer contato externo ao longo do tempo.',
                'Uma economia local sem uso de transporte ou comunicacao.',
                'Uma atividade isolada que nao depende de redes de circulacao.'
            ],
            explanation: 'Cadeias produtivas internacionais sao exemplos tipicos do fenomeno.'
        },
        {
            prompt: `Qual efeito espacial pode surgir com ${topic}?`,
            correctOption: 'Maior integracao entre regioes, mas tambem aumento de desigualdades entre territorios.',
            distractors: [
                'Desaparecimento completo das diferencas regionais.',
                'Fim de qualquer circulacao de informacao no planeta.',
                'Eliminacao total das hierarquias urbanas.'
            ],
            explanation: 'A integracao global nao elimina desigualdades; muitas vezes as reorganiza.'
        },
        {
            prompt: `Qual elemento impulsiona ${topic}?`,
            correctOption: 'Avancos nos transportes, nas telecomunicacoes e na circulacao financeira.',
            distractors: [
                'A reducao total das tecnologias de comunicacao.',
                'O fechamento permanente das fronteiras economicas.',
                'A extincao dos meios de transporte em massa.'
            ],
            explanation: 'Transportes e comunicacoes aceleram conexoes e fluxos em escala global.'
        },
        {
            prompt: `Qual afirmacao sobre ${topic} esta correta?`,
            correctOption: 'O processo amplia conexoes globais, mas seus beneficios nao se distribuem de forma igual.',
            distractors: [
                'O processo beneficia todos os territorios da mesma maneira.',
                'O processo impede qualquer circulacao cultural entre paises.',
                'O processo acontece sem relacao com empresas ou Estados.'
            ],
            explanation: 'A globalizacao e desigual e produz ganhadores e perdedores.'
        },
        {
            prompt: `Como ${topic} aparece no quotidiano?`,
            correctOption: 'No consumo de produtos importados, no uso de plataformas digitais e na circulacao instantanea de informacoes.',
            distractors: [
                'Apenas em mapas antigos sem relacao com a vida atual.',
                'Somente em areas rurais sem acesso a tecnologia.',
                'Exclusivamente em fronteiras fechadas ao comercio.'
            ],
            explanation: 'O conceito aparece em habitos de consumo, tecnologia e comunicacao.'
        },
        {
            prompt: `Que critica e comum a ${topic}?`,
            correctOption: 'Pode aprofundar dependencias economicas e desigualdades entre lugares.',
            distractors: [
                'Elimina automaticamente todos os conflitos territoriais.',
                'Torna todos os paises culturalmente identicos de imediato.',
                'Acaba com qualquer disputa por mercado e recursos.'
            ],
            explanation: 'Uma leitura geografica considera assimetrias de poder e dependencia.'
        },
        {
            prompt: `Qual conceito se relaciona diretamente com ${topic}?`,
            correctOption: 'Fluxos globais e redes tecnicas que conectam territorios.',
            distractors: [
                'Autossuficiencia absoluta sem trocas externas.',
                'Imobilidade total de pessoas e capitais.',
                'Fim das cidades e retorno universal ao campo.'
            ],
            explanation: 'Fluxos e redes sao chaves para entender a organizacao do espaco globalizado.'
        }
    ];
}

function buildGenericQuizTemplates(subject, topic) {
    return [
        {
            prompt: `O que melhor define ${topic}?`,
            correctOption: `A ideia central de ${topic} e seu papel no estudo de ${subject}.`,
            distractors: [
                `Um detalhe isolado sem relacao com ${subject}.`,
                'Um conceito sem aplicacao teorica nem pratica.',
                'Uma excecao que anula o restante do conteudo.'
            ],
            explanation: `A revisao deve comecar pela definicao central e pela funcao do tema em ${subject}.`
        },
        {
            prompt: `Qual exemplo representa ${topic}?`,
            correctOption: `Uma situacao concreta em que ${topic} pode ser observado ou aplicado.`,
            distractors: [
                'Um caso que contradiz totalmente a definicao do tema.',
                'Uma frase decorada sem relacao com a pratica.',
                'Um conteudo de outra materia sem conexao com o assunto.'
            ],
            explanation: 'Entender um conceito inclui reconhece-lo em exemplos concretos.'
        },
        {
            prompt: `Qual estrategia ajuda a estudar ${topic}?`,
            correctOption: 'Explicar o tema com palavras proprias e resolver perguntas curtas.',
            distractors: [
                'Ler uma vez sem revisar nem testar a memoria.',
                'Ignorar exemplos e aplicacoes do conceito.',
                'Trocar o tema por outro assunto nao relacionado.'
            ],
            explanation: 'Explicacao ativa e pratica de recuperacao melhoram a fixacao.'
        },
        {
            prompt: `Como saber se entendeu ${topic}?`,
            correctOption: `Conseguir definir ${topic}, dar um exemplo e diferenciar o tema de conceitos proximos.`,
            distractors: [
                'Repetir uma frase decorada sem saber o significado.',
                'Evitar qualquer exemplo concreto.',
                'Depender sempre do material aberto para responder.'
            ],
            explanation: 'Dominio real aparece quando ha definicao, exemplo e comparacao.'
        },
        {
            prompt: `Qual erro e comum ao revisar ${topic}?`,
            correctOption: 'Memorizar palavras-chave sem compreender relacoes e aplicacoes.',
            distractors: [
                'Resolver exercicios progressivos com feedback.',
                'Fazer revisoes espacadas ao longo da semana.',
                'Anotar duvidas para corrigir depois.'
            ],
            explanation: 'Memorizacao isolada costuma falhar quando o tema exige transferencia e interpretacao.'
        },
        {
            prompt: `O que nao pode faltar num resumo de ${topic}?`,
            correctOption: `Definicao, funcao do tema e um exemplo relevante em ${subject}.`,
            distractors: [
                'Apenas uma lista de palavras soltas.',
                'Uma opiniao sem relacao com o conteudo.',
                'Um detalhe menor apresentado como se fosse tudo.'
            ],
            explanation: 'Uma resposta forte combina conceito, funcao e exemplo.'
        },
        {
            prompt: `Qual afirmacao sobre ${topic} esta correta?`,
            correctOption: `O tema precisa ser entendido pelo conceito e pela forma como aparece em ${subject}.`,
            distractors: [
                'O tema nao possui relacao com o restante da materia.',
                'O tema e apenas decorativo e sem utilidade.',
                'O tema invalida todos os outros conceitos.'
            ],
            explanation: 'O conteudo ganha sentido quando ligado ao contexto da disciplina.'
        },
        {
            prompt: `Que pergunta testa melhor o dominio de ${topic}?`,
            correctOption: `Eu consigo explicar ${topic} sem consultar apontamentos e aplicar a ideia num caso simples?`,
            distractors: [
                'Eu reli o titulo e achei familiar?',
                'Eu vi a materia passar na aula uma vez?',
                'Eu marquei o texto com sublinhados coloridos?'
            ],
            explanation: 'Recordacao ativa e aplicacao simples sao sinais melhores de aprendizagem.'
        }
    ];
}

function buildQuizQuestions(subject, topic, questionCount) {
    const normalizedSubject = normalizeText(subject);
    const templates = normalizedSubject.includes('hist')
        ? buildHistoryQuizTemplates(topic)
        : normalizedSubject.includes('geo')
            ? buildGeographyQuizTemplates(topic)
            : buildGenericQuizTemplates(subject, topic);

    return Array.from({ length: questionCount }, (_, index) => {
        const item = templates[index % templates.length];
        const cycle = Math.floor(index / templates.length);
        const correctPosition = (index * 2 + normalizeText(topic).length + cycle) % 4;
        const distractors = [...item.distractors];
        const options = [];
        let distractorCursor = 0;
        for (let optionIndex = 0; optionIndex < 4; optionIndex += 1) {
            if (optionIndex === correctPosition) options.push(item.correctOption);
            else {
                options.push(distractors[distractorCursor % distractors.length]);
                distractorCursor += 1;
            }
        }

        return {
            id: `q_${Date.now()}_${index + 1}`,
            prompt: item.prompt,
            options,
            answerIndex: correctPosition,
            explanation: item.explanation
        };
    });
}

function normalizeSubjectRecord(subject = {}) {
    const id = subject.id || subject.subject_id || '';
    const progress = Number(subject.progress ?? subject.progresso ?? 0) || 0;
    const totalHours = Number(subject.total_hours ?? subject.horas_totais ?? subject.totalHours ?? 0) || 0;
    const examDate = subject.exam_date || subject.data_prova || subject.examDate || null;

    return {
        ...subject,
        id: String(id),
        name: subject.name || subject.nome || subject.title || 'Materia sem nome',
        progress: Math.max(0, Math.min(100, progress)),
        total_hours: Math.max(0, totalHours),
        exam_date: examDate
    };
}

function normalizeSessionRecord(session = {}) {
    return {
        ...session,
        subject_id: String(session.subject_id || session.materia_id || session.subjectId || ''),
        start_time: session.start_time || session.start_iso || session.start || null,
        end_time: session.end_time || session.end_iso || session.end || null,
        duration: Number(session.duration || 0) || 0,
        completed: Boolean(session.completed)
    };
}

async function safeGetSubjects() {
    try {
        const remoteSubjects = await api.getMinhasMaterias();
        if (Array.isArray(remoteSubjects) && remoteSubjects.length) {
            return remoteSubjects.map(normalizeSubjectRecord);
        }
    } catch (error) {
        console.warn('Falha ao carregar materias da API para a IA local', error);
    }

    try {
        const localSubjects = await db.getSubjects();
        return Array.isArray(localSubjects) ? localSubjects.map(normalizeSubjectRecord) : [];
    } catch (error) {
        return [];
    }
}

async function safeGetSessions() {
    try {
        const remoteSessions = await api.getSessions();
        if (Array.isArray(remoteSessions) && remoteSessions.length) {
            return remoteSessions.map(normalizeSessionRecord);
        }
    } catch (error) {
        console.warn('Falha ao carregar sessoes da API para a IA local', error);
    }

    try {
        const localSessions = await db.getSessions();
        return Array.isArray(localSessions) ? localSessions.map(normalizeSessionRecord) : [];
    } catch (error) {
        return [];
    }
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function includesAny(text, terms) {
    return terms.some((term) => text.includes(term));
}

function toIsoDate(rawDate) {
    if (!rawDate) return null;

    const isoMatch = rawDate.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) return isoMatch[0];

    const brMatch = rawDate.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (brMatch) {
        const [, dd, mm, yyyy] = brMatch;
        return `${yyyy}-${mm}-${dd}`;
    }

    const brShortYearMatch = rawDate.match(/\b(\d{2})\/(\d{2})\/(\d{2})\b/);
    if (brShortYearMatch) {
        const [, dd, mm, yy] = brShortYearMatch;
        const yearNum = Number(yy);
        const fullYear = yearNum >= 70 ? 1900 + yearNum : 2000 + yearNum;
        return `${String(fullYear)}-${mm}-${dd}`;
    }

    return null;
}

function extractHours(rawText) {
    if (!rawText) return null;
    const match = rawText.match(/\b(\d+(?:[.,]\d+)?)\s*(h|hora|horas)\b/i);
    if (!match) return null;
    return Number(match[1].replace(',', '.'));
}

function parseDurationToHours(rawText) {
    const text = String(rawText || '');
    if (!text) return null;

    const full = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas)\s*(?:e\s*)?(\d{1,2})?\s*(?:m|min|mins|minuto|minutos)?/i);
    if (full) {
        const h = Number(full[1].replace(',', '.'));
        const m = full[2] ? Number(full[2]) : 0;
        return h + (Math.max(0, Math.min(59, m)) / 60);
    }

    const compact = text.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*min/i);
    if (compact) {
        const h = Number(compact[1]);
        const m = Number(compact[2]);
        return h + (Math.max(0, Math.min(59, m)) / 60);
    }

    const onlyMinutes = text.match(/(\d{1,3})\s*(?:m|min|mins|minuto|minutos)\b/i);
    if (onlyMinutes) {
        return Number(onlyMinutes[1]) / 60;
    }

    return null;
}

function extractTargetLoadHours(rawText) {
    const text = String(rawText || '');
    if (!text) return null;

    const loadMatch = text.match(
        /\b(?:carga\s*horaria|carga|total\s*de\s*estudo|quero\s*(?:uma\s*)?carga)\s*(?:de|:)?\s*([^\n,.!;]{1,40})/i
    );
    if (loadMatch) {
        const parsed = parseDurationToHours(loadMatch[1]);
        if (parsed) return parsed;
    }

    const totalMatch = text.match(/\b(?:total|somando)\s*(?:de|:)?\s*([^\n,.!;]{1,35})\s*(?:de\s*estudo)?/i);
    if (totalMatch) {
        const parsed = parseDurationToHours(totalMatch[1]);
        if (parsed) return parsed;
    }

    return null;
}

function cleanExtractedName(value) {
    if (!value) return '';
    return String(value)
        .replace(/\s+(com|para|prova|exame|em|dia|na|no)\b.*$/i, '')
        .replace(/[.,;:!?]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractSubjectName(rawText) {
    if (!rawText) return '';

    const quoted = rawText.match(/["']([^"']{2,80})["']/);
    if (quoted) return cleanExtractedName(quoted[1]);

    const afterKeyword = rawText.match(
        /\b(?:materia|disciplina|assunto)\s*(?:de|da|do|chamada|nomeada|nome|:|=)?\s*([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i
    );
    if (afterKeyword) return cleanExtractedName(afterKeyword[1]);

    const generic = rawText.match(/\b(?:adicionar|criar|incluir|registrar|cadastrar)\s+([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i);
    if (generic) return cleanExtractedName(generic[1]);

    const planFor = rawText.match(/\b(?:plano de estudo|plano)\s+para\s+([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i);
    if (planFor) return cleanExtractedName(planFor[1]);

    const examOf = rawText.match(/\b(?:exame|prova)\s+de\s+([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i);
    if (examOf) return cleanExtractedName(examOf[1]);

    return '';
}

function daysBetweenTodayAnd(isoDate) {
    if (!isoDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = new Date(`${isoDate}T00:00:00`);
    const diff = Math.ceil((exam - today) / (1000 * 60 * 60 * 24));
    return diff;
}

function toTwoDecimals(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function formatHoursWithMinutes(decimalHours) {
    const totalMinutes = Math.max(0, Math.round(Number(decimalHours || 0) * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${minutes}min`;
}

function describeDaysLeft(daysLeft) {
    if (daysLeft === null || typeof daysLeft === 'undefined') return 'sem data de prova definida';
    if (daysLeft < 0) return 'com prova ja passada';
    if (daysLeft === 0) return 'com prova hoje';
    if (daysLeft === 1) return 'com prova amanha';
    return `com prova em ${daysLeft} dias`;
}

function getSubjectPriority(subject) {
    const progress = Number(subject.progress || 0);
    const daysLeft = daysBetweenTodayAnd(subject.exam_date);
    const urgency =
        daysLeft === null ? 18
            : daysLeft < 0 ? 0
                : daysLeft <= 3 ? 55
                    : daysLeft <= 7 ? 45
                        : daysLeft <= 14 ? 34
                            : daysLeft <= 30 ? 24
                                : 12;
    const progressGap = Math.max(0, 100 - progress);
    const missingExamPenalty = subject.exam_date ? 0 : 8;
    const totalHoursWeight = Math.min(10, Math.round(Number(subject.total_hours || 0) / 4));
    const score = progressGap + urgency + missingExamPenalty + totalHoursWeight;

    return { score, daysLeft, progress };
}

function getStudyBlockSuggestion(subject, priority) {
    if (priority.daysLeft !== null && priority.daysLeft <= 3) return '90 minutos focados + 20 minutos de revisao';
    if (priority.daysLeft !== null && priority.daysLeft <= 10) return '60 a 75 minutos focados';
    if (priority.progress < 40) return '50 a 60 minutos com teoria e exercicios';
    if (priority.progress < 75) return '45 minutos com revisao ativa';
    return '30 a 40 minutos para consolidacao';
}

function getSubjectLabel(subject, priority) {
    return `${subject.name} (${Math.round(priority.progress)}%, ${describeDaysLeft(priority.daysLeft)})`;
}

const WEEKDAY_PATTERNS = [
    { key: 'segunda', regex: /\b(seg|segunda)\b/g },
    { key: 'terca', regex: /\b(ter|terca|terça)\b/g },
    { key: 'quarta', regex: /\b(qua|quarta)\b/g },
    { key: 'quinta', regex: /\b(qui|quinta)\b/g },
    { key: 'sexta', regex: /\b(sex|sexta)\b/g },
    { key: 'sabado', regex: /\b(sab|sabado|sábado)\b/g },
    { key: 'domingo', regex: /\b(dom|domingo)\b/g }
];

function parseAvailability(rawText) {
    const text = normalizeText(rawText);
    const dayHours = {};
    const dailyMatch = text.match(/((?:\d+(?:[.,]\d+)?\s*h(?:oras?)?(?:\s*e\s*\d{1,2}\s*(?:m|min|minutos)?)?)|(?:\d{1,2}\s*h\s*\d{1,2}\s*min))\s*(?:disponiveis?\s*)?(?:por dia|diari[oa]mente|todo dia)/i);
    const altDailyMatch = text.match(/((?:\d+(?:[.,]\d+)?\s*h(?:oras?)?(?:\s*e\s*\d{1,2}\s*(?:m|min|minutos)?)?)|(?:\d{1,2}\s*h\s*\d{1,2}\s*min))\s*(?:disponiveis?\s*)?(?:por|em)\s*\d+\s*dias?\s*(?:por semana|da semana|na semana)/i);
    const dailyHours = dailyMatch ? parseDurationToHours(dailyMatch[1]) : (altDailyMatch ? parseDurationToHours(altDailyMatch[1]) : null);
    const weeklyDaysMatch = text.match(/(\d+)\s*dias?\s*(?:por semana|na semana)/i);
    const daysPerWeek = weeklyDaysMatch ? Math.max(1, Math.min(7, Number(weeklyDaysMatch[1]))) : null;
    const weeklyHoursMatch = text.match(/((?:\d+(?:[.,]\d+)?\s*h(?:oras?)?(?:\s*e\s*\d{1,2}\s*(?:m|min|minutos)?)?)|(?:\d{1,2}\s*h\s*\d{1,2}\s*min))\s*(?:por semana|na semana)/i);
    const explicitWeeklyHours = weeklyHoursMatch ? parseDurationToHours(weeklyHoursMatch[1]) : null;

    const hourMentions = [];
    const hourRegex = /(\d+(?:[.,]\d+)?)\s*h(?:oras?)?/gi;
    let hm = hourRegex.exec(text);
    while (hm) {
        hourMentions.push({ value: Number(hm[1].replace(',', '.')), index: hm.index });
        hm = hourRegex.exec(text);
    }

    WEEKDAY_PATTERNS.forEach(({ key, regex }) => {
        regex.lastIndex = 0;
        let dm = regex.exec(text);
        while (dm) {
            const closest = hourMentions
                .map((h) => ({ h, distance: Math.abs(h.index - dm.index) }))
                .filter((x) => x.distance <= 36)
                .sort((a, b) => a.distance - b.distance)[0];

            if (closest) {
                dayHours[key] = closest.h.value;
            }
            dm = regex.exec(text);
        }
    });

    const weeklyFromWeekdays = Object.values(dayHours).reduce((acc, value) => acc + Number(value || 0), 0);
    const weeklyHours = explicitWeeklyHours
        || (dailyHours && daysPerWeek ? dailyHours * daysPerWeek : null)
        || (dailyHours ? dailyHours * 7 : null)
        || (weeklyFromWeekdays > 0 ? weeklyFromWeekdays : null);

    return { dailyHours, dayHours, weeklyHours, daysPerWeek, explicitWeeklyHours };
}

function getDefaultHoursByTimeWindow(daysLeft) {
    if (daysLeft <= 10) return 16;
    if (daysLeft <= 20) return 24;
    if (daysLeft <= 45) return 32;
    return 40;
}

function buildAvailabilityLines(availability) {
    if (!availability) return [];
    const lines = [];
    if (availability.dailyHours && availability.daysPerWeek) {
        lines.push(`- Disponibilidade declarada: ${formatHoursWithMinutes(availability.dailyHours)} por dia por ${availability.daysPerWeek} dias/semana (~${formatHoursWithMinutes(availability.dailyHours * availability.daysPerWeek)} por semana)`);
    } else if (availability.dailyHours) {
        lines.push(`- Disponibilidade declarada: ${formatHoursWithMinutes(availability.dailyHours)} por dia (~${formatHoursWithMinutes(availability.dailyHours * 7)} por semana)`);
    } else if (availability.explicitWeeklyHours) {
        lines.push(`- Disponibilidade declarada: ~${formatHoursWithMinutes(availability.explicitWeeklyHours)} por semana`);
    } else if (availability.weeklyHours) {
        lines.push(`- Disponibilidade declarada: ~${formatHoursWithMinutes(availability.weeklyHours)} por semana`);
    }

    const dayEntries = Object.entries(availability.dayHours || {});
    if (dayEntries.length) {
        const formatted = dayEntries.map(([day, hours]) => `${day} ${formatHoursWithMinutes(hours)}`).join(', ');
        lines.push(`- Dias informados: ${formatted}`);
    }
    return lines;
}

function buildPlanText({ subjectName, examDate, daysLeft, totalHours, availability, capacityUntilExam }) {
    const safeDays = Math.max(daysLeft, 1);
    const safeHours = Math.max(toTwoDecimals(totalHours || 0), 1);
    const dailyHours = toTwoDecimals(safeHours / safeDays);
    const weeklyHours = toTwoDecimals(dailyHours * 7);
    const baseSessionsPerWeek = availability?.daysPerWeek || 7;
    const sessionMinutes = Math.max(30, Math.round((weeklyHours / baseSessionsPerWeek) * 60));
    const reviewPercent = 0.2;
    const practicePercent = 0.5;
    const theoryPercent = 0.3;

    const theoryHours = toTwoDecimals(safeHours * theoryPercent);
    const practiceHours = toTwoDecimals(safeHours * practicePercent);
    const reviewHours = toTwoDecimals(safeHours * reviewPercent);

    const availabilityLines = buildAvailabilityLines(availability);

    const lines = [
        `Plano de estudo para ${subjectName}:`,
        `- Exame: ${examDate} (${daysLeft} dias restantes)`,
        `- Carga sugerida: ${formatHoursWithMinutes(safeHours)} ate o exame`,
        `- Ritmo diario: ~${formatHoursWithMinutes(dailyHours)} por dia`,
        `- Ritmo semanal: ~${formatHoursWithMinutes(weeklyHours)} por semana`
    ];

    if (availabilityLines.length) {
        lines.push(...availabilityLines);
    }

    if (typeof capacityUntilExam === 'number') {
        lines.push(`- Capacidade total ate o exame: ~${formatHoursWithMinutes(capacityUntilExam)}`);
    }

    lines.push(
        '',
        'Distribuicao recomendada:',
        `- Teoria: ${formatHoursWithMinutes(theoryHours)}`,
        `- Exercicios: ${formatHoursWithMinutes(practiceHours)}`,
        `- Revisao: ${formatHoursWithMinutes(reviewHours)}`,
        '',
        `Execucao pratica (semanal):`,
        `- ${baseSessionsPerWeek} sessoes por semana`,
        `- ${sessionMinutes} minutos por sessao`,
        '- 1 bloco final de revisao ativa + simulacao curta',
        '',
        'Se quiser, eu ajusto esse plano para o teu horario real (dias/horas disponiveis).'
    );

    return lines.join('\n');
}

function findMentionedSubject(rawText, subjects) {
    const normalizedInput = normalizeText(rawText);
    if (!normalizedInput) return null;

    for (const subject of subjects) {
        const name = subject?.name || subject?.nome || '';
        if (!name) continue;
        const normalizedName = normalizeText(name);
        if (normalizedName && normalizedInput.includes(normalizedName)) {
            return subject;
        }
    }

    return null;
}

function getGreetingReply() {
    return 'Ola! Posso te ajudar com plano de estudo, progresso, quiz ou cadastro de materia. Me diz o que voce precisa.';
}

function getCapabilityReply() {
    return [
        'Posso conversar de forma natural com voce sobre estudos.',
        'Exemplos:',
        '- "quero adicionar materia de fisica com 30 horas"',
        '- "como esta meu progresso?"',
        '- "me sugere o que estudar hoje"',
        '- "gera um quiz da materia de matematica"'
    ].join('\n');
}

async function addSubjectFromNaturalText(rawText, explicitName = '') {
    const name = cleanExtractedName(explicitName || extractSubjectName(rawText));
    if (!name) {
        chatState.awaitingSubjectName = true;
        return 'Perfeito. Qual e o nome da materia que voce quer adicionar?';
    }

    const totalHours = extractHours(rawText) || 0;
    const examDate = toIsoDate(rawText);
    const subject = {
        name,
        total_hours: totalHours,
        exam_date: examDate,
        color: null,
        icon: 'fas fa-book',
        progress: 0
    };

    const id = await db.addSubject(subject);
    chatState.awaitingSubjectName = false;
    chatState.lastSubjectId = id;

    const details = [];
    if (totalHours > 0) details.push(`${formatHoursWithMinutes(totalHours)} planejadas`);
    if (examDate) details.push(`prova em ${examDate}`);

    return `Materia adicionada com sucesso: ${name}${details.length ? ` (${details.join(', ')})` : ''}.`;
}

async function tryCreateExamEvent({ subjectName, examDate, subjectId }) {
    try {
        const start = new Date(`${examDate}T09:00:00`);
        const end = new Date(`${examDate}T10:00:00`);
        const payload = {
            title: `Exame de ${subjectName}`,
            materia_id: subjectId || null,
            start_iso: start.toISOString(),
            end_iso: end.toISOString(),
            all_day: 1,
            notes: 'Criado automaticamente pelo Assistente IA.'
        };
        await api.createEvent(payload);
        return { ok: true };
    } catch (error) {
        console.warn('Nao foi possivel criar evento de exame no cronograma', error);
        return { ok: false };
    }
}

const aiLocal = {
    async getQuizSubjects() {
        const subjects = await safeGetSubjects();
        return subjects.map((subject) => ({
            id: subject.id,
            name: subject.name
        }));
    },

    getQuizTopicSuggestions(subjectName = '') {
        return getSuggestedQuizTopics(subjectName);
    },

    // Adiciona uma materia localmente (IndexedDB)
    async addSubject({ name, total_hours = 0, exam_date = null, color = null, icon = 'fas fa-book' } = {}) {
        if (!name || !name.trim()) throw new Error('Nome da materia obrigatorio');
        const subj = { name: String(name).trim(), total_hours: Number(total_hours) || 0, exam_date: exam_date || null, color, icon, progress: 0 };
        try {
            const id = await db.addSubject(subj);
            subj.id = id;
            chatState.lastSubjectId = id;
            return subj;
        } catch (e) {
            console.error('addSubject failed', e);
            throw e;
        }
    },

    // Retorna lista de recomendacoes curtas
    async getRecommendations() {
        const subjects = await safeGetSubjects();
        if (!subjects.length) {
            return [
                {
                    title: 'Comece pelas materias',
                    message: 'Ainda nao encontrei materias ativas. Adicione pelo menos uma disciplina com data de prova para eu priorizar o estudo corretamente.'
                }
            ];
        }

        const ranked = subjects
            .map((subject) => ({ subject, priority: getSubjectPriority(subject) }))
            .sort((a, b) => b.priority.score - a.priority.score);

        const recs = ranked.slice(0, 3).map(({ subject, priority }, index) => {
            const block = getStudyBlockSuggestion(subject, priority);
            const reason =
                priority.daysLeft !== null && priority.daysLeft <= 10
                    ? `A prova esta proxima: ${describeDaysLeft(priority.daysLeft)}.`
                    : priority.progress < 50
                        ? 'O progresso ainda esta baixo e precisa de ganhar tracao.'
                        : !subject.exam_date
                            ? 'Ainda falta definir uma data de prova para planeamento mais preciso.'
                            : 'Esta materia merece manutencao para nao perder ritmo.';

            return {
                title: `${index + 1}. Prioridade: ${subject.name}`,
                message: `${reason} Estado atual: ${Math.round(priority.progress)}% concluido. Sugestao objetiva: faca ${block} hoje.`
            };
        });

        const examless = ranked.find(({ subject }) => !subject.exam_date);
        if (examless) {
            recs.push({
                title: 'Ajuste de planeamento',
                message: `Define a data de prova de ${examless.subject.name} para eu distribuir carga semanal e cronograma com mais precisao.`
            });
        } else {
            recs.push({
                title: 'Execucao',
                message: 'Fecha o dia com revisao ativa de 10 a 15 minutos e 3 perguntas-chave da materia principal.'
            });
        }

        return recs;
    },

    // Retorna analise simples do progresso e plano de acao
    async analyzeProgress() {
        const subjects = await safeGetSubjects();
        const sessions = await safeGetSessions();
        if (!subjects.length) {
            return {
                message: 'Ainda nao ha dados suficientes para analisar o progresso.',
                plan: 'Adicione materias e atualize o progresso para eu conseguir apontar prioridades reais.',
                next: 'Proximo passo: cadastrar disciplinas, data de prova e carga horaria.'
            };
        }

        const total = subjects.length;
        const avg = total ? Math.round(subjects.reduce((sum, item) => sum + Number(item.progress || 0), 0) / total) : 0;
        const completed = sessions.filter((session) => session.completed).length;
        const ranked = subjects
            .map((subject) => ({ subject, priority: getSubjectPriority(subject) }))
            .sort((a, b) => b.priority.score - a.priority.score);

        const strongest = [...ranked].sort((a, b) => b.priority.progress - a.priority.progress)[0];
        const weakest = [...ranked].sort((a, b) => a.priority.progress - b.priority.progress)[0];
        const urgentExam = ranked.find(({ priority }) => priority.daysLeft !== null && priority.daysLeft >= 0 && priority.daysLeft <= 14);
        const next = sessions
            .filter((session) => !session.completed && session.start_time && new Date(session.start_time) > new Date())
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

        const messageParts = [
            `Materias ativas: ${total}.`,
            `Progresso medio: ${avg}%.`,
            `Sessoes concluidas: ${completed}.`
        ];
        if (strongest) messageParts.push(`Melhor estado atual: ${getSubjectLabel(strongest.subject, strongest.priority)}.`);
        if (weakest) messageParts.push(`Maior risco: ${getSubjectLabel(weakest.subject, weakest.priority)}.`);

        const planParts = [];
        if (urgentExam) {
            planParts.push(`Prioridade imediata: reforcar ${urgentExam.subject.name} porque a prova esta em ${Math.max(urgentExam.priority.daysLeft, 0)} dia(s).`);
        }
        if (weakest && (!urgentExam || urgentExam.subject.id !== weakest.subject.id)) {
            planParts.push(`Recuperacao: reservar um bloco forte para ${weakest.subject.name} e subir o progresso acima de 50%.`);
        }
        const missingExam = ranked.filter(({ subject }) => !subject.exam_date).slice(0, 2);
        if (missingExam.length) {
            planParts.push(`Planeamento pendente: definir data de prova para ${missingExam.map(({ subject }) => subject.name).join(' e ')}.`);
        }
        if (!planParts.length) {
            planParts.push('Plano sugerido: manter 3 blocos semanais para as materias prioritarias e fechar cada bloco com revisao ativa.');
        }

        let nextInfo = 'Sem proximas sessoes agendadas.';
        if (next) {
            const nextLabel = next.name || next.title || next.subject_id || 'Sessao de estudo';
            nextInfo = `Proxima sessao: ${nextLabel} em ${new Date(next.start_time).toLocaleString()}.`;
        } else if (urgentExam) {
            nextInfo = `Acao seguinte: agendar hoje um bloco para ${urgentExam.subject.name}.`;
        }

        return { message: messageParts.join(' '), plan: planParts.join(' '), next: nextInfo };
    },

    async generateQuiz(targetSubjectName = null) {
        const subjects = await safeGetSubjects();
        if (!subjects.length && !targetSubjectName) {
            throw new Error('Adicione pelo menos uma materia para eu gerar um quiz com contexto util.');
        }

        const requestedOptions = targetSubjectName && typeof targetSubjectName === 'object'
            ? targetSubjectName
            : { subjectName: targetSubjectName };
        const fallbackSubject = subjects.length
            ? [...subjects]
                .map((subject) => ({ subject, priority: getSubjectPriority(subject) }))
                .sort((a, b) => b.priority.score - a.priority.score)[0]?.subject
            : null;
        const chosenSubjectName = requestedOptions.subjectName || fallbackSubject?.name || 'Estudos Gerais';
        const topicSuggestions = getSuggestedQuizTopics(chosenSubjectName);
        const chosenTopic =
            requestedOptions.topic
            || (requestedOptions.random ? topicSuggestions[Math.floor(Math.random() * topicSuggestions.length)] : null);
        const requestText = chosenTopic
            ? `quiz de ${chosenSubjectName} sobre ${chosenTopic}`
            : (chosenSubjectName || 'quiz de 5 perguntas');
        const request = extractQuizRequest(requestText || fallbackSubject?.name || 'quiz de 5 perguntas', subjects);
        const questions = buildQuizQuestions(request.subject, request.topic, request.questionCount);
        const createdAt = new Date().toISOString();

        const quiz = {
            id: `quiz_${Date.now()}`,
            title: `Quiz de ${request.subject}`,
            subject: request.subject,
            topic: request.topic,
            questionCount: questions.length,
            createdAt,
            source: 'assistant',
            questions
        };

        persistGeneratedQuiz(quiz);
        emitGeneratedQuizCreated(quiz);
        return quiz;
    },

    async getSubjectStatus(subjectNameText) {
        const subjects = await safeGetSubjects();
        if (!subjects.length) return 'Voce ainda nao tem materias cadastradas.';

        const matched = findMentionedSubject(subjectNameText, subjects);
        if (!matched) return 'Nao consegui identificar a materia. Escreva o nome exato para eu analisar.';

        const progress = Number(matched.progress || 0);
        const hours = Number(matched.total_hours || 0);
        const exam = matched.exam_date ? `Prova em ${matched.exam_date}.` : 'Sem data de prova definida.';
        chatState.lastSubjectId = matched.id;

        return `Materia: ${matched.name}. Progresso atual: ${progress}%. Carga planejada: ${formatHoursWithMinutes(hours)}. ${exam}`;
    },

    async buildStudyPlanFromPrompt(rawText) {
        const subjects = await safeGetSubjects();
        const matched = findMentionedSubject(rawText, subjects);
        const extractedName = extractSubjectName(rawText);
        const subjectName = matched?.name || extractedName || 'a sua materia';
        const availability = parseAvailability(rawText);

        let examDate = toIsoDate(rawText) || matched?.exam_date || null;
        if (!examDate) {
            return `Consigo montar o plano para ${subjectName}, mas preciso da data do exame. Exemplo: 20/02/2026.`;
        }

        const daysLeft = daysBetweenTodayAnd(examDate);
        if (daysLeft <= 0) {
            return `A data ${examDate} ja passou ou e hoje. Envia uma nova data de exame futura para eu montar o plano.`;
        }

        const targetLoadHours = extractTargetLoadHours(rawText);
        const defaultHours = getDefaultHoursByTimeWindow(daysLeft);
        const totalHours = targetLoadHours || Number(matched?.total_hours || 0) || defaultHours;
        const weeksLeft = Math.max(daysLeft / 7, 0.14);
        const capacityUntilExam = availability.weeklyHours ? availability.weeklyHours * weeksLeft : null;

        let plan = buildPlanText({
            subjectName,
            examDate,
            daysLeft,
            totalHours,
            availability,
            capacityUntilExam
        });

        const eventResult = await tryCreateExamEvent({
            subjectName,
            examDate,
            subjectId: matched?.id || null
        });
        if (eventResult.ok) {
            plan += `\n\nA data do exame (${examDate}) foi adicionada ao cronograma com sucesso.`;
        } else {
            plan += `\n\nNao consegui adicionar automaticamente no cronograma, mas o plano ja esta pronto.`;
        }

        if (typeof capacityUntilExam === 'number' && capacityUntilExam < totalHours) {
            return `${plan}\n\nAlerta: com a disponibilidade informada, pode faltar tempo para cobrir as ${formatHoursWithMinutes(totalHours)}. Posso te sugerir uma versao otimizada por prioridade de topicos.`;
        }

        return plan;
    },

    // Responde mensagens por intencao em linguagem natural
    async chatResponder(text) {
        const raw = String(text || '').trim();
        const t = normalizeText(raw);
        if (!t) return 'Me diz o que voce precisa e eu te ajudo.';

        if (chatState.awaitingSubjectName) {
            try {
                return await addSubjectFromNaturalText(raw, raw);
            } catch (e) {
                return `Falha ao adicionar materia: ${e.message || e}`;
            }
        }

        if (t === 'comandos' || t === 'help' || t === 'ajuda') {
            return [
                'Comandos disponiveis:',
                '- recomendacoes',
                '- analisar',
                '- quiz',
                '- proxima sessao',
                '- adicionar <Nome> | <horas> | <AAAA-MM-DD>'
            ].join('\n');
        }

        if (includesAny(t, ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'])) {
            return getGreetingReply();
        }

        if (includesAny(t, ['o que voce faz', 'como voce pode ajudar', 'o que podes fazer'])) {
            return getCapabilityReply();
        }

        const wantsToAddSubject =
            includesAny(t, ['adicionar', 'criar', 'incluir', 'cadastrar', 'registar', 'registrar']) &&
            includesAny(t, ['materia', 'disciplina', 'assunto']);

        if (wantsToAddSubject || t.startsWith('add ')) {
            try {
                return await addSubjectFromNaturalText(raw);
            } catch (e) {
                return `Falha ao adicionar materia: ${e.message || e}`;
            }
        }

        if (includesAny(t, ['pomodoro'])) {
            return 'Pomodoro: 25 minutos de estudo focado + 5 minutos de pausa. A cada 4 ciclos, faca uma pausa longa de 15-30 minutos.';
        }

        if (includesAny(t, ['recomend', 'sugere', 'sugestao', 'o que estudar hoje'])) {
            const recs = await this.getRecommendations();
            return recs.map((r) => `${r.title}: ${r.message}`).slice(0, 4).join('\n\n');
        }

        if (includesAny(t, ['analise', 'progresso geral', 'como estou', 'resumo do progresso'])) {
            const an = await this.analyzeProgress();
            return `${an.message}\n\n${an.plan}\n\n${an.next}`;
        }

        if (includesAny(t, ['plano de estudo', 'plano para', 'organizar estudo', 'cronograma de estudo'])) {
            return this.buildStudyPlanFromPrompt(raw);
        }

        if (includesAny(t, ['progresso da materia', 'status da materia', 'como esta a materia', 'como esta minha materia'])) {
            return this.getSubjectStatus(raw);
        }

        if (includesAny(t, ['quiz', 'pergunta de revisao', 'teste rapido'])) {
            const q = await this.generateQuiz(raw);
            return `Criei um quiz de ${q.questionCount} perguntas de ${q.subject} sobre ${q.topic}. Ele ja esta disponivel em Ferramentas > Quizzes.`;
        }

        if (includesAny(t, ['cronograma', 'proxima sessao', 'proxima revisao', 'sessoes'])) {
            const sessions = await safeGetSessions();
            const next = sessions
                .filter((s) => !s.completed && new Date(s.start_time) > new Date())
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
            if (next) return `Proxima sessao: ${next.name || next.subject_id} - ${new Date(next.start_time).toLocaleString()} (${formatHours(next.duration || 0)})`;
            return 'Nenhuma sessao futura encontrada.';
        }

        const subjects = await safeGetSubjects();
        const subjectMention = findMentionedSubject(raw, subjects);
        if (subjectMention) {
            const progress = Number(subjectMention.progress || 0);
            chatState.lastSubjectId = subjectMention.id;
            return `Entendi que voce quer falar sobre ${subjectMention.name}. Progresso atual: ${progress}%. Se quiser, eu posso gerar um quiz ou sugerir um plano curto para essa materia.`;
        }

        return 'Entendi. Posso te ajudar com recomendacoes, analise de progresso, quiz, cronograma ou cadastro de materia. Se quiser, escreva de forma natural o que voce precisa.';
    }
};

export default aiLocal;
