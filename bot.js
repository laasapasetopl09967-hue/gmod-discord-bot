const Discord = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');

// Конфигурация из переменных окружения
const config = {
  discordBotToken: process.env.DISCORD_TOKEN,
  httpPort: process.env.PORT || 10000,
  authToken: process.env.AUTH_TOKEN || 'mySecretKey123',
  logChannelId: process.env.LOG_CHANNEL_ID,
  gmodHost: process.env.GMOD_HOST || '127.0.0.1',
  gmodPort: process.env.GMOD_PORT || 27015,
  updateInterval: parseInt(process.env.UPDATE_INTERVAL) || 30000,
};

// Создание клиента Discord
const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildMembers,
  ],
});

// Создание HTTP сервера
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let logChannel = null;

// Функция обновления статуса
async function updateStatus() {
  try {
    // Пытаемся получить данные с GMod сервера
    const response = await fetch(`http://${config.gmodHost}:${config.gmodPort}/players`);
    
    if (response.ok) {
      const data = await response.json();
      const online = data.players ? data.players.length : 0;
      const max = data.maxPlayers || 32;
      
      const statusText = `${online}/${max} Игроков`;
      client.user.setPresence({
        activities: [{ name: statusText, type: Discord.ActivityType.Watching }],
        status: 'online'
      });
      console.log(`✅ Статус обновлен: ${statusText}`);
    } else {
      // Сервер не ответил
      client.user.setPresence({
        activities: [{ name: 'Сервер выключен', type: Discord.ActivityType.Watching }],
        status: 'idle'
      });
      console.log('⚠️ Сервер не отвечает');
    }
  } catch (error) {
    // Ошибка подключения к серверу
    client.user.setPresence({
      activities: [{ name: 'Сервер выключен', type: Discord.ActivityType.Watching }],
      status: 'idle'
    });
    console.log('⚠️ Ошибка подключения к GMod серверу:', error.message);
  }
}

// Обработчик HTTP запросов от GMod
app.post('/log', (req, res) => {
  const { token, message, color } = req.body;
  
  console.log('📨 Получен запрос от GMod');
  
  // Проверка токена
  if (token !== config.authToken) {
    console.log('❌ Неверный токен!');
    return res.status(401).json({ error: 'Неверный токен' });
  }

  if (!logChannel) {
    console.log('❌ Канал логов не найден!');
    return res.status(500).json({ error: 'Канал логов не найден' });
  }

  // Отправка сообщения в Discord
  logChannel.send(message)
    .then(() => {
      console.log('✅ Сообщение отправлено в Discord');
      res.json({ success: true });
    })
    .catch((error) => {
      console.error('❌ Ошибка отправки:', error);
      res.status(500).json({ error: 'Ошибка отправки сообщения' });
    });
});

// Обработчик для GET запросов (для проверки работы)
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    bot: client.user ? client.user.tag : 'не запущен',
    server: 'GMod Discord Bot'
  });
});

// Событие готовности бота
client.once('ready', () => {
  console.log(`✅ Бот запущен: ${client.user.tag}`);
  
  // Получение канала для логов
  logChannel = client.channels.cache.get(config.logChannelId);
  if (logChannel) {
    console.log(`✅ Канал логов найден: #${logChannel.name}`);
    logChannel.send('🟢 **Бот запущен и готов к работе!**');
  } else {
    console.error('❌ Канал логов НЕ НАЙДЕН! Проверьте LOG_CHANNEL_ID');
    console.log(`🔍 ID канала в конфиге: ${config.logChannelId}`);
  }

  // Первоначальное обновление статуса
  setTimeout(() => {
    updateStatus();
  }, 2000);
  
  // Периодическое обновление статуса
  setInterval(updateStatus, config.updateInterval);
  
  console.log(`🚀 HTTP сервер запущен на порту ${config.httpPort}`);
  console.log(`🔄 Статус обновляется каждые ${config.updateInterval/1000} секунд`);
});

// Запуск HTTP сервера
app.listen(config.httpPort, '0.0.0.0', () => {
  console.log(`🌐 HTTP сервер слушает порт ${config.httpPort}`);
});

// Запуск Discord бота
client.login(config.discordBotToken)
  .catch(error => {
    console.error('❌ Ошибка входа в Discord:', error.message);
    process.exit(1);
  });

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});
