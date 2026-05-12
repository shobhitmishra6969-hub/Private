function parseBoolean(value) {
    if (typeof value === "string") {
        value = value.trim().toLowerCase();
    }
    switch (value) {
        case true:
        case "true":
            return true;
        default:
            return false;
    }
}

function parseBoolean(value) {
    if (typeof value === "string") {
        value = value.trim().toLowerCase();
    }
    switch (value) {
        case true:
        case "true":
            return true;
        default:
            return false;
    }
}

module.exports = {
    token: process.env.DISCORD_TOKEN || "MTQ3ODI4NTMxMzg3NTkwMjUwNg.GfJh6G.Nd84gHYlashezFN0BXXOhdFrQrIcgWXQk9Q8Y4",
    prefix: process.env.BOT_PREFIX || ">",
    ownerID: process.env.OWNER_ID ? process.env.OWNER_ID.split(",") : ["1426569122224931010"],
    SpotifyID: process.env.SPOTIFY_CLIENT_ID || "85aab1d51a174aad9eed6d7989f530e6",
    SpotifySecret: process.env.SPOTIFY_CLIENT_SECRET || "b2ad05aa725e434c88776a1be8eab6c",
    mongourl: process.env.MONGO_URL || "mongodb+srv://codex:codex@cdx-us-1.zunskft.mongodb.net/?appName=cdx-us-1",
    color: process.env.BOT_COLOR || "#00D4FF",
    logs: process.env.LOGS_CHANNEL || "",
    node_source: process.env.NODE_SOURCE || "ytmsearch",
    lastfmKey: process.env.LASTFM_API_KEY || "YOUR_LASTFM_API_KEY",
    lastfmSecret: process.env.LASTFM_API_SECRET || "YOUR_LASTFM_API_SECRET",

    links: {
        BG: process.env.BG_URL || "",
        support: process.env.SUPPORT_URL || "https://discord.gg/your-invite-code",
        premium: process.env.PREMIUM_URL || "https://discord.gg/lovebite",
        invite: process.env.INVITE_URL || "https://discord.gg/lovebite",
        Shafed_Billa: "On Top??",
        power: "Powered By Psychotic Development",
        vanity: process.env.VANITY_URL || "https://discord.gg/your-vanity-url",
        guild: process.env.GUILD_ID || "GUILD_ID_HERE",
    },

    Webhooks: {
        black: process.env.WEBHOOK_BLACK || "https://discord.com/api/webhooks/1483329126361464903/YlTxKi8_v1JMW5YEv5qkU7MVyIgIFTHW3jT0YwmQU4YBxem4v9LQglVouqZPrQjv3_z3",
        player_create: process.env.WEBHOOK_PLAYER_CREATE || "https://discord.com/api/webhooks/1483329126361464903/YlTxKi8_v1JMW5YEv5qkU7MVyIgIFTHW3jT0YwmQU4YBxem4v9LQglVouqZPrQjv3_z3",
        player_delete: process.env.WEBHOOK_PLAYER_DELETE || "https://discord.com/api/webhooks/1483329126361464903/YlTxKi8_v1JMW5YEv5qkU7MVyIgIFTHW3jT0YwmQU4YBxem4v9LQglVouqZPrQjv3_z3",
        guild_join: process.env.WEBHOOK_GUILD_JOIN || "https://discord.com/api/webhooks/1483329126361464903/YlTxKi8_v1JMW5YEv5qkU7MVyIgIFTHW3jT0YwmQU4YBxem4v9LQglVouqZPrQjv3_z3",
        guild_leave: process.env.WEBHOOK_GUILD_LEAVE || "https://discord.com/api/webhooks/1483329126361464903/YlTxKi8_v1JMW5YEv5qkU7MVyIgIFTHW3jT0YwmQU4YBxem4v9LQglVouqZPrQjv3_z3",
        cmdrun: process.env.WEBHOOK_CMDRUN || "https://discord.com/api/webhooks/1483329126361464903/YlTxKi8_v1JMW5YEv5qkU7MVyIgIFTHW3jT0YwmQU4YBxem4v9LQglVouqZPrQjv3_z3",
    },

    nodes: [
        {
            name: process.env.LAVALINK_NODE_1_NAME || "Node 1",
            url: process.env.LAVALINK_NODE_1_URL || "lavalinkv4.serenetia.com:443",
            auth: process.env.LAVALINK_NODE_1_AUTH || "https://seretia.link/discord",
            secure: parseBoolean(process.env.LAVALINK_NODE_1_SECURE || "true"),
        },
        {
            name: process.env.LAVALINK_NODE_2_NAME || "Node 2",
            url: process.env.LAVALINK_NODE_2_URL || "lavalink.jirayu.net",
            auth: process.env.LAVALINK_NODE_2_AUTH || "youshallnotpass",
            secure: parseBoolean(process.env.LAVALINK_NODE_2_SECURE || "true"),
        },
        {
            name: process.env.LAVALINK_NODE_3_NAME || "Node 3",
            url: process.env.LAVALINK_NODE_3_URL || "lavalink-v4.triniumhost.com",
            auth: process.env.LAVALINK_NODE_3_AUTH || "free",
            secure: parseBoolean(process.env.LAVALINK_NODE_3_SECURE || "true"),
        }
    ],

    node_options: {
        moveOnDisconnect: false,
        resume: true,
        resumeTimeout: 60,
        resumeByLibrary: true,
        reconnectTries: 5,
        reconnectInterval: 5,
        restTimeout: 60000,
        voiceConnectionTimeout: 30000,
        userAgent: "psychotic",
    },
};
