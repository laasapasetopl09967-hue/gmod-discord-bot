const Discord = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');

// Конфигурация
const config = {
    discordBotToken: process.env.DISCORD_TOKEN,
    httpPort: process.env.PORT || 3000,
    authToken: process.env.AUTH_TOKEN,
    logChannelId: process.env.LOG_CHANNEL_ID,
    updateTimeout: 30000,
};

// Создание клиента Discord
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildPresences,
    ]
});

// Создание HTTP сервера
const app = express();
app.use(bodyParser.json());

let serverOnline = false;
let timeoutHandle = null;
let logChannel = null;

// Установка статуса "Сервер выключен"
function setOfflineStatus() {
    client.user.setPresence({
        status: 'dnd',
        activities: [{
            name: 'Сервер выключен.',
            type: Discord.ActivityType.Watching
        }]
    });
}

// Установка статуса с количеством игроков
function setOnlineStatus(online, max) {
    client.user.setPresence({
        status: 'online',
        activities: [{
            name: `${online}/${max} Игроков`,
            type: Discord.ActivityType.Watching
        }]
    });
}

// Сброс таймера
function resetTimeout() {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
        if (serverOnline) {
            console.log('Таймаут. Сервер считается выключенным.');
            serverOnline = false;
            setOfflineStatus();
        }
    }, config.updateTimeout);
}

// Отправка логов в Discord
function sendDiscordLog(type, message, color) {
    if (!logChannel) {
        console.error('Лог-канал не найден');
        return;
    }
    
    const embed = new Discord.EmbedBuilder()
        .setColor(color || 3447003)
        .setDescription(message)
        .setTimestamp();
    
    const icons = {
        'connect': '✅',
        'disconnect': '❌',
        'death': '💀',
        'chat': '💬',
        'admin': '⚙️',
        'server': '🖥️'
    };
    
    if (icons[type]) {
        embed.setAuthor({ name: `${icons[type]} ${type.toUpperCase()}` });
    }
    
    logChannel.send({ embeds: [embed] }).catch(err => {
        console.error('Ошибка отправки лога:', err);
    });
}

// При готовности бота
client.on('ready', async () => {
    console.log(`Бот запущен: ${client.user.tag}`);
    setOfflineStatus();
    
    // Получаем канал для логов
    if (config.logChannelId) {
        try {
            logChannel = await client.channels.fetch(config.logChannelId);
            console.log('Лог-канал подключен:', logChannel.name);
        } catch (err) {
            console.error('Не удалось найти лог-канал:', err);
        }
    }
});

// Обработка обновления статуса
app.post('/update', (req, res) => {
    const { token, online, max, shutdown } = req.body;
    
    if (token !== config.authToken) {
        return res.status(401).json({ error: 'Неверный токен' });
    }
    
    if (shutdown) {
        console.log('Сервер выключен.');
        serverOnline = false;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        setOfflineStatus();
        return res.json({ success: true });
    }
    
    serverOnline = true;
    resetTimeout();
    setOnlineStatus(online, max);
    
    res.json({ success: true });
});

// Обработка логов
app.post('/log', (req, res) => {
    const { token, type, message, color } = req.body;
    
    if (token !== config.authToken) {
        return res.status(401).json({ error: 'Неверный токен' });
    }
    
    if (message) {
        sendDiscordLog(type || 'info', message, color);
        console.log(`Лог [${type}]: ${message}`);
    }
    
    res.json({ success: true });
});

// Главная страница
app.get('/', (req, res) => {
    res.send('Discord Status Bot is running');
});

// Запуск HTTP сервера
app.listen(config.httpPort, () => {
    console.log(`HTTP сервер на порту ${config.httpPort}`);
});

// Вход в Discord
client.login(config.discordBotToken).catch(err => {
    console.error('Ошибка входа в Discord:', err);
});
