// Helper Functions
// Data manipulation and formatting utilities

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format date
export function formatDate(isoString) {
    const date = new Date(isoString + 'T00:00:00');
    return date.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Calculate days between dates
export function daysBetween(startISO, endISO) {
    const start = new Date(startISO + 'T00:00:00');
    const end = new Date(endISO + 'T00:00:00');
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Get today's date in ISO format
export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// Add days to an ISO date
export function addDaysISO(iso, days) {
    const date = new Date(iso + 'T00:00:00');
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

// Format decimal hours to human readable string
export function formatHours(decimalHours) {
    if (decimalHours == null || isNaN(decimalHours)) return '0 minutos';
    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (hours > 0) parts.push(hours === 1 ? '1 hora' : `${hours} horas`);
    if (minutes > 0) parts.push(minutes === 1 ? '1 minuto' : `${minutes} minutos`);
    if (parts.length === 0) return '0 minutos';
    return parts.join(' e ');
}

// Format minutes to human readable string
export function formatMinutes(totalMinutes) {
    if (totalMinutes == null || isNaN(totalMinutes)) return '0 minutos';
    const minutes = Math.round(totalMinutes);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const parts = [];
    if (hours > 0) parts.push(hours === 1 ? '1 hora' : `${hours} horas`);
    if (mins > 0) parts.push(mins === 1 ? '1 minuto' : `${mins} minutos`);
    if (parts.length === 0) return '0 minutos';
    return parts.join(' e ');
}

// Toast notification system
export function showToast(type, message, timeout = 4000) {
    try {
        // Use dashboard toast if available
        if (window.dashboard && typeof window.dashboard._showToast === 'function') {
            return window.dashboard._showToast(message, type, timeout);
        }

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.position = 'fixed';
            container.style.right = '20px';
            container.style.bottom = '20px';
            container.style.zIndex = 99999;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'info');
        toast.style.marginTop = '8px';
        toast.style.padding = '10px 14px';
        toast.style.borderRadius = '6px';
        toast.style.color = '#fff';
        toast.style.minWidth = '180px';
        toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
        if (type === 'success') toast.style.background = 'linear-gradient(90deg,#16a34a,#4ade80)';
        else if (type === 'error') toast.style.background = 'linear-gradient(90deg,#dc2626,#f87171)';
        else toast.style.background = 'linear-gradient(90deg,#2563eb,#60a5fa)';
        toast.textContent = message;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 300ms, transform 300ms';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
        }, timeout);
        return toast;
    } catch (err) {
        console.error('showToast error:', err);
        return null;
    }
}

// Task scheduling and statistics utilities
export function generateSchedule(subjects, fromDate) {
    const tasks = [];
    let taskId = 1;
    
    subjects.forEach(subject => {
        const days = daysBetween(fromDate, subject.exam_date);
        if (days <= 0) return;
        
        const hoursPerDay = Math.round((subject.total_hours / days) * 100) / 100;
        
        for (let i = 0; i < days; i++) {
            const date = addDaysISO(fromDate, i);
            tasks.push({ 
                id: taskId++, 
                subject_id: subject.id, 
                subject_name: subject.name, 
                date, 
                hours: hoursPerDay, 
                completed: false,
                color: subject.color,
                icon: subject.icon
            });
        }
    });
    
    return tasks;
}

export function getUpcomingTasks(tasks, limit = 5) {
    const today = todayISO();
    return tasks
        .filter(task => task.date >= today && !task.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, limit);
}

export function calculateStats(subjects, tasks) {
    if (!subjects.length) {
        return {
            totalHours: 0,
            avgHours: 0,
            closestExam: null,
            completionRate: 0,
            subjectCount: 0,
            upcomingExamDays: 0
        };
    }

    const totalHours = subjects.reduce((sum, sub) => sum + sub.total_hours, 0);
    const avgHours = (totalHours / subjects.length).toFixed(1);
    
    const closestExam = subjects.reduce((closest, sub) => {
        const daysToClosest = closest ? daysBetween(todayISO(), closest.exam_date) : Infinity;
        const daysToCurrent = daysBetween(todayISO(), sub.exam_date);
        return daysToCurrent < daysToClosest ? sub : closest;
    });
    
    const completedTasks = tasks.filter(task => task.completed).length;
    const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
    
    return {
        totalHours: Math.round(totalHours),
        avgHours,
        closestExam,
        completionRate,
        subjectCount: subjects.length,
        upcomingExamDays: closestExam ? daysBetween(todayISO(), closestExam.exam_date) : 0
    };
}