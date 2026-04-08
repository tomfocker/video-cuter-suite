import { DB_NAME, DB_VERSION, setDb } from './state.js';

export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { 
            setDb(request.result); 
            resolve(request.result); 
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('workspaces')) {
                database.createObjectStore('workspaces', { keyPath: 'videoName' });
            }
        };
    });
}

export async function saveWorkspace(videoName, data) {
    const { db } = await import('./state.js');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workspaces'], 'readwrite');
        const store = transaction.objectStore('workspaces');
        const request = store.put({ videoName, ...data });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function loadWorkspace(videoName) {
    const { db } = await import('./state.js');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workspaces'], 'readonly');
        const store = transaction.objectStore('workspaces');
        const request = store.get(videoName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteWorkspace(videoName) {
    const { db } = await import('./state.js');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workspaces'], 'readwrite');
        const store = transaction.objectStore('workspaces');
        const request = store.delete(videoName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
