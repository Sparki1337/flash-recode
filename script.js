let currentApiKeyIndex = 0;
let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 20000; // 20 секунд в миллисекундах
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('chats')) || {};
let settings = JSON.parse(localStorage.getItem('settings')) || {
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: ''
};

const MAX_TOKENS_PER_CHAT = 100000;

// Инициализация элементов
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const chatsList = document.getElementById('chatsList');
const newChatBtn = document.getElementById('newChatBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const tempSlider = document.getElementById('tempSlider');
const tempValue = document.getElementById('tempValue');
const maxTokens = document.getElementById('maxTokens');
const tokenCount = document.getElementById('tokenCount');

// Элементы для системного промта
const systemPromptInput = document.getElementById('systemPrompt');

// Загрузка настроек
tempSlider.value = settings.temperature;
tempValue.textContent = settings.temperature;
maxTokens.value = settings.maxTokens;

// Загрузка настроек системного промта
systemPromptInput.value = settings.systemPrompt;

// Обработчики настроек
tempSlider.addEventListener('input', (e) => {
    settings.temperature = parseFloat(e.target.value);
    tempValue.textContent = settings.temperature;
    saveSettings();
});

maxTokens.addEventListener('change', (e) => {
    settings.maxTokens = parseInt(e.target.value);
    saveSettings();
});

// Обработчик изменения системного промта
systemPromptInput.addEventListener('change', (e) => {
    settings.systemPrompt = e.target.value;
    saveSettings();
});

function saveSettings() {
    localStorage.setItem('settings', JSON.stringify(settings));
}

function closeModal() {
    settingsModal.classList.add('closing');
    settingsModal.classList.remove('show');
    setTimeout(() => {
        settingsModal.classList.remove('closing');
        settingsModal.style.display = 'none';
    }, 300);
}

// Обработчики модального окна
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('show');
    settingsModal.style.display = 'block';
});

closeSettings.addEventListener('click', closeModal);

window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeModal();
    }
});

// Функции для работы с чатами
function createNewChat() {
    currentChatId = Date.now().toString();
    chats[currentChatId] = {
        messages: [],
        tokenCount: 0,
        name: `Чат ${new Date().toLocaleString()}`
    };
    saveChats();
    updateChatsList();
    chatMessages.innerHTML = '';
    updateTokenCount();
}

function renameChat(chatId, newName) {
    if (chats[chatId]) {
        chats[chatId].name = newName;
        saveChats();
        updateChatsList();
    }
}

function deleteChat(chatId) {
    delete chats[chatId];
    saveChats();
    updateChatsList();
    if (chatId === currentChatId) {
        const remainingChats = Object.keys(chats);
        if (remainingChats.length > 0) {
            loadChat(remainingChats[0]);
        } else {
            createNewChat();
        }
    }
}

function updateTokenCount() {
    const currentChat = chats[currentChatId];
    tokenCount.textContent = currentChat ? currentChat.tokenCount : 0;
}

// Функции форматирования сообщений
function formatMessage(text) {
    // Обработка блоков кода
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        const trimmedCode = code.trim();
        return `
            <div class="code-block" data-language="${language || ''}">
                <div class="code-block-header">
                    <span class="code-language">${language || 'plaintext'}</span>
                    <button class="copy-code-btn" onclick="copyCodeBlock(this)">
                        <span class="material-icons">content_copy</span>
                        Копировать
                    </button>
                </div>
                <pre><code class="language-${language || 'plaintext'}">${escapeHtml(trimmedCode)}</code></pre>
            </div>
        `;
    });
    // Обработка жирного текста
    text = text.replace(/\*(.*?)\*/g, '<span class="bold-text">$1</span>');
    return text;
}

// Функция для экранирования HTML
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Функция копирования кода
function copyCodeBlock(button) {
    const codeBlock = button.closest('.code-block');
    const codeElement = codeBlock.querySelector('pre code');
    const codeToCopy = codeElement.textContent;

    navigator.clipboard.writeText(codeToCopy).then(() => {
        button.innerHTML = '<span class="material-icons">check</span> Скопировано';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.innerHTML = '<span class="material-icons">content_copy</span> Копировать';
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
    });
}

async function estimateTokens(text) {
    // Примерная оценка токенов (4 символа на токен)
    return Math.ceil(text.length / 4);
}

