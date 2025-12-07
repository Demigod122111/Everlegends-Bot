const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const { pathfinder, goals: { GoalBlock } } = require('mineflayer-pathfinder');

const config = require('./settings.json');
const express = require('express');

const username = config['bot-account'].username;

const app = express();
app.get('/', (_, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

let bot = null;
let forceRestartTimer = null;

/* ───────────────────────────────────────────────
   Create / Restart Bot
────────────────────────────────────────────────── */
function createBot() {
  clearTimeout(forceRestartTimer);

  bot = mineflayer.createBot({
    username: username,
    password: config['bot-account'].password,
    auth: config['bot-account'].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);

  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);

  bot.settings.colorsEnabled = false;

  /* AUTO-RESTART EVERY 10 MINUTES */
  forceRestartTimer = setTimeout(() => {
    console.log("[AutoRestart] Restarting bot after 10 minutes...");
    safeRestartBot();
  }, 10 * 60 * 1000);

  /* AUTH HELPERS */
  function waitForChatMatch(keyword, timeout = 7000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        bot.removeListener('message', listener);
        reject("Timed out waiting for auth message");
      }, timeout);

      function listener(msg) {
        const message = msg.toString().toLowerCase();
        if (message.includes(keyword.toLowerCase())) {
          clearTimeout(timer);
          bot.removeListener('message', listener);
          resolve(message);
        }
      }

      bot.on('message', listener);
    });
  }

  async function sendRegister(pass) {
    bot.chat(`/register ${pass} ${pass}`);
    console.log("[Auth] Attempting register...");
    try {
      const msg = await waitForChatMatch("registered");
      console.log("[Auth] Registration OK:", msg);
    } catch (err) {
      console.log("[Auth] Register:", err);
    }
  }

  async function sendLogin(pass) {
    bot.chat(`/login ${pass}`);
    console.log("[Auth] Attempting login...");
    try {
      const msg = await waitForChatMatch("logged");
      console.log("[Auth] Login OK:", msg);
    } catch (err) {
      console.log("[Auth] Login:", err);
    }
  }

  /* ───────────────────────────────────────────────
      BOT EVENTS
  ────────────────────────────────────────────────── */
  bot.once('spawn', async () => {
    console.log(`[${username}] Joined server`);

    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      await sendRegister(password);
      await sendLogin(password);
    }

    // Chat messages
    if (config.utils['chat-messages'].enabled) {
      const msgs = config.utils['chat-messages'].messages;
      if (config.utils['chat-messages'].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(msgs[i]);
          i = (i + 1) % msgs.length;
        }, config.utils['chat-messages']['repeat-delay'] * 1000);
      } else {
        msgs.forEach(m => bot.chat(m));
      }
    }

    // Move to position
    if (config.position.enabled) {
      const pos = config.position;
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    // Anti AFK
    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
    }
	
	startRealPlayerSimulation();
  });

  bot.on('goal_reached', () => {
    console.log(`[${username}] Reached location: ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log(`[${username}] Bot died and respawned.`);
  });

  // Clean reconnect, but only when bot genuinely disconnects
  bot.on('end', () => {
    console.log("[Reconnect] Bot disconnected. Reconnecting...");
    safeRestartBot();
  });

  bot.on('kicked', reason => {
    console.log(`[${username}] Kicked:`, reason);
  });

  bot.on('error', err => {
    console.log("[ERROR]", err.message);
  });
}

/* Force restart the bot */
function safeRestartBot() {
  try {
    if (bot) bot.quit();
  } catch (e) {}
  setTimeout(createBot, config.utils['auto-recconect-delay'] || 3000);
}

function startRealPlayerSimulation() {
  console.log("[Simulation] Starting real-player movement…");

  // Random head movement every 2–5 seconds
  setInterval(() => {
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() * Math.PI / 3) - (Math.PI / 6);
    bot.look(yaw, pitch, true);
  }, 2000 + Math.random() * 3000);

  // Random walking behavior
  setInterval(() => {
    const actions = ["forward", "back", "left", "right", "none"];
    const action = actions[Math.floor(Math.random() * actions.length)];

    bot.setControlState("forward", false);
    bot.setControlState("back", false);
    bot.setControlState("left", false);
    bot.setControlState("right", false);

    if (action !== "none") {
      bot.setControlState(action, true);
    }

    // Walk for a short time then stop
    setTimeout(() => {
      bot.setControlState("forward", false);
      bot.setControlState("back", false);
      bot.setControlState("left", false);
      bot.setControlState("right", false);
    }, 800 + Math.random() * 1200);

  }, 3000 + Math.random() * 4000);

  // Jump occasionally
  setInterval(() => {
    bot.setControlState("jump", true);
    setTimeout(() => bot.setControlState("jump", false), 300);
  }, 7000 + Math.random() * 4000);

  // Swing arm randomly
  setInterval(() => {
    bot.swingArm("right");
  }, 5000 + Math.random() * 8000);
}

createBot();