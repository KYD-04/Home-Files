#!/usr/bin/env python3
"""
HomeFiles - файловый сервер для локальной сети
Запуск: python run.py
"""

import os
import json
import zipfile
import tempfile
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for
from werkzeug.utils import secure_filename
import yaml
from datetime import datetime
from threading import Thread

# Конфигурация приложения
app = Flask(__name__)
# ГЛОБАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ public_app (ИСПРАВЛЕНИЕ)
public_app = Flask(__name__) 
app.config['SECRET_KEY'] = 'homefiles-secret-key'

# Пути к файлам данных
DATA_DIR = Path(__file__).parent / 'data'
SHARED_FILES_FILE = DATA_DIR / 'shared_files.json'
UPLOAD_DIR = Path(__file__).parent / 'uploads'

# Создание необходимых директорий
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)

# Загрузка конфигурации
def load_config():
    config_path = Path(__file__).parent / 'config.yaml'
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    else:
        # Создаем конфигурацию по умолчанию
        default_config = {
            'upload_path': str(UPLOAD_DIR),
            'max_file_size': '100MB',
            'allowed_extensions': ['txt', 'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'mp4', 'zip', 'rar']
        }
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, default_flow_style=False)
        return default_config

config = load_config()

# Управление общим списком файлов
def load_shared_files():
    if SHARED_FILES_FILE.exists():
        with open(SHARED_FILES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_shared_files(files_list):
    with open(SHARED_FILES_FILE, 'w', encoding='utf-8') as f:
        json.dump(files_list, f, indent=2, ensure_ascii=False)

# Получение иконки для типа файла
def get_file_icon(filename):
    ext = Path(filename).suffix.lower()
    icon_map = {
        '.pdf': 'picture_as_pdf',
        '.doc': 'description',
        '.docx': 'description',
        '.txt': 'description',
        '.jpg': 'image',
        '.jpeg': 'image',
        '.png': 'image',
        '.gif': 'image',
        '.mp3': 'music_note',
        '.mp4': 'movie',
        '.zip': 'archive',
        '.rar': 'archive',
        '.7z': 'archive',
        '.mp3': 'music_note',
        '.wav': 'music_note',
        '.py': 'code',
        '.js': 'code',
        '.html': 'code',
        '.css': 'code',
        '.java': 'code',
        '.cpp': 'code',
        '.c': 'code',
        '.md': 'description'
    }
    return icon_map.get(ext, 'insert_drive_file')

# Проверка существования файла
def file_exists(filepath):
    return os.path.exists(filepath)

# Создание ZIP архива для папки
def create_zip_from_folder(folder_path, zip_path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, folder_path)
                zipf.write(file_path, arcname)

# Главная страница (Админский интерфейс)
@app.route('/')
def index():
    shared_files = load_shared_files()
    return render_template('index.html', files=shared_files, config=config)

# API для получения списка файлов
@app.route('/api/files')
def get_files():
    shared_files = load_shared_files()
    
    # Проверяем существование файлов и обновляем статус
    updated_files = []
    for file_info in shared_files:
        path = file_info.get('path')
        if path and file_exists(path):
            file_info['exists'] = True
            file_info['size'] = os.path.getsize(path)
            file_info['icon'] = get_file_icon(file_info['name'])
            file_info['modified'] = datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y-%m-%d %H:%M')
            # Проверяем, является ли путь папкой
            file_info['type'] = 'folder' if os.path.isdir(path) else 'file'
        else:
            file_info['exists'] = False
        updated_files.append(file_info)
    
    # Сохраняем обновленный список
    save_shared_files(updated_files)
    
    return jsonify(updated_files)

# API для добавления файла в общий доступ
@app.route('/api/add-file', methods=['POST'])
def add_file():
    data = request.get_json()
    file_path = data.get('path', '').strip()
    
    if not file_path:
        return jsonify({'error': 'Путь к файлу не может быть пустым'}), 400
    
    if not file_exists(file_path):
        return jsonify({'error': 'Файл не существует'}), 400
    
    # Проверяем, не добавлен ли уже этот файл
    shared_files = load_shared_files()
    for file_info in shared_files:
        if file_info.get('path') == file_path:
            return jsonify({'message': 'Файл уже добавлен в общий доступ'}), 200
    
    # Добавляем файл
    filename = os.path.basename(file_path)
    file_type = 'folder' if os.path.isdir(file_path) else 'file'
    
    file_info = {
        'id': len(shared_files) + 1,
        'name': filename,
        'path': file_path,
        'type': file_type,
        'icon': get_file_icon(filename) if file_type == 'file' else 'folder',
        'added_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'exists': True
    }
    
    shared_files.append(file_info)
    save_shared_files(shared_files)
    
    return jsonify({'message': 'Файл успешно добавлен', 'file': file_info}), 201

# API для удаления файла из общего доступа
@app.route('/api/remove-file/<int:file_id>', methods=['DELETE'])
def remove_file(file_id):
    shared_files = load_shared_files()
    
    # Находим файл по ID
    file_to_remove = None
    # Итерируемся в обратном порядке для безопасного удаления
    for i in range(len(shared_files) - 1, -1, -1):
        if shared_files[i]['id'] == file_id:
            file_to_remove = shared_files.pop(i)
            break
    
    if file_to_remove:
        save_shared_files(shared_files)
        return jsonify({'message': 'Файл удален из общего доступа'}), 200
    else:
        return jsonify({'error': 'Файл не найден'}), 404

# Скачивание файла
@app.route('/download/<int:file_id>')
def download_file(file_id):
    shared_files = load_shared_files()
    
    for file_info in shared_files:
        if file_info['id'] == file_id and file_info.get('exists'):
            file_path = file_info['path']
            if file_exists(file_path) and file_info.get('type') == 'file':
                return send_file(file_path, as_attachment=True, download_name=file_info['name'])
    
    return jsonify({'error': 'Файл не найден или является папкой'}), 404

# Скачивание папки как ZIP
@app.route('/download-folder/<int:file_id>')
def download_folder(file_id):
    shared_files = load_shared_files()
    
    for file_info in shared_files:
        if file_info['id'] == file_id and file_info.get('exists'):
            folder_path = file_info['path']
            if os.path.isdir(folder_path):
                # Создаем временный ZIP файл
                zip_filename = f"{file_info['name']}.zip"
                # Используем NamedTemporaryFile для корректного управления
                with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_zip:
                    temp_zip_name = temp_zip.name
                
                try:
                    create_zip_from_folder(folder_path, temp_zip_name)
                    return send_file(
                        temp_zip_name,
                        as_attachment=True,
                        download_name=zip_filename,
                        mimetype='application/zip'
                    )
                finally:
                    # Удаляем временный файл после отправки
                    if os.path.exists(temp_zip_name):
                        os.unlink(temp_zip_name)
    
    return jsonify({'error': 'Папка не найдена или не существует'}), 404

# Загрузка файлов от внешних пользователей
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не выбран'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    
    # Проверяем расширение файла
    filename = secure_filename(file.filename)
    ext = Path(filename).suffix.lower()
    
    # Убедитесь, что список разрешенных расширений находится в нижнем регистре
    allowed_exts = [f'.{e.lower()}' for e in config['allowed_extensions']]
    
    if ext not in allowed_exts:
        return jsonify({'error': f'Тип файла {ext} не разрешен'}), 400
    
    # Сохраняем файл
    upload_path = Path(config['upload_path']) / filename
    file.save(upload_path)
    
    return jsonify({
        'message': 'Файл успешно загружен',
        'filename': filename,
        'size': os.path.getsize(upload_path)
    }), 201

# Добавляем CORS заголовки для всех маршрутов админского приложения
@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    # Обрабатываем preflight OPTIONS запросы
    if request.method == 'OPTIONS':
        response.status_code = 200
        return response
    
    return response

# Добавляем обработчик для OPTIONS в публичное приложение (ИСПРАВЛЕНИЕ ОШИБКИ 1)
@public_app.after_request
def public_after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    # Обрабатываем preflight OPTIONS запросы
    if request.method == 'OPTIONS':
        response.status_code = 200
        return response
    
    return response

# Страница для внешних пользователей (порт 8111)
def public_interface():
    # Эта функция используется как обработчик для публичного '/' маршрута
    shared_files = load_shared_files()
    # Фильтруем только существующие файлы
    existing_files = [f for f in shared_files if f.get('exists', False)]
    return render_template('public.html', files=existing_files, config=config)

# Админский маршрут для просмотра публичного интерфейса (использует index.html)
# @app.route('/public')
# def public_view():
#     return public_interface()

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """Отправляет сигнал завершения работы, но завершение работы Flask требует отдельного процесса."""
    print("\nСервер получает команду завершения работы...")
    # Поскольку стандартное завершение работы Flask в потоках сложно,
    # мы используем os._exit(0) в главном блоке для принудительного завершения.
    
    # Возвращаем ответ перед попыткой завершить работу
    response = jsonify({'message': 'Сервер завершает работу...'}), 200
    
    # Запуск завершения в отдельном потоке, чтобы не блокировать ответ
    def perform_shutdown():
        import os
        # Немедленно завершаем процесс
        os._exit(0) 
        
    Thread(target=perform_shutdown).start()
    return response

# Добавляем обработчик для public_shutdown (ИСПРАВЛЕНИЕ ОШИБКИ 1)
@public_app.route('/shutdown', methods=['POST'])
def public_shutdown():
    return shutdown()


if __name__ == '__main__':
    # Создаем шаблоны
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    
    print("=== HomeFiles - Файловый сервер для локальной сети ===")
    print("Локальный интерфейс: http://127.0.0.1:8110")
    print("Публичный интерфейс: http://0.0.0.0:8111")
    print("Для остановки нажмите Ctrl+C или отправьте POST на /shutdown")
    
    def run_admin_server():
        # Запускаем основной сервер (Admin)
        app.run(host='127.0.0.1', port=8110, debug=False)
    
    def run_public_server():
        # Устанавливаем маршруты для публичного сервера (ИСПРАВЛЕНИЕ ОШИБКИ 2)
        
        @public_app.route('/')
        def public_index():
            return public_interface()
        
        # Public API
        @public_app.route('/api/files')
        def public_get_files():
            # Публичный сервер должен только читать
            return get_files()
        
        # Public Download
        @public_app.route('/download/<int:file_id>')
        def public_download(file_id):
            return download_file(file_id)
        
        @public_app.route('/download-folder/<int:file_id>')
        def public_download_folder(file_id):
            return download_folder(file_id)
        
        # Public Upload
        @public_app.route('/upload', methods=['POST'])
        def public_upload():
            return upload_file()
        
        # Запускаем публичный сервер
        public_app.run(host='0.0.0.0', port=8111, debug=False)
    
    # Запускаем серверы в отдельных потоках
    admin_thread = Thread(target=run_admin_server, daemon=True)
    public_thread = Thread(target=run_public_server, daemon=True)
    
    admin_thread.start()
    public_thread.start()
    
    try:
        # Главный поток ждет завершения
        while True:
            # Небольшая задержка, чтобы главный поток не потреблял много ресурсов
            import time
            time.sleep(1)
            # Если оба потока завершены, выходим
            if not admin_thread.is_alive() and not public_thread.is_alive():
                break
                
    except (KeyboardInterrupt, SystemExit):
        print("\nСервер остановлен")
        # Принудительное завершение
        import os
        os._exit(0)