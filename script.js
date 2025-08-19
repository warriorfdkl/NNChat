// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';

// Элементы DOM
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messagesContainer');
const chatList = document.getElementById('chatList');
const currentChatName = document.getElementById('currentChatName');
const currentChatAvatar = document.getElementById('currentChatAvatar');
const currentChatStatus = document.getElementById('currentChatStatus');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const newChatBtn = document.getElementById('newChatBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Глобальные переменные
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let socket = null;
let chats = {};
let currentChatId = null;
let isTyping = false;
let typingTimeout = null;

// API Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        ...options
    };
    
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    
    try {
        console.log('Making API request to:', url);
        const response = await fetch(url, config);
        
        if (!response.ok) {
            let errorMessage = 'API request failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('API response:', data);
        return data;
    } catch (error) {
        console.error('API Error:', error);
        
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            console.error('Network error - server may be unavailable');
            throw new Error('Сервер недоступен. Проверьте подключение.');
        }
        
        // Handle auth errors
        if (error.message.includes('token') || error.message.includes('auth') || error.message.includes('401')) {
            console.log('Authentication error, clearing token');
            handleAuthError();
        }
        
        throw error;
    }
}

function handleAuthError() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showLoginForm();
}

async function logout() {
    try {
        // Отправляем запрос на сервер для выхода
        if (authToken) {
            await apiRequest('/auth/logout', {
                method: 'POST'
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Очищаем локальные данные
        localStorage.removeItem('authToken');
        authToken = null;
        currentUser = null;
        
        // Отключаем socket
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        // Очищаем чаты
        chats = {};
        currentChatId = null;
        
        // Показываем форму входа
        showLoginForm();
        
        // Показываем уведомление
        showNotification('Вы успешно вышли из системы', 'success');
    }
}

// Authentication Functions
function showLoginForm() {
    const loginHtml = `
        <div class="login-overlay">
            <div class="login-form">
                <h2>Вход в NexusChat</h2>
                <form id="loginForm">
                    <div class="form-group">
                        <input type="text" id="username" placeholder="Email или имя пользователя" required>
                    </div>
                    <div class="form-group">
                        <input type="password" id="password" placeholder="Пароль" required>
                    </div>
                    <button type="submit">Войти</button>
                    <button type="button" id="showRegister">Регистрация</button>
                </form>
                <div id="loginError" class="error-message"></div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', loginHtml);
    
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('showRegister').addEventListener('click', showRegisterForm);
}

function showRegisterForm() {
    const registerHtml = `
        <div class="login-overlay">
            <div class="login-form">
                <h2>Регистрация</h2>
                <form id="registerForm">
                    <div class="form-group">
                        <input type="text" id="regUsername" placeholder="Имя пользователя (мин. 3 символа, только буквы, цифры, _)" required>
                    </div>
                    <div class="form-group">
                        <input type="email" id="regEmail" placeholder="Email (опционально)">
                    </div>
                    <div class="form-group">
                        <input type="text" id="regFullName" placeholder="Полное имя (опционально)">
                    </div>
                    <div class="form-group">
                        <input type="password" id="regPassword" placeholder="Пароль (минимум 6 символов)" required>
                    </div>
                    <button type="submit">Зарегистрироваться</button>
                    <button type="button" id="showLogin">Уже есть аккаунт?</button>
                </form>
                <div id="registerError" class="error-message"></div>
            </div>
        </div>
    `;
    
    document.querySelector('.login-overlay').outerHTML = registerHtml;
    
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('showLogin').addEventListener('click', showLoginForm);
}

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: { username, password }
        });
        
        authToken = response.token;
        currentUser = response.user;
        localStorage.setItem('authToken', authToken);
        
        // Показываем информацию о VitroCAD синхронизации
        if (response.vitrocad_sync) {
            const sync = response.vitrocad_sync;
            if (sync.success) {
                showNotification(
                    `✅ Синхронизация с VitroCAD завершена! Найдено файлов: ${sync.files_count}, создано чатов: ${sync.chats_created}`,
                    'success'
                );
            } else {
                showNotification(
                    '⚠️ VitroCAD синхронизация не выполнена (пользователь не найден в VitroCAD)',
                    'info'
                );
            }
        } else if (currentUser && currentUser.email) {
            showNotification(
                '⚠️ VitroCAD синхронизация не выполнена (проверьте настройки)',
                'info'
            );
        }
        
        document.querySelector('.login-overlay').remove();
        await initializeApp();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const fullName = document.getElementById('regFullName').value.trim();
    const password = document.getElementById('regPassword').value;
    const errorDiv = document.getElementById('registerError');
    
    // Клиентская валидация
    if (username.length < 3) {
        errorDiv.textContent = 'Имя пользователя должно содержать минимум 3 символа';
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errorDiv.textContent = 'Имя пользователя может содержать только буквы, цифры и подчеркивания';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = 'Пароль должен содержать минимум 6 символов';
        return;
    }
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorDiv.textContent = 'Введите корректный email адрес';
        return;
    }
    
    try {
        const response = await apiRequest('/auth/register', {
            method: 'POST',
            body: { 
                username, 
                email: email || undefined, 
                full_name: fullName || undefined, 
                password 
            }
        });
        
        authToken = response.token;
        currentUser = response.user;
        localStorage.setItem('authToken', authToken);
        
        document.querySelector('.login-overlay').remove();
        await initializeApp();
    } catch (error) {
        if (error.message.includes('details')) {
            // Показываем детали валидации от сервера
            try {
                const errorData = JSON.parse(error.message.split('details: ')[1]);
                errorDiv.textContent = errorData.map(err => err.msg).join(', ');
            } catch {
                errorDiv.textContent = error.message;
            }
        } else {
            errorDiv.textContent = error.message;
        }
    }
}

// Функция для получения текущего времени
function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Вчера';
    } else if (diffDays < 7) {
        return `${diffDays} дн. назад`;
    } else {
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }
}

// Функция для создания сообщения
function createMessage(text, type = 'sent', time = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageText = document.createElement('p');
    messageText.textContent = text;
    
    const messageTime = document.createElement('span');
    messageTime.className = 'message-time';
    messageTime.textContent = time || getCurrentTime();
    
    messageContent.appendChild(messageText);
    messageContent.appendChild(messageTime);
    messageDiv.appendChild(messageContent);
    
    return messageDiv;
}

// WebSocket Functions
function initializeSocket() {
    if (!authToken) return;
    
    socket = io(SOCKET_URL, {
        auth: {
            token: authToken
        }
    });
    
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        socket.emit('authenticate');
    });
    
    socket.on('authenticated', (data) => {
        console.log('✅ Authenticated:', data.user.username);
    });
    
    socket.on('new_message', (data) => {
        handleNewMessage(data.message, data.user);
    });
    
    socket.on('chat_created', (data) => {
        handleChatCreated(data);
    });
    
    socket.on('user_typing', (data) => {
        handleUserTyping(data);
    });
    
    socket.on('message_read', (data) => {
        handleMessageRead(data);
    });
    
    socket.on('user_online', (data) => {
        updateUserStatus(data.userId, true);
    });
    
    socket.on('user_offline', (data) => {
        updateUserStatus(data.userId, false);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
}

function handleNewMessage(message, user) {
    if (message.chat_id === currentChatId) {
        const messageElement = createMessageElement(message, user);
        messagesContainer.appendChild(messageElement);
        scrollToBottom();
        
        // Mark as read if chat is active
        markMessagesAsRead(currentChatId);
    }
    
    // Update chat list
    updateChatInList(message.chat_id, message.content);
}

function handleChatCreated(data) {
    loadChats(); // Reload chat list
    showNotification(`Создан новый чат: ${data.chat.name}`);
}

function handleUserTyping(data) {
    if (data.chatId === currentChatId && data.userId !== currentUser.id) {
        showTypingIndicator(data.user, data.isTyping);
    }
}

function handleMessageRead(data) {
    // Update read indicators
    updateReadIndicators(data.messageId, data.userId);
}

function updateUserStatus(userId, isOnline) {
    // Update user status in UI
    const statusElements = document.querySelectorAll(`[data-user-id="${userId}"] .user-status`);
    statusElements.forEach(el => {
        el.textContent = isOnline ? 'онлайн' : 'не в сети';
        el.className = `user-status ${isOnline ? 'online' : 'offline'}`;
    });
}

// Chat Functions
async function loadChats() {
    try {
        const response = await apiRequest('/chats');
        chats = {};
        
        response.chats.forEach(chat => {
            chats[chat.id] = chat;
        });
        
        renderChatList(response.chats);
        
        // Select first chat if none selected
        if (!currentChatId && response.chats.length > 0) {
            switchChat(response.chats[0].id);
        }
    } catch (error) {
        console.error('Failed to load chats:', error);
        showNotification('Ошибка загрузки чатов', 'error');
    }
}

function renderChatList(chatList) {
    chatList.innerHTML = '';
    
    chatList.forEach(chat => {
        const chatElement = createChatElement(chat);
        chatList.appendChild(chatElement);
    });
}

function createChatElement(chat) {
    const chatDiv = document.createElement('div');
    chatDiv.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
    chatDiv.dataset.chatId = chat.id;
    
    const avatar = chat.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
    
    // Индикатор VitroCAD файла
    let vitrocadIndicator = '';
    if (chat.vitrocad_file) {
        const isUserFile = chat.is_user_file ? '👤' : '📁';
        vitrocadIndicator = `<span class="vitrocad-indicator" title="${chat.is_user_file ? 'Ваш файл' : 'Файл VitroCAD'}">${isUserFile}</span>`;
    }
    
    chatDiv.innerHTML = `
        <div class="chat-avatar">${avatar}</div>
        <div class="chat-info">
            <div class="chat-name">
                ${vitrocadIndicator}
                ${chat.name}
            </div>
            <div class="chat-last-message">${chat.last_message_text || 'Нет сообщений'}</div>
        </div>
        <div class="chat-meta">
            <div class="chat-time">${chat.last_message_at ? formatTime(chat.last_message_at) : ''}</div>
            ${chat.unread_count > 0 ? `<div class="unread-badge">${chat.unread_count}</div>` : ''}
        </div>
    `;
    
    return chatDiv;
}

async function switchChat(chatId) {
    if (currentChatId === chatId) return;
    
    // Leave current chat
    if (currentChatId && socket) {
        socket.emit('leave_chat', { chatId: currentChatId });
    }
    
    // Update active chat in UI
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('active');
    
    currentChatId = chatId;
    const chat = chats[chatId];
    
    if (chat) {
        // Update header
        currentChatName.textContent = chat.name;
        const avatar = chat.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
        currentChatAvatar.textContent = avatar;
        currentChatStatus.textContent = getStatusText(chat);
        
        // Load messages
        await loadChatMessages(chatId);
        
        // Join chat via socket
        if (socket) {
            socket.emit('join_chat', { chatId: chatId });
        }
        
        // Mark messages as read
        markMessagesAsRead(chatId);
    }
    
    // Close sidebar on mobile
    closeSidebar();
}

function getStatusText(chat) {
    if (chat.type === 'file') {
        return 'Файловый чат';
    } else if (chat.type === 'group') {
        return `${chat.participants?.length || 0} участников`;
    }
    return 'Чат';
}

// Message Functions
async function loadChatMessages(chatId) {
    try {
        const response = await apiRequest(`/messages/${chatId}`);
        messagesContainer.innerHTML = '';
        
        response.messages.reverse().forEach(message => {
            const messageElement = createMessageElement(message, message.user);
            messagesContainer.appendChild(messageElement);
        });
        
        scrollToBottom();
    } catch (error) {
        console.error('Failed to load messages:', error);
        showNotification('Ошибка загрузки сообщений', 'error');
    }
}

function createMessageElement(message, user) {
    const messageDiv = document.createElement('div');
    const isOwn = user && user.id === currentUser.id;
    messageDiv.className = `message ${isOwn ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = message.id;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageText = document.createElement('p');
    messageText.textContent = message.content;
    
    const messageTime = document.createElement('span');
    messageTime.className = 'message-time';
    messageTime.textContent = formatTime(message.created_at);
    
    messageContent.appendChild(messageText);
    messageContent.appendChild(messageTime);
    
    // Add user name for received messages
    if (!isOwn && user) {
        const userName = document.createElement('div');
        userName.className = 'message-user';
        userName.textContent = user.full_name || user.username;
        messageContent.insertBefore(userName, messageText);
    }
    
    // Add edit indicator if message was edited
    if (message.edited_at) {
        const editedIndicator = document.createElement('span');
        editedIndicator.className = 'edited-indicator';
        editedIndicator.textContent = ' (изменено)';
        messageTime.appendChild(editedIndicator);
    }
    
    messageDiv.appendChild(messageContent);
    return messageDiv;
}

function scrollToBottom() {
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

async function markMessagesAsRead(chatId) {
    try {
        await apiRequest(`/messages/${chatId}/read`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('Failed to mark messages as read:', error);
    }
}

function updateChatInList(chatId, lastMessage) {
    const chatElement = document.querySelector(`[data-chat-id="${chatId}"]`);
    if (chatElement) {
        const lastMessageElement = chatElement.querySelector('.chat-last-message');
        if (lastMessageElement) {
            lastMessageElement.textContent = lastMessage.length > 30 
                ? lastMessage.substring(0, 30) + '...' 
                : lastMessage;
        }
        
        const timeElement = chatElement.querySelector('.chat-time');
        if (timeElement) {
            timeElement.textContent = getCurrentTime();
        }
    }
}

// Функция для добавления сообщения в чат
function addMessage(text, type = 'sent') {
    if (!text.trim()) return;
    
    const messageElement = createMessage(text, type);
    messagesContainer.appendChild(messageElement);
    
    // Добавляем сообщение в данные чата
    chats[currentChatId].messages.push({
        text: text,
        type: type,
        time: getCurrentTime()
    });
    
    // Обновляем последнее сообщение в списке чатов
    updateChatLastMessage(currentChatId, text, type);
    
    // Автопрокрутка к последнему сообщению
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

// Функция для обновления последнего сообщения в списке чатов
function updateChatLastMessage(chatId, text, type) {
    const chatItem = document.querySelector(`[data-chat-id="${chatId}"]`);
    const lastMessageElement = chatItem.querySelector('.chat-last-message');
    const timeElement = chatItem.querySelector('.chat-time');
    
    const displayText = type === 'sent' ? `Вы: ${text}` : text;
    lastMessageElement.textContent = displayText.length > 30 ? displayText.substring(0, 30) + '...' : displayText;
    timeElement.textContent = getCurrentTime();
}

// Функции для управления боковой панелью
function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
}

function toggleSidebar() {
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

// Send Message Function
async function sendMessage() {
    const text = messageInput.value.trim();
    
    if (!text || !currentChatId) return;
    
    try {
        // Send via API
        await apiRequest(`/messages/${currentChatId}`, {
            method: 'POST',
            body: {
                content: text,
                type: 'text'
            }
        });
        
        // Clear input
        messageInput.value = '';
        messageInput.focus();
        
        // Stop typing indicator
        if (socket && isTyping) {
            socket.emit('typing_stop', { chatId: currentChatId });
            isTyping = false;
        }
        
    } catch (error) {
        console.error('Failed to send message:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Typing Functions
function handleTyping() {
    if (!socket || !currentChatId) return;
    
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing_start', { chatId: currentChatId });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            socket.emit('typing_stop', { chatId: currentChatId });
        }
    }, 1000);
}

function showTypingIndicator(user, isTyping) {
    const typingId = `typing-${user.id}`;
    let typingElement = document.getElementById(typingId);
    
    if (isTyping) {
        if (!typingElement) {
            typingElement = document.createElement('div');
            typingElement.id = typingId;
            typingElement.className = 'typing-indicator';
            typingElement.innerHTML = `
                <div class="typing-content">
                    <span class="typing-user">${user.full_name || user.username}</span> печатает
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            `;
            messagesContainer.appendChild(typingElement);
            scrollToBottom();
        }
    } else {
        if (typingElement) {
            typingElement.remove();
        }
    }
}

// Notification Functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// App Initialization
async function initializeApp() {
    try {
        // Check API availability first
        console.log('Checking API availability...');
        await apiRequest('/health');
        console.log('✅ API is available');
        
        // Verify token
        const response = await apiRequest('/auth/me');
        currentUser = response.user;
        
        // Initialize socket
        initializeSocket();
        
        // Load chats
        await loadChats();
        
        console.log('✅ App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        handleAuthError();
    }
}

async function checkAuth() {
    if (authToken) {
        try {
            await initializeApp();
        } catch (error) {
            showLoginForm();
        }
    } else {
        showLoginForm();
    }
}

// Функция для имитации ответов
function simulateResponse(userMessage) {
    const responses = [
        'Интересно! Расскажи больше.',
        'Понятно, спасибо за информацию.',
        'Хорошо, я понял.',
        'Отлично! Что-то еще?',
        'Согласен с тобой.',
        'Это звучит здорово!',
        'Понял, продолжай.',
        'Интересная мысль!',
        'Да, ты прав.',
        'Хм, нужно подумать об этом.'
    ];
    
    // Специальные ответы на определенные сообщения
    const lowerMessage = userMessage.toLowerCase();
    
    let response;
    if (lowerMessage.includes('привет') || lowerMessage.includes('hello')) {
        response = 'Привет! Как дела?';
    } else if (lowerMessage.includes('как дела') || lowerMessage.includes('как поживаешь')) {
        response = 'Все отлично! А у тебя как?';
    } else if (lowerMessage.includes('пока') || lowerMessage.includes('до свидания')) {
        response = 'До встречи! Хорошего дня!';
    } else if (lowerMessage.includes('спасибо') || lowerMessage.includes('благодарю')) {
        response = 'Пожалуйста! Всегда рад помочь.';
    } else {
        response = responses[Math.floor(Math.random() * responses.length)];
    }
    
    addMessage(response, 'received');
}

// Обработчик клика по кнопке отправки
sendButton.addEventListener('click', sendMessage);

// Обработчик нажатия клавиш в поле ввода
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Обработчик ввода для управления состоянием кнопки
messageInput.addEventListener('input', function() {
    const hasText = this.value.trim().length > 0;
    sendButton.disabled = !hasText;
    
    if (hasText) {
        sendButton.style.background = '#8bb4f0';
    } else {
        sendButton.style.background = '#4a5568';
    }
});

// Event Handlers
function setupEventHandlers() {
    // Chat list clicks
    chatList.addEventListener('click', function(e) {
        const chatItem = e.target.closest('.chat-item');
        if (chatItem) {
            const chatId = chatItem.dataset.chatId;
            switchChat(chatId);
        }
    });
    
    // Menu toggle
    menuToggle.addEventListener('click', toggleSidebar);
    
    // Sidebar overlay
    sidebarOverlay.addEventListener('click', closeSidebar);
    
    // New chat button
    newChatBtn.addEventListener('click', function() {
        showCreateChatDialog();
    });
    
    // Logout button
    logoutBtn.addEventListener('click', function() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            logout();
        }
    });
    
    // Send button
    sendButton.addEventListener('click', sendMessage);
    
    // Message input events
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Typing indicator
    messageInput.addEventListener('input', function() {
        handleTyping();
        
        const hasText = this.value.trim().length > 0;
        sendButton.disabled = !hasText;
        
        if (hasText) {
            sendButton.style.background = '#8bb4f0';
        } else {
            sendButton.style.background = '#4a5568';
        }
    });
    
    // Click outside sidebar
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && 
            !sidebar.contains(e.target) && 
            !menuToggle.contains(e.target) && 
            sidebar.classList.contains('open')) {
            closeSidebar();
        }
    });
    
    // Window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            closeSidebar();
        }
        scrollToBottom();
    });
}

function showCreateChatDialog() {
    // Simple implementation - can be enhanced later
    const chatName = prompt('Введите название чата:');
    if (chatName) {
        createNewChat(chatName);
    }
}

async function createNewChat(name) {
    try {
        const response = await apiRequest('/chats', {
            method: 'POST',
            body: {
                name: name,
                type: 'group',
                participants: [currentUser.id]
            }
        });
        
        showNotification('Чат создан успешно!');
        await loadChats();
        switchChat(response.chat.id);
    } catch (error) {
        console.error('Failed to create chat:', error);
        showNotification('Ошибка создания чата', 'error');
    }
}

// App startup
window.addEventListener('load', function() {
    setupEventHandlers();
    checkAuth();
    
    // Initialize send button state
    sendButton.disabled = true;
    sendButton.style.background = '#4a5568';
});



// Инициализация состояния кнопки отправки
sendButton.disabled = true;
sendButton.style.background = '#4a5568';