async function generateResponse(message) {
    const currentTime = Date.now();
    const timeSinceLastMessage = currentTime - lastMessageTime;
    
    if (timeSinceLastMessage < MESSAGE_COOLDOWN) {
        const remainingTime = Math.ceil((MESSAGE_COOLDOWN - timeSinceLastMessage) / 1000);
        throw new Error(`Подождите ${remainingTime} секунд перед отправкой следующего сообщения`);
    }

    const systemPrompt = settings.systemPrompt || 
        "Ты - дружелюбный AI-ассистент по имени Flash Recode. Помогай пользователю максимально точно и полно.";

    const currentChat = chats[currentChatId];
    const messageHistory = currentChat.messages.slice(-10);

    const messages = [
        { role: "system", content: systemPrompt },
        ...messageHistory.map(msg => ({
            role: msg.isUser ? "user" : "assistant",
            content: msg.text
        })),
        { 
            role: "user", 
            content: message + "\n\nПримечание: Для выделения текста жирным шрифтом используйте звездочки, например: *текст*"
        }
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                messages: messages,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                model: 'gpt-4o-mini-2024-07-18'
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Ошибка при получении ответа');
        }

        lastMessageTime = currentTime;

        if (data.choices && data.choices[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        
        throw new Error('Неверный формат ответа от API');
    } catch (error) {
        console.error('Ошибка:', error);
        throw new Error('Ошибка при обращении к API. Попробуйте позже.');
    }
}

function addMessageToUI(text, isUser) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    messageDiv.style.animation = 'fadeIn 0.3s ease';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = formatMessage(text);
    messageDiv.appendChild(messageContent);

    if (isUser) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn';
        editBtn.innerHTML = '<span class="material-icons">edit</span>';
        editBtn.onclick = () => {
            const newText = prompt('Редактировать сообщение:', text);
            if (newText !== null && newText.trim() !== '') {
                messageContent.innerHTML = formatMessage(newText);
                updateMessageInStorage(text, newText);
            }
        };
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'message-action-btn';
        deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
        deleteBtn.onclick = () => {
            if (confirm('Удалить это сообщение?')) {
                messageDiv.remove();
                removeMessageFromStorage(text);
            }
        };

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        messageDiv.appendChild(actionsDiv);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return indicator;
}

async function handleMessage() {
    const message = messageInput.value.trim();
    if (message === '') return;

    try {
        const currentTime = Date.now();
        const timeSinceLastMessage = currentTime - lastMessageTime;
        
        if (timeSinceLastMessage < MESSAGE_COOLDOWN) {
            const remainingTime = Math.ceil((MESSAGE_COOLDOWN - timeSinceLastMessage) / 1000);
            throw new Error(`Подождите ${remainingTime} секунд перед отправкой следующего сообщения`);
        }

        const currentChat = chats[currentChatId];
        const estimatedTokens = await estimateTokens(message);
        
        if (currentChat.tokenCount + estimatedTokens > MAX_TOKENS_PER_CHAT) {
            throw new Error('Достигнут лимит токенов для этого чата. Пожалуйста, создайте новый чат.');
        }

        messageInput.value = '';
        addMessageToUI(message, true);

        currentChat.messages.push({ text: message, isUser: true });
        currentChat.tokenCount += estimatedTokens;

        // Создаем элемент генерации ответа
        const generationIndicator = document.createElement('div');
        generationIndicator.className = 'generation-indicator';
        generationIndicator.innerHTML = `
            <div class="generation-text">Генерация ответа...</div>
            <div class="generation-animation">
                <div class="dot dot1"></div>
                <div class="dot dot2"></div>
                <div class="dot dot3"></div>
            </div>
        `;
        chatMessages.appendChild(generationIndicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        let response;
        try {
            response = await generateResponse(message);
        } finally {
            generationIndicator.remove();
        }

        const responseTokens = await estimateTokens(response);
        currentChat.tokenCount += responseTokens;
        
        currentChat.messages.push({ text: response, isUser: false });
        saveChats();
        updateTokenCount();

        addMessageToUI(response, false);
    } catch (error) {
        alert(error.message);
    }
}

function updateMessageInStorage(oldText, newText) {
    const chat = chats[currentChatId];
    const messageIndex = chat.messages.findIndex(msg => msg.text === oldText);
    if (messageIndex !== -1) {
        chat.messages[messageIndex].text = newText;
        saveChats();
    }
}

function removeMessageFromStorage(text) {
    const chat = chats[currentChatId];
    const messageIndex = chat.messages.findIndex(msg => msg.text === text);
    if (messageIndex !== -1) {
        chat.messages.splice(messageIndex, 1);
        saveChats();
    }
}

function saveChats() {
    localStorage.setItem('chats', JSON.stringify(chats));
}

function updateChatsList() {
    chatsList.innerHTML = '';
    Object.keys(chats).forEach(chatId => {
        const chatElement = document.createElement('div');
        chatElement.className = `chat-item ${chatId === currentChatId ? 'active' : ''}`;
        
        const chatContent = document.createElement('div');
        chatContent.className = 'chat-item-content';
        
        const icon = document.createElement('span');
        icon.className = 'material-icons chat-item-icon';
        icon.textContent = 'chat';
        
        const name = document.createElement('span');
        name.className = 'chat-item-name';
        name.textContent = chats[chatId].name;
        
        chatContent.appendChild(icon);
        chatContent.appendChild(name);
        
        const actions = document.createElement('div');
        actions.className = 'chat-item-actions';
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'chat-action-btn rename';
        renameBtn.innerHTML = '<span class="material-icons">edit</span>';
        renameBtn.title = 'Переименовать чат';
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            const newName = prompt('Введите новое название чата:', chats[chatId].name);
            if (newName && newName.trim()) {
                renameChat(chatId, newName.trim());
            }
        };
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-action-btn delete';
        deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
        deleteBtn.title = 'Удалить чат';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Вы уверены, что хотите удалить этот чат?')) {
                deleteChat(chatId);
            }
        };
        
        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        
        chatElement.appendChild(chatContent);
        chatElement.appendChild(actions);
        
        chatElement.onclick = () => loadChat(chatId);
        chatsList.appendChild(chatElement);
    });
}

