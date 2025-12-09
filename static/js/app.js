// HomeFiles - JavaScript functionality

// Global variables
let files = [];
let isLoading = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupDragAndDrop();
    loadFiles();
    
    // Auto-refresh every 30 seconds
    if (!window.PUBLIC_MODE) {
        setInterval(loadFiles, 30000);
    }
}

// API functions
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || error.message || 'Request failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

async function loadFiles() {
    if (isLoading) return;
    
    isLoading = true;
    showLoading();
    
    try {
        const data = await apiRequest('/api/files');
        files = data;
        renderFiles();
        updateFilesCount();
    } catch (error) {
        showToast('Ошибка загрузки файлов: ' + error.message, 'error');
        renderEmptyState();
    } finally {
        isLoading = false;
        hideLoading();
    }
}

async function addFile() {
    const filePath = document.getElementById('filePath').value.trim();
    
    if (!filePath) {
        showToast('Введите путь к файлу', 'warning');
        return;
    }
    
    try {
        const result = await apiRequest('/api/add-file', {
            method: 'POST',
            body: JSON.stringify({ path: filePath })
        });
        
        showToast(result.message, 'success');
        closeDialog('addFileDialog');
        document.getElementById('filePath').value = '';
        loadFiles();
    } catch (error) {
        showToast('Ошибка добавления файла: ' + error.message, 'error');
    }
}

async function removeFile(fileId) {
    if (!confirm('Удалить файл из общего доступа?')) {
        return;
    }
    
    try {
        const result = await apiRequest(`/api/remove-file/${fileId}`, {
            method: 'DELETE'
        });
        
        showToast(result.message, 'success');
        loadFiles();
    } catch (error) {
        showToast('Ошибка удаления файла: ' + error.message, 'error');
    }
}

function downloadFile(fileId) {
    if (window.PUBLIC_MODE) {
        window.open(`/download/${fileId}`, '_blank');
    } else {
        window.open(`/download/${fileId}`, '_blank');
    }
}

function downloadFolder(fileId) {
    if (window.PUBLIC_MODE) {
        window.open(`/download-folder/${fileId}`, '_blank');
    } else {
        window.open(`/download-folder/${fileId}`, '_blank');
    }
}

// File upload functionality
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    if (!uploadArea) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'), false);
    });
    
    uploadArea.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadFile(file);
    }
}

async function uploadFile(file) {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    const progressContainer = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadArea = document.getElementById('uploadArea');
    
    // Show progress
    uploadArea.style.display = 'none';
    progressContainer.style.display = 'block';
    
    try {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
                uploadStatus.textContent = `Загрузка... ${Math.round(percentComplete)}%`;
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200 || xhr.status === 201) {
                const result = JSON.parse(xhr.responseText);
                showToast(result.message, 'success');
                closeDialog('uploadDialog');
                
                // Reset form
                document.getElementById('fileInput').value = '';
                progressFill.style.width = '0%';
                
                // Обновляем список файлов в любом режиме
                loadFiles();
            } else {
                const error = JSON.parse(xhr.responseText);
                throw new Error(error.error || 'Upload failed');
            }
        });
        
        xhr.addEventListener('error', () => {
            throw new Error('Network error during upload');
        });
        
        xhr.open('POST', '/upload');
        xhr.send(formData);
        
    } catch (error) {
        showToast('Ошибка загрузки: ' + error.message, 'error');
        resetUploadForm();
    }
}

function resetUploadForm() {
    const progressContainer = document.getElementById('uploadProgress');
    const uploadArea = document.getElementById('uploadArea');
    const progressFill = document.getElementById('progressFill');
    
    progressContainer.style.display = 'none';
    uploadArea.style.display = 'block';
    progressFill.style.width = '0%';
    document.getElementById('fileInput').value = '';
}

// UI Functions
function renderFiles() {
    const filesGrid = document.getElementById('filesGrid');
    
    if (!files || files.length === 0) {
        renderEmptyState();
        return;
    }
    
    filesGrid.innerHTML = files.map(file => createFileCard(file)).join('');
}

function createFileCard(file) {
    const iconClass = file.type === 'folder' ? 'folder' : '';
    const missingClass = !file.exists ? 'missing' : '';
    
    return `
        <div class="file-item ${missingClass}" data-file-id="${file.id}">
            <div class="file-header">
                <div class="file-icon ${iconClass}">
                    <span class="material-icons">${file.icon}</span>
                </div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-meta">
                        <span>Добавлен: ${formatDate(file.added_date)}</span>
                        ${file.modified ? `<span>Изменен: ${file.modified}</span>` : ''}
                        ${file.size ? `<span>Размер: ${formatFileSize(file.size)}</span>` : ''}
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                ${window.PUBLIC_MODE ? '' : `
                    <button class="btn btn-outline" onclick="removeFile(${file.id})" title="Удалить из общего доступа">
                        <span class="material-icons">delete</span>
                        Удалить
                    </button>
                `}
                ${file.type === 'folder' ? `
                    <button class="btn btn-primary" onclick="downloadFolder(${file.id})" title="Скачать как ZIP">
                        <span class="material-icons">archive</span>
                        Скачать ZIP
                    </button>
                ` : `
                    <button class="btn btn-primary" onclick="downloadFile(${file.id})" title="Скачать файл">
                        <span class="material-icons">download</span>
                        Скачать
                    </button>
                `}
            </div>
        </div>
    `;
}

