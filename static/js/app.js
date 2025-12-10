// HomeFiles - JavaScript functionality

// Global variables
let files = [];
let isLoading = false;
let currentFolder = null; // ID текущей папки, null означает корневую папку

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupDragAndDrop();
    loadFiles();
    
    // Auto-refresh removed - files update only on page load or manual refresh
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
        
        // Если текущая папка не существует, возвращаемся к корню
        if (currentFolder !== null) {
            const currentFolderExists = findFileById(files, currentFolder);
            if (!currentFolderExists) {
                currentFolder = null;
            }
        }
        
        console.log('Загружены файлы:', files.length);
        console.log('Текущая папка:', currentFolder);
        
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
    // fileId может быть числом (основные файлы) или строкой (файлы в папках)
    const url = `/download/${fileId}`;
    window.open(url, '_blank');
}

function downloadFolder(fileId) {
    if (window.PUBLIC_MODE) {
        window.open(`/download-folder/${fileId}`, '_blank');
    } else {
        window.open(`/download-folder/${fileId}`, '_blank');
    }
}

// Expanded folders state removed - replaced with folder navigation

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
    const filesTableBody = document.getElementById('filesTableBody');
    
    if (!files || files.length === 0) {
        renderEmptyState();
        return;
    }
    
    // Определяем какие файлы показывать
    let filesToShow = files;
    
    if (currentFolder !== null) {
        // Ищем текущую папку и показываем её содержимое
        const currentFolderData = findFileByIdRecursively(files, currentFolder);
        if (currentFolderData && currentFolderData.type === 'folder') {
            filesToShow = currentFolderData.contents || [];
        } else {
            // Если папка не найдена, возвращаемся к корню
            console.warn('Папка не найдена, возвращаемся к корню:', currentFolder);
            currentFolder = null;
        }
    }
    
    const tableRows = [];
    
    // Добавляем кнопку "Назад" если мы не в корневой папке
    if (currentFolder !== null) {
        const backButton = `
            <tr class="file-row back-folder" onclick="goBack()">
                <td class="name-cell">
                    <div class="name-cell-content" style="padding-left: 12px;">
                        <div class="file-icon folder">
                            <span class="material-icons">arrow_back</span>
                        </div>
                        <div class="file-info">
                            <div class="file-name">Назад</div>
                            <div class="file-path">Вернуться к предыдущей папке</div>
                        </div>
                    </div>
                </td>
                <td class="size-cell">-</td>
                <td class="date-cell">-</td>
                <td class="actions-cell">
                    <div class="action-buttons">
                        <button class="btn btn-outline" onclick="event.stopPropagation(); goBack()" title="Вернуться к предыдущей папке">
                            <span class="material-icons">arrow_back</span>
                            Назад
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tableRows.push(backButton);
    }
    
    // Создаем строки для файлов и папок
    filesToShow.forEach(file => {
        tableRows.push(createTableRow(file, 0, false, currentFolder));
    });
    
    filesTableBody.innerHTML = tableRows.join('');
    
    // Обновляем навигационную панель
    updateNavigationBar();
}

function createTableRow(file, indentLevel = 0, isSubFile = false, parentFolderId = null) {
    const iconClass = file.type === 'folder' ? 'folder' : '';
    const missingClass = !file.exists ? 'missing' : '';
    const indentClass = isSubFile ? 'sub-file' : '';
    
    // Calculate indentation
    const paddingLeft = (indentLevel * 20) + 12;
    
    // Для папок показываем кнопку "Открыть"
    const openButton = file.type === 'folder' ? `
        <button class="expand-btn" onclick="openFolder('${file.id}')" title="Открыть папку">
            <span class="material-icons">folder_open</span>
        </button>
    ` : '';
    
    // Download button based on file type
    const downloadButton = file.type === 'folder' ? `
        <button class="btn btn-primary" onclick="downloadFolder('${file.id}')" title="Скачать как ZIP">
            <span class="material-icons">archive</span>
            Скачать
        </button>
    ` : `
        <button class="btn btn-primary" onclick="downloadFile('${file.id}')" title="Скачать файл">
            <span class="material-icons">download</span>
            Скачать
        </button>
    `;
    
    // Remove button for admin mode
    const removeButton = window.PUBLIC_MODE ? '' : `
        <button class="btn btn-outline" onclick="removeFile('${file.id}')" title="Удалить из общего доступа">
            <span class="material-icons">delete</span>
            Удалить
        </button>
    `;
    
    return `
        <tr class="file-row ${missingClass} ${indentClass}" data-file-id="${file.id}" data-parent-folder="${parentFolderId || ''}">
            <td class="name-cell">
                <div class="name-cell-content" style="padding-left: ${paddingLeft}px;">
                    ${openButton}
                    <div class="file-icon ${iconClass}">
                        <span class="material-icons">${file.icon}</span>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-path">${escapeHtml(file.path)}</div>
                    </div>
                </div>
            </td>
            <td class="size-cell">
                ${file.size ? formatFileSize(file.size) : '-'}
            </td>
            <td class="date-cell">
                ${file.modified ? file.modified : formatDate(file.added_date)}
            </td>
            <td class="actions-cell">
                <div class="action-buttons">
                    ${removeButton}
                    ${downloadButton}
                </div>
            </td>
        </tr>
    `;
}

function openFolder(folderId) {
    // Ищем папку в текущем контексте
    let searchContext = files;
    
    // Если мы уже находимся в какой-то папке, ищем в её содержимом
    if (currentFolder !== null) {
        const currentFolderData = findFileByIdRecursively(files, currentFolder);
        if (currentFolderData && currentFolderData.type === 'folder') {
            searchContext = currentFolderData.contents || [];
        }
    }
    
    // Ищем папку в нужном контексте
    const folder = findFileInContext(searchContext, folderId);
    
    if (!folder) {
        console.warn('Папка не найдена в текущем контексте:', folderId);
        return;
    }
    
    if (folder.type !== 'folder') {
        console.warn('Элемент не является папкой:', folderId);
        return;
    }
    
    console.log('Открытие папки:', folderId, folder.name);
    
    // Переходим в папку
    currentFolder = folderId;
    
    // Перерисовываем таблицу
    renderFiles();
}

function goBack() {
    console.log('Возврат к предыдущей папке');
    currentFolder = null;
    renderFiles();
}

// Вспомогательная функция для поиска файла по ID в любой глубине
function findFileById(fileList, targetId) {
    for (const file of fileList) {
        if (file.id == targetId) {
            return file;
        }
        if (file.type === 'folder' && file.contents) {
            const found = findFileById(file.contents, targetId);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

// Вспомогательная функция для поиска файла по ID рекурсивно (альтернативное имя)
function findFileByIdRecursively(fileList, targetId) {
    return findFileById(fileList, targetId);
}

// Вспомогательная функция для поиска файла в конкретном контексте (без рекурсии)
function findFileInContext(fileList, targetId) {
    for (const file of fileList) {
        if (file.id == targetId) {
            return file;
        }
    }
    return null;
}

// Функция для обновления навигационной панели
function updateNavigationBar() {
    const navigationBar = document.getElementById('navigationBar');
    if (!navigationBar) return;
    
    // Создаем путь навигации
    let path = [];
    if (currentFolder !== null) {
        // Собираем полный путь от корня до текущей папки
        const folderPath = getFolderPath(files, currentFolder);
        path = folderPath || [];
    }
    
    // Создаем HTML для навигации
    let navigationHTML = '';
    
    if (currentFolder === null) {
        navigationHTML = '<span class="nav-current">Все файлы</span>';
    } else {
        navigationHTML = `
            <span class="nav-link" onclick="goToRoot()">Все файлы</span>
            <span class="nav-separator">›</span>
        `;
        
        path.forEach((folder, index) => {
            const isLast = index === path.length - 1;
            if (isLast) {
                navigationHTML += `<span class="nav-current">${escapeHtml(folder.name)}</span>`;
            } else {
                navigationHTML += `
                    <span class="nav-link" onclick="openFolderFromBreadcrumb('${folder.id}')">${escapeHtml(folder.name)}</span>
                    <span class="nav-separator">›</span>
                `;
            }
        });
    }
    
    navigationBar.innerHTML = navigationHTML;
}

// Вспомогательная функция для получения пути к папке
function getFolderPath(fileList, targetId, currentPath = []) {
    for (const file of fileList) {
        const newPath = [...currentPath, {id: file.id, name: file.name}];
        
        if (file.id == targetId) {
            return newPath;
        }
        
        if (file.type === 'folder' && file.contents) {
            const result = getFolderPath(file.contents, targetId, newPath);
            if (result) {
                return result;
            }
        }
    }
    return null;
}

function goToRoot() {
    currentFolder = null;
    renderFiles();
}

// Функция для открытия папки из навигационных ссылок (хлебные крошки)
function openFolderFromBreadcrumb(folderId) {
    // Проверяем, есть ли такая папка в системе
    const folder = findFileById(files, folderId);
    
    if (!folder) {
        console.warn('Папка не найдена при навигации из хлебных крошек:', folderId);
        return;
    }
    
    if (folder.type !== 'folder') {
        console.warn('Элемент не является папкой при навигации из хлебных крошек:', folderId);
        return;
    }
    
    console.log('Навигация к папке из хлебных крошек:', folderId, folder.name);
    
    // Переходим в папку
    currentFolder = folderId;
    
    // Перерисовываем таблицу
    renderFiles();
}

function renderEmptyState() {
    const filesTableBody = document.getElementById('filesTableBody');
    
    filesTableBody.innerHTML = `
        <tr>
            <td colspan="4" class="empty-state">
                <div class="empty-state-content">
                    <span class="material-icons">folder_open</span>
                    <h3>Нет доступных файлов</h3>
                    <p>Добавьте файлы или папки для совместного использования</p>
                    ${!window.PUBLIC_MODE ? '<button class="btn btn-primary" onclick="showAddFileDialog()">Добавить первый файл</button>' : ''}
                </div>
            </td>
        </tr>
    `;
}

function showLoading() {
    const filesTableBody = document.getElementById('filesTableBody');
    filesTableBody.innerHTML = `
        <tr>
            <td colspan="4" class="loading-cell">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Загрузка файлов...</p>
                </div>
            </td>
        </tr>
    `;
}

function hideLoading() {
    // Loading will be hidden by renderFiles or renderEmptyState
}

function updateFilesCount() {
    // Подсчитываем файлы в текущей папке или в корне
    let totalFiles = 0;
    let filesToCount = files;
    
    if (currentFolder !== null) {
        const currentFolderData = findFileByIdRecursively(files, currentFolder);
        if (currentFolderData && currentFolderData.type === 'folder') {
            filesToCount = currentFolderData.contents || [];
        } else {
            console.warn('Не удалось найти текущую папку для подсчета файлов:', currentFolder);
        }
    }
    
    filesToCount.forEach(file => {
        if (file.exists && file.type === 'file') {
            totalFiles++;
        }
    });
    
    // Обновляем отображение счетчика если элемент существует
    const filesCountElement = document.getElementById('filesCount');
    if (filesCountElement) {
        filesCountElement.textContent = `${totalFiles} файл${getRussianPlural(totalFiles, ['ов', '', 'а'])}`;
    }
    
    return totalFiles;
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

// Функция для отладки - показать состояние текущей папки
function showCurrentFolderState() {
    console.log('Текущая папка:', currentFolder);
    console.log('Основные папки:', files.filter(f => f.type === 'folder'));
    
    // Показываем содержимое текущей папки
    if (currentFolder !== null) {
        const currentFolderData = findFileByIdRecursively(files, currentFolder);
        console.log('Содержимое текущей папки:', currentFolderData ? currentFolderData.contents : 'Папка не найдена');
        
        // Показываем информацию о найденной папке
        if (currentFolderData) {
            console.log('Информация о папке:', {
                id: currentFolderData.id,
                name: currentFolderData.name,
                type: currentFolderData.type,
                contentsCount: currentFolderData.contents ? currentFolderData.contents.length : 0
            });
        }
    } else {
        console.log('Содержимое корневой папки:', files);
    }
}

// Добавляем глобальные функции для отладки (только в режиме разработки)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.showCurrentFolderState = showCurrentFolderState;
}

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