function loadChat(chatId) {
    currentChatId = chatId;
    chatMessages.innerHTML = '';
    const chat = chats[chatId];
    chat.messages.forEach(msg => addMessageToUI(msg.text, msg.isUser));
    updateTokenCount();
}

// Обработчики событий
sendButton.addEventListener('click', handleMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleMessage();
    }
});
newChatBtn.addEventListener('click', createNewChat);

// Инициализация
if (Object.keys(chats).length === 0) {
    createNewChat();
} else {
    updateChatsList();
    loadChat(Object.keys(chats)[0]);
}

// Добавим анимацию fadeIn в CSS
const styleSheet = document.createElement('style')
styleSheet.type = "text/css"
styleSheet.innerText = `
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
`
document.head.appendChild(styleSheet)

// Библиотека для PDF (добавить в index.html)
// <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

// Словарь для автодополнения
const autocompleteDictionary = {
    programming: [
        'напиши код', 'исправь ошибку', 'объясни алгоритм', 
        'как работает', 'оптимизируй', 'структура данных',
        'рефакторинг', 'паттерн проектирования', 'debug'
    ],
    questions: [
        'как', 'почему', 'что такое', 'объясни', 'расскажи', 
        'в чем разница', 'какие существуют', 'что будет если'
    ],
    greetings: [
        'привет', 'здравствуй', 'добрый день', 'хай', 'салют'
    ],
    actions: [
        'помоги', 'посоветуй', 'подскажи', 'научи', 'объясни', 
        'переведи', 'составь', 'напиши', 'создай'
    ],
    topics: [
        'программирование', 'наука', 'технологии', 'история', 
        'психология', 'философия', 'искусство', 'литература'
    ]
};

// Функция очистки чата
function clearCurrentChat() {
    if (confirm('Вы уверены, что хотите очистить текущий чат?')) {
        const currentChat = chats[currentChatId];
        currentChat.messages = [];
        currentChat.tokenCount = 0;
        chatMessages.innerHTML = '';
        saveChats();
        updateTokenCount();
        
        // Анимация очистки
        chatMessages.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            chatMessages.style.animation = '';
        }, 300);
    }
}

// Функция экспорта чата в PDF
function exportChatToPDF() {
    // Проверяем, что библиотека jsPDF загружена
    if (typeof window.jspdf === 'undefined') {
        alert('Библиотека для экспорта PDF не загружена. Пожалуйста, обновите страницу.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });
    
    const chat = chats[currentChatId];
    const chatName = chat.name || 'Чат';
    
    // Проверка наличия сообщений
    if (!chat.messages || chat.messages.length === 0) {
        alert('Нет сообщений для экспорта');
        return;
    }

    // Настройки шрифта и цвета
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    
    // Заголовок
    doc.text(chatName, 20, 20);
    
    // Настройки для сообщений
    doc.setFontSize(10);
    
    let yPosition = 40;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;

    chat.messages.forEach((msg, index) => {
        // Проверка на новую страницу
        if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
        }

        // Цвет для отправителя
        doc.setTextColor(msg.isUser ? 16 : 0, msg.isUser ? 163 : 0, msg.isUser ? 127 : 255);
        
        // Форматирование сообщения
        const prefix = msg.isUser ? 'Вы: ' : 'AI: ';
        const wrappedText = doc.splitTextToSize(prefix + msg.text, 170);
        
        doc.text(wrappedText, 20, yPosition);
        
        // Увеличиваем позицию с учетом количества строк
        yPosition += wrappedText.length * 7;
    });
    
    doc.save(`${chatName}_${new Date().toLocaleDateString()}.pdf`);
}

// Функция автодополнения
function setupAutocomplete() {
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.id = 'autocomplete-suggestions';
    autocompleteContainer.className = 'autocomplete-suggestions';
    messageInput.parentNode.insertBefore(autocompleteContainer, messageInput.nextSibling);

    messageInput.addEventListener('input', (e) => {
        const inputText = e.target.value.toLowerCase();
        const lastWord = inputText.split(/\s+/).pop();
        
        if (lastWord.length < 2) {
            autocompleteContainer.innerHTML = '';
            return;
        }

        const suggestions = [];
        const categories = Object.keys(autocompleteDictionary);
        
        // Поиск по всем категориям словаря
        categories.forEach(category => {
            autocompleteDictionary[category].forEach(suggestion => {
                if (
                    suggestion.toLowerCase().startsWith(lastWord) && 
                    !suggestions.some(s => s.text === suggestion) &&
                    suggestions.length < 5
                ) {
                    suggestions.push({ 
                        text: suggestion, 
                        category: category 
                    });
                }
            });
        });

        // Отображение подсказок с категориями
        autocompleteContainer.innerHTML = suggestions.map(suggestion => 
            `<div class="autocomplete-item" data-category="${suggestion.category}">
                ${suggestion.text}
            </div>`
        ).join('');

        // Обработчики клика по подсказкам
        document.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const words = inputText.split(/\s+/);
                words[words.length - 1] = item.textContent.trim();
                messageInput.value = words.join(' ') + ' ';
                autocompleteContainer.innerHTML = '';
                messageInput.focus();
            });
        });
    });

    // Закрытие подсказок при клике вне
    document.addEventListener('click', (e) => {
        if (!autocompleteContainer.contains(e.target) && e.target !== messageInput) {
            autocompleteContainer.innerHTML = '';
        }
    });
}