function renderEmptyState() {
    const filesGrid = document.getElementById('filesGrid');
    
    filesGrid.innerHTML = `
        <div class="empty-state">
            <span class="material-icons">folder_open</span>
            <h3>Нет доступных файлов</h3>
            <p>Добавьте файлы или папки для совместного использования</p>
            ${!window.PUBLIC_MODE ? '<button class="btn btn-primary" onclick="showAddFileDialog()">Добавить первый файл</button>' : ''}
        </div>
    `;
}

function showLoading() {
    const filesGrid = document.getElementById('filesGrid');
    filesGrid.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Загрузка файлов...</p>
        </div>
    `;
}

function hideLoading() {
    // Loading will be hidden by renderFiles or renderEmptyState
}

function updateFilesCount() {
    const filesCountElement = document.getElementById('filesCount');
    if (filesCountElement && files) {
        const count = files.filter(f => f.exists).length;
        filesCountElement.textContent = `${count} файл${getRussianPlural(count, ['ов', '', 'а'])}`;
    }
}

function getRussianPlural(number, forms) {
    const absNumber = Math.abs(number);
    const lastDigit = absNumber % 10;
    const lastTwoDigits = absNumber % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return forms[0]; // файлов
    }
    
    if (lastDigit === 1) {
        return forms[1]; // файл
    }
    
    if (lastDigit >= 2 && lastDigit <= 4) {
        return forms[2]; // файла
    }
    
    return forms[0]; // файлов
}

// Dialog functions
function showAddFileDialog() {
    showDialog('addFileDialog');
}

function showUploadDialog() {
    showDialog('uploadDialog');
    resetUploadForm();
}

function showDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog) {
        dialog.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus first input if exists
        const firstInput = dialog.querySelector('input, button');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

function closeDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog) {
        dialog.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Reset form if it's upload dialog
        if (dialogId === 'uploadDialog') {
            resetUploadForm();
        }
    }
}

// Close dialog when clicking outside
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('dialog-overlay')) {
        closeDialog(event.target.id);
    }
});

// Close dialog with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const openDialog = document.querySelector('.dialog-overlay[style*="flex"]');
        if (openDialog) {
            closeDialog(openDialog.id);
        }
    }
});

// Utility functions
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function browseFile() {
    // Note: This is a placeholder since browsers can't directly access local file system
    // In a real implementation, you might use Electron or similar for file browsing
    showToast('Функция просмотра файлов недоступна в браузере. Введите путь вручную.', 'info');
}

// Toast notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };
    
    toast.innerHTML = `
        <span class="material-icons">${iconMap[type] || 'info'}</span>
        <span>${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: inherit; margin-left: auto; cursor: pointer;">
            <span class="material-icons" style="font-size: 1rem;">close</span>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// Refresh function for admin interface
function refreshFiles() {
    loadFiles();
    showToast('Список файлов обновлен', 'info');
}

// File path input helper
function setupFilePathInput() {
    const filePathInput = document.getElementById('filePath');
    if (!filePathInput) return;
    
    // Add paste handler for file paths
    filePathInput.addEventListener('paste', function(event) {
        setTimeout(() => {
            const pastedText = this.value.trim();
            // Convert backslashes to forward slashes for consistency
            this.value = pastedText.replace(/\\/g, '/');
        }, 10);
    });
    
    // Auto-complete common paths
    filePathInput.addEventListener('input', function() {
        // This could be enhanced with actual path completion
        // For now, just ensure proper path formatting
        const value = this.value;
        if (value && !value.includes('://') && !value.startsWith('/')) {
            // Ensure Windows paths start with drive letter or Unix paths start with /
            if (!/^[A-Za-z]:/.test(value) && !value.startsWith('/')) {
                this.value = '/' + value;
            }
        }
    });
}

// Initialize file path input when add file dialog is shown
document.addEventListener('DOMContentLoaded', function() {
    const addFileDialog = document.getElementById('addFileDialog');
    if (addFileDialog) {
        addFileDialog.addEventListener('show', setupFilePathInput);
    }
});

// Функция завершения работы сервера
async function shutdownServer() {
    if (!confirm('Вы уверены, что хотите завершить работу сервера HomeFiles?')) {
        return;
    }
    
    try {
        showToast('Завершение работы сервера...', 'info');
        
        // Отправляем запрос на завершение работы
        await apiRequest('/shutdown', {
            method: 'POST'
        });
        
        // Показываем сообщение о завершении работы
        showToast('Сервер завершает работу. Страница будет перезагружена...', 'success');
        
        // Перезагружаем страницу через 3 секунды
        setTimeout(() => {
            window.location.reload();
        }, 3000);
        
    } catch (error) {
        console.error('Ошибка при завершении работы сервера:', error);
        showToast('Ошибка при завершении работы сервера', 'error');
    }
}