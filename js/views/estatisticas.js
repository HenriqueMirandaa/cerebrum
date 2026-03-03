import api from '../api.js';
import { formatHours, formatDate, showToast } from '../utils/helpers.js';

async function renderEstatisticas() {
    try {
        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2">Estatísticas de Estudo</h2>
                <p class="text-gray-600">Acompanhe seu progresso e desempenho.</p>
            </div>

            <div id="statsContainer">
                <div class="text-center py-12">
                    <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                    <p class="mt-4 text-gray-500">Carregando estatísticas...</p>
                </div>
            </div>
        `;

        // Carregar dados em paralelo
        const [materias, stats, sessions] = await Promise.all([
            api.getMinhasMaterias(),
            api.getStats(),
            api.getSessions()
        ]);

        // Calcular métricas
        const totalHours = materias.reduce((acc, m) => acc + m.total_hours, 0);
        const completedHours = materias.reduce((acc, m) => acc + (m.total_hours * m.progress / 100), 0);
        const completionRate = totalHours ? Math.round((completedHours / totalHours) * 100) : 0;
        
        const completedSessions = sessions.filter(s => s.completed);
        const totalStudyTime = completedSessions.reduce((acc, s) => acc + s.duration, 0);
        
        // Agrupar sessões por matéria
        const sessionsBySubject = sessions.reduce((acc, session) => {
            if (!acc[session.subject_id]) {
                acc[session.subject_id] = [];
            }
            acc[session.subject_id].push(session);
            return acc;
        }, {});

        document.getElementById('statsContainer').innerHTML = `
            <!-- Cards de métricas -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Matérias</h3>
                        <i class="fas fa-book text-purple-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${materias.length}</div>
                    <div class="text-sm text-gray-500">em andamento</div>
                </div>
                
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Progresso Geral</h3>
                        <i class="fas fa-chart-line text-green-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${completionRate}%</div>
                    <div class="text-sm text-gray-500">do plano concluído</div>
                </div>

                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Tempo Estudado</h3>
                        <i class="fas fa-clock text-blue-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${formatHours(totalStudyTime / 60)}</div>
                    <div class="text-sm text-gray-500">em ${completedSessions.length} sessões</div>
                </div>

                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Meta Diária</h3>
                        <i class="fas fa-bullseye text-red-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${formatHours(stats.dailyGoal || 2)}</div>
                    <div class="text-sm text-gray-500">horas por dia</div>
                </div>
            </div>

            <!-- Progresso por matéria -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-xl font-semibold mb-6">Progresso por Matéria</h3>
                    <div class="space-y-6">
                        ${materias.map(materia => `
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center">
                                        <i class="${materia.icon || 'fas fa-book'} text-lg mr-3" style="color: ${materia.color}"></i>
                                        <span class="font-medium">${materia.name}</span>
                                    </div>
                                    <span class="text-sm text-gray-500">
                                        ${formatHours(materia.total_hours * materia.progress / 100)} / ${formatHours(materia.total_hours)}
                                    </span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${materia.progress}%; background-color: ${materia.color}"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Sessões por matéria -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-xl font-semibold mb-6">Sessões de Estudo</h3>
                    ${materias.map(materia => {
                        const materiaaSessions = sessionsBySubject[materia.id] || [];
                        const completed = materiaaSessions.filter(s => s.completed).length;
                        const totalTime = materiaaSessions.reduce((acc, s) => acc + (s.completed ? s.duration : 0), 0);
                        
                        return `
                            <div class="mb-4 last:mb-0">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center">
                                        <i class="${materia.icon || 'fas fa-book'} text-lg mr-3" style="color: ${materia.color}"></i>
                                        <span class="font-medium">${materia.name}</span>
                                    </div>
                                    <div class="text-sm text-gray-500">
                                        ${formatHours(totalTime / 60)} em ${completed} sessões
                                    </div>
                                </div>
                                <div class="text-sm text-gray-500">
                                    Última sessão: ${materiaaSessions.length ? 
                                        formatDate(materiaaSessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0].start_time)
                                        : 'Nenhuma sessão'}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Gráficos -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Distribuição do tempo -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-xl font-semibold mb-6">Distribuição do Tempo</h3>
                    <div id="timeDistChart" class="h-64"></div>
                </div>

                <!-- Evolução do progresso -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-xl font-semibold mb-6">Evolução do Progresso</h3>
                    <div id="progressChart" class="h-64"></div>
                </div>
            </div>
        `;

        // Renderizar gráficos
        renderCharts(materias, sessions);

    } catch (error) {
        console.error('Error rendering estatisticas:', error);
        document.getElementById('statsContainer').innerHTML = `
            <div class="text-center py-12">
                <div class="text-red-500 mb-4">
                    <i class="fas fa-exclamation-circle text-4xl"></i>
                </div>
                <h3 class="text-xl font-semibold mb-2">Erro ao carregar estatísticas</h3>
                <p class="text-gray-600 mb-4">${error.message || 'Tente novamente mais tarde'}</p>
                <button onclick="location.reload()" class="btn btn-primary">
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

function renderCharts(materias, sessions) {
    // Distribuição do tempo por matéria
    const timeData = materias.map(m => {
        const materiaSessions = sessions.filter(s => s.subject_id === m.id && s.completed);
        return {
            name: m.name,
            value: materiaSessions.reduce((acc, s) => acc + s.duration, 0) / 60,
            color: m.color
        };
    });

    // Criar gráfico de pizza para distribuição do tempo
    const timeChart = new Chart(document.getElementById('timeDistChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: timeData.map(d => d.name),
            datasets: [{
                data: timeData.map(d => d.value),
                backgroundColor: timeData.map(d => d.color),
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                }
            }
        }
    });

    // Evolução do progresso (últimos 7 dias)
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push(date);
    }

    const progressData = materias.map(m => ({
        name: m.name,
        color: m.color,
        data: dates.map(date => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const daySessions = sessions.filter(s => 
                s.subject_id === m.id && 
                s.completed &&
                new Date(s.start_time) >= dayStart &&
                new Date(s.start_time) <= dayEnd
            );

            return daySessions.reduce((acc, s) => acc + s.duration, 0) / 60;
        })
    }));

    // Criar gráfico de linha para evolução do progresso
    const progressChart = new Chart(document.getElementById('progressChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: dates.map(d => d.toLocaleDateString('pt-BR', { weekday: 'short' })),
            datasets: progressData.map(d => ({
                label: d.name,
                data: d.data,
                borderColor: d.color,
                backgroundColor: `${d.color}20`,
                fill: true
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Horas Estudadas'
                    }
                }
            }
        }
    });
}

export default renderEstatisticas;
