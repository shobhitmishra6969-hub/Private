

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { Kazagumo, Plugins } = require("kazagumo");
const { readdirSync, existsSync } = require("fs");
const { Connectors } = require("shoukaku");
const Spotify = require("kazagumo-spotify");
const { ClusterClient, getInfo } = require("discord-hybrid-sharding");
const loadPlayerManager = require("../commands/loaders/loadPlayerManager");
const permissionHandler = require("../events/Client/PremiumChecks");
const VoiceHealthMonitor = require("../utils/voiceHealthMonitor");

class MusicBot extends Client {
  constructor() {
    super({
      intents: 34803,
      rest: {
        timeout: 60000,
      },
      properties: {
        browser: "Discord Android",
      },
      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
      shards: getInfo().SHARD_LIST,
      shardCount: getInfo().TOTAL_SHARDS,
    });

    this.commands = new Collection();
    this.slashCommands = new Collection();
    this.config = require("../config.js");
    this.owners = this.config.ownerID;
    this.prefix = this.config.prefix;
    this.color = this.config.color;
    this.embedColor = this.config.color;
    this.button = require("../custom/button.js");
    this.embed = require("../custom/embed.js")(this.color);
    require("../custom/numformat")(this);
    this.aliases = new Collection();
    this.logger = require("../utils/logger.js");
    this.emoji = require("../emojis.js");
    this.cluster = new ClusterClient(this);
    if (!this.token) this.token = this.config.token;
    this.manager = null;
    this.spamMap = new Map();
    this.cooldowns = new Collection();
    this.voiceHealthMonitor = new VoiceHealthMonitor(this);

    this._initDatabase();
    this._startWebServer();
    permissionHandler(this);
    loadPlayerManager(this);
    [
      "loadClients",
      "loadCommands",
      "loadNodes",
      "loadPlayers",
    ].forEach((handler) => {
      require(`../commands/loaders/${handler}`)(this);
    });
  }
  _initDatabase() {
    try {
      const { getDb } = require("../database/index");
      getDb();
      this.logger.log("[DB] SQLite database connected", "ready");
    } catch (err) {
      this.logger.log(`[DB] SQLite connection error: ${err.stack}`, "error");
    }
  }

  _startWebServer() {
    try {
      const { startWebServer } = require("../webServer");
      startWebServer();
    } catch (err) {
      this.logger.log(`[WebServer] Failed to start: ${err.message}`, "warn");
    }
  }

  connect() {
    return super.login(this.token);
  }
}

module.exports = MusicBot;