// Добавим стили для автодополнения
const autocompleteStyles = document.createElement('style');
autocompleteStyles.textContent = `
.autocomplete-suggestions {
    position: absolute;
    max-width: 300px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--secondary-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    z-index: 100;
    margin-top: 5px;
}

.autocomplete-item {
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.autocomplete-item:hover {
    background-color: rgba(16, 163, 127, 0.1);
}
`;
document.head.appendChild(autocompleteStyles);

// Инициализация
const clearChatBtn = document.getElementById('clearChatBtn');
clearChatBtn.addEventListener('click', clearCurrentChat);

// Добавим кнопку экспорта
const exportChatBtn = document.getElementById('exportChatBtn');
exportChatBtn.addEventListener('click', (e) => {
    const exportDropdown = exportChatBtn.querySelector('.export-dropdown');
    if (!exportDropdown) {
        const dropdown = document.createElement('div');
        dropdown.className = 'export-dropdown';
        dropdown.innerHTML = `
            <button onclick="exportChatToJSON()">
                <span class="material-icons">data_object</span>
                JSON
            </button>
            <button onclick="exportChatToPDF()">
                <span class="material-icons">description</span>
                PDF
            </button>
            <button onclick="exportChatToWord()">
                <span class="material-icons">description</span>
                Word
            </button>
        `;
        exportChatBtn.appendChild(dropdown);
    }
    
    const dropdown = exportChatBtn.querySelector('.export-dropdown');
    dropdown.classList.toggle('show');
    e.stopPropagation();
});

// Закрытие dropdown при клике вне
document.addEventListener('click', () => {
    const dropdown = document.querySelector('.export-dropdown');
    if (dropdown) dropdown.classList.remove('show');
});

// Инициализация автодополнения
setupAutocomplete();

function exportChatToJSON() {
    const chat = chats[currentChatId];
    
    if (!chat.messages || chat.messages.length === 0) {
        alert('Нет сообщений для экспорта');
        return;
    }

    const exportData = {
        chatName: chat.name || 'Чат',
        date: new Date().toLocaleString(),
        messages: chat.messages.map(msg => ({
            sender: msg.isUser ? 'User' : 'AI',
            text: msg.text,
            timestamp: new Date().toISOString()
        }))
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportData.chatName}_${new Date().toLocaleDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportChatToWord() {
    const chat = chats[currentChatId];
    
    if (!chat.messages || chat.messages.length === 0) {
        alert('Нет сообщений для экспорта');
        return;
    }

    const { Document, Packer, Paragraph, TextRun } = window.docx;

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: chat.name || 'Чат',
                            bold: true,
                            size: 32
                        })
                    ]
                }),
                new Paragraph({}),
                ...chat.messages.flatMap(msg => [
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: msg.isUser ? 'Вы: ' : 'AI: ',
                                bold: true,
                                color: msg.isUser ? '10A37F' : '0000FF'
                            }),
                            new TextRun({
                                text: msg.text,
                                color: msg.isUser ? '000000' : '000000'
                            })
                        ]
                    }),
                    new Paragraph({}) // Пустая строка между сообщениями
                ])
            ]
        }]
    });

    Packer.toBlob(doc).then(blob => {
        saveAs(blob, `${chat.name || 'Чат'}_${new Date().toLocaleDateString()}.docx`);
    });
}
