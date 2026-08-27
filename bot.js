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
      client.user.setPresence({
        activities: [{ name: 'Сервер выключен', type: Discord.ActivityType.Watching }],
        status: 'idle'
      });
      console.log('⚠️ Сервер не отвечает');
    }
  } catch (error) {
    client.user.setPresence({
      activities: [{ name: 'Сервер выключен', type: Discord.ActivityType.Watching }],
      status: 'idle'
    });
    console.log('⚠️ Ошибка подключения к GMod серверу:', error.message);
  }
}

// ============= ОБРАБОТЧИК GET ЗАПРОСОВ (ДЛЯ LUA) =============
app.get('/log', (req, res) => {
  const token = req.query.token;
  const message = req.query.message;
  const color = parseInt(req.query.color) || 3447003;

  console.log(`📨 GET запрос от GMod`);
  console.log(`  Token: ${token}`);
  console.log(`  Message: ${message}`);
  console.log(`  Color: ${color}`);

  // Проверка токена
  if (token !== config.authToken) {
    console.log('❌ Неверный токен!');
    return res.status(401).send('Неверный токен');
  }

  if (!logChannel) {
    console.log('❌ Канал логов не найден!');
    return res.status(500).send('Канал логов не найден');
  }

  // Отправка сообщения в Discord
  logChannel.send(message)
    .then(() => {
      console.log('✅ Сообщение отправлено в Discord');
      res.send('OK');
    })
    .catch((error) => {
      console.error('❌ Ошибка отправки:', error);
      res.status(500).send('Ошибка отправки сообщения');
    });
});

// ============= ОБРАБОТЧИК POST ЗАПРОСОВ (ДЛЯ СОВРЕМЕННЫХ ВЕРСИЙ) =============
app.post('/log', (req, res) => {
  const { token, message, color } = req.body;
  
  console.log('📨 POST запрос от GMod');
  console.log(`  Token: ${token}`);
  console.log(`  Message: ${message}`);
  
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

// ============= ГЛАВНАЯ СТРАНИЦА (ПРОВЕРКА РАБОТЫ) =============
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    bot: client.user ? client.user.tag : 'не запущен',
    server: 'GMod Discord Bot',
    endpoints: {
      '/': 'Информация о боте',
      '/log (GET)': 'Отправка логов через GET (для старых версий GMod)',
      '/log (POST)': 'Отправка логов через POST (для новых версий GMod)'
    }
  });
});

// ============= ЗАПУСК БОТА =============

// Событие готовности бота
client.once('ready', () => {
  console.log(`✅ Бот запущен: ${client.user.tag}`);
  console.log(`📊 ID бота: ${client.user.id}`);
  
  // Получение канала для логов
  logChannel = client.channels.cache.get(config.logChannelId);
  if (logChannel) {
    console.log(`✅ Канал логов найден: #${logChannel.name} (${logChannel.id})`);
    logChannel.send('🟢 **Бот запущен и готов к работе!**');
  } else {
    console.error('❌ Канал логов НЕ НАЙДЕН!');
    console.log(`🔍 Проверьте LOG_CHANNEL_ID: ${config.logChannelId}`);
    console.log(`📋 Доступные каналы:`);
    client.channels.cache.forEach(ch => {
      if (ch.type === 0) { // Текстовые каналы
        console.log(`  - #${ch.name} (${ch.id})`);
      }
    });
  }

  // Первоначальное обновление статуса
  setTimeout(() => {
    updateStatus();
  }, 2000);
  
  // Периодическое обновление статуса
  setInterval(updateStatus, config.updateInterval);
  
  console.log(`🚀 HTTP сервер запущен на порту ${config.httpPort}`);
  console.log(`🔄 Статус обновляется каждые ${config.updateInterval/1000} секунд`);
  console.log(`🔗 URL бота: https://gmod-discord-bot.onrender.com`);
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

// Обработка завершения
process.on('SIGTERM', () => {
  console.log('🛑 Получен сигнал завершения. Бот останавливается...');
  if (logChannel) {
    logChannel.send('🔴 **Бот останавливается...**');
  }
  client.destroy();
  process.exit(0);
});
