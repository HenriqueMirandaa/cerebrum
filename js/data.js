// Database Configuration
const DB_NAME = 'cerebrum_db';
const DB_VERSION = 1;

// Database connection
let db = null;

// Database initialization
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(request.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create object stores
            if (!db.objectStoreNames.contains('subjects')) {
                db.createObjectStore('subjects', { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains('sessions')) {
                db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains('progress')) {
                db.createObjectStore('progress', { keyPath: 'subject_id' });
            }

            if (!db.objectStoreNames.contains('stats')) {
                db.createObjectStore('stats', { keyPath: 'id' });
            }
        };
    });
}

// Generic database operations
function getStore(storeName, mode = 'readonly') {
    if (!db) throw new Error('Database not initialized');
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
}

async function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addToStore(storeName, item) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.add(item);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateInStore(storeName, item) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.put(item);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromStore(storeName, key) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Specific data operations
export async function getSubjects() {
    return getAllFromStore('subjects');
}

export async function addSubject(subject) {
    return addToStore('subjects', subject);
}

export async function updateSubject(subject) {
    return updateInStore('subjects', subject);
}

export async function deleteSubject(id) {
    return deleteFromStore('subjects', id);
}

export async function getSessions() {
    return getAllFromStore('sessions');
}

export async function addSession(session) {
    return addToStore('sessions', session);
}

export async function updateSession(session) {
    return updateInStore('sessions', session);
}

export async function deleteSession(id) {
    return deleteFromStore('sessions', id);
}

export async function getProgress(subject_id) {
    return new Promise((resolve, reject) => {
        const store = getStore('progress');
        const request = store.get(subject_id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function updateProgress(subject_id, progress) {
    return updateInStore('progress', { subject_id, progress });
}

export async function getStats() {
    return new Promise((resolve, reject) => {
        const store = getStore('stats');
        const request = store.get(1);

        request.onsuccess = () => resolve(request.result || { id: 1 });
        request.onerror = () => reject(request.error);
    });
}

export async function updateStats(stats) {
    return updateInStore('stats', { id: 1, ...stats });
}

export async function getSubject(id) {
    return new Promise((resolve, reject) => {
        const store = getStore('subjects');
        const request = store.get(typeof id === 'number' ? id : id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function markSubjectCompleted(subject_id) {
    const subj = await getSubject(subject_id);
    if (!subj) return null;
    subj.completed = true;
    return updateSubject(subj);
}

// Initialize database on module load
initDB().catch(console.error);
