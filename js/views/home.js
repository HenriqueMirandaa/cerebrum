import api from '../api.js';
import { formatHours, formatDate, daysBetween, todayISO } from '../utils/helpers.js';
import * as db from '../data.js';

async function renderHome() {
    // Show loading state
    document.getElementById('view').innerHTML = `
        <div class="flex items-center justify-center h-64">
            <div class="loading-spinner"></div>
        </div>
    `;

    try {
        // Fetch data with fallback to local storage
        let materias, stats, recommendations = [];

        try {
            // Try to fetch from API first
            [materias, stats] = await Promise.all([
                api.getMinhasMaterias(),
                api.getStats()
            ]);

            // Store in IndexedDB for offline access
            await Promise.all(materias.map(async materia => {
                await db.updateSubject(materia);
                // Store progress separately
                if (typeof materia.progress === 'number') {
                    await db.updateProgress(materia.id, materia.progress);
                }
            }));

            // Try to get AI recommendations if online
            try {
                recommendations = await api.getRecommendations();
            } catch (e) {
                console.warn('AI recommendations not available:', e);
                recommendations = [];
            }
        } catch (error) {
            console.warn('Failed to fetch from API, using local data:', error);
            
            // Fallback to IndexedDB
            materias = await db.getSubjects();
            
            // Get progress for each subject
            await Promise.all(materias.map(async materia => {
                try {
                    const progress = await db.getProgress(materia.id);
                    if (progress) {
                        materia.progress = progress.progress;
                    }
                } catch (e) {
                    console.warn(`Failed to get progress for subject ${materia.id}:`, e);
                }
            }));

            // Calculate stats locally
            const sessions = await db.getSessions();
            stats = {
                totalHours: materias.reduce((sum, m) => sum + m.total_hours, 0),
                completedHours: sessions
                    .filter(s => s.completed)
                    .reduce((sum, s) => sum + s.duration, 0),
                activeSubjects: materias.length,
                upcomingExams: materias
                    .filter(m => daysBetween(todayISO(), m.exam_date) > 0)
                    .length
            };
        }

        // Calculate additional stats
        const totalHours = materias.reduce((acc, m) => acc + m.total_hours, 0);
        const completedHours = materias.reduce((acc, m) => acc + (m.total_hours * (m.progress || 0) / 100), 0);
        const completionRate = totalHours ? Math.round((completedHours / totalHours) * 100) : 0;
        
        // Find next exam
        const today = todayISO();
        const nextExam = materias
            .filter(m => daysBetween(today, m.exam_date) > 0)
            .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))[0];
        
        const upcomingExamDays = nextExam ? daysBetween(today, nextExam.exam_date) : null;

        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2">Bem-vindo de volta!</h2>
                <p class="text-gray-600">Continue sua jornada de aprendizado.</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Progresso Geral</h3>
                        <i class="fas fa-tasks ${completionRate > 70 ? 'text-green-500' : completionRate > 40 ? 'text-yellow-500' : 'text-red-500'}"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${completionRate}%</div>
                    <div class="progress-bar mb-2">
                        <div class="progress-fill" style="width: ${completionRate}%"></div>
                    </div>
                    ${upcomingExamDays ? `
                        <div class="text-sm text-gray-500">${upcomingExamDays} dias até a próxima prova</div>
                    ` : `
                        <div class="text-sm text-gray-500">Nenhuma prova agendada</div>
                    `}
                </div>
                
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Horas Estudadas</h3>
                        <i class="fas fa-clock text-blue-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${formatHours(completedHours)}</div>
                    <div class="text-sm text-gray-500">${formatHours(totalHours)} planejadas no total</div>
                </div>
                
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Disciplinas Ativas</h3>
                        <i class="fas fa-book text-purple-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${materias.length}</div>
                    <div class="text-sm text-gray-500">disciplinas em andamento</div>
                </div>
            </div>

            ${materias.length > 0 ? `
                <div class="mb-8">
                    <h3 class="text-xl font-bold mb-4">Suas Disciplinas</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${materias.map(materia => `
                            <div class="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                                <div class="flex items-center mb-3">
                                    <i class="${materia.icon || 'fas fa-book'} text-lg mr-3" style="color: ${materia.color}"></i>
                                    <h4 class="font-semibold">${materia.name}</h4>
                                </div>
                                <div class="progress-bar mb-2">
                                    <div class="progress-fill" style="width: ${materia.progress || 0}%; background-color: ${materia.color}"></div>
                                </div>
                                <div class="text-sm text-gray-500">
                                    ${formatHours(materia.total_hours)} • ${formatDate(materia.exam_date)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : `
                <div class="text-center py-12">
                    <div class="text-gray-400 mb-4">
                        <i class="fas fa-books text-4xl"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Nenhuma disciplina ainda</h3>
                    <p class="text-gray-600 mb-4">Comece adicionando suas disciplinas de estudo</p>
                    <button onclick="window.router.navigate('/adicionar')" class="btn btn-primary">
                        Adicionar Disciplina
                    </button>
                </div>
            `}

            ${recommendations.length > 0 ? `
                <div>
                    <h3 class="text-xl font-bold mb-4">Recomendações do Assistente</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${recommendations.map(rec => `
                            <div class="p-4 bg-white rounded-lg shadow">
                                <div class="flex items-center mb-2">
                                    <i class="fas fa-lightbulb text-yellow-500 mr-3"></i>
                                    <h4 class="font-semibold">${rec.title}</h4>
                                </div>
                                <p class="text-gray-600 text-sm">${rec.description}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${api.offline ? `
                <div class="fixed bottom-4 right-4 px-4 py-2 bg-yellow-50 text-yellow-800 rounded-lg shadow-lg flex items-center">
                    <i class="fas fa-wifi-slash mr-2"></i>
                    <span>Modo Offline</span>
                </div>
            ` : ''}
        `;

    } catch (error) {
        console.error('Error rendering home:', error);
        document.getElementById('view').innerHTML = `
            <div class="text-center py-12">
                <div class="text-red-500 mb-4">
                    <i class="fas fa-exclamation-circle text-4xl"></i>
                </div>
                <h3 class="text-xl font-semibold mb-2">Erro ao carregar dados</h3>
                <p class="text-gray-600 mb-4">${error.message || 'Tente novamente mais tarde'}</p>
                <button onclick="location.reload()" class="btn btn-primary">
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

export default renderHome;
