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
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.BOT_PREFIX || "+",
    ownerID: process.env.OWNER_ID ? process.env.OWNER_ID.split(",") : [],
    SpotifyID: process.env.SPOTIFY_CLIENT_ID || "e6b3483308204e9cb4a73930c7d31446",
    SpotifySecret: process.env.SPOTIFY_CLIENT_SECRET || "20828fb042414cf5b62e727d15712ba1",
    spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI || null,
    mongourl: process.env.MONGO_URL || null,
    color: process.env.BOT_COLOR || "#7B2FBE",
    logs: process.env.LOGS_CHANNEL || "",
    node_source: process.env.NODE_SOURCE || "ytmsearch",
    lastfmKey: process.env.LASTFM_API_KEY || "",
    lastfmSecret: process.env.LASTFM_API_SECRET || "",

    links: {
        BG: process.env.BG_URL || "",
        support: process.env.SUPPORT_URL || "https://discord.gg/your-invite-code",
        premium: process.env.PREMIUM_URL || "",
        invite: process.env.INVITE_URL || "",
        Shafed_Billa: "On Top??",
        power: "Powered By Psychotic Development",
        vanity: process.env.VANITY_URL || "",
        guild: process.env.GUILD_ID || "",
    },

    Webhooks: {
        black: process.env.WEBHOOK_BLACK || "",
        player_create: process.env.WEBHOOK_PLAYER_CREATE || "",
        player_delete: process.env.WEBHOOK_PLAYER_DELETE || "",
        guild_join: process.env.WEBHOOK_GUILD_JOIN || "",
        guild_leave: process.env.WEBHOOK_GUILD_LEAVE || "",
        cmdrun: process.env.WEBHOOK_CMDRUN || "",
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
    ],

    node_options: {
        moveOnDisconnect: true,
        resume: true,
        resumeTimeout: 60,
        resumeByLibrary: true,
        reconnectTries: 10,
        reconnectInterval: 15,
        restTimeout: 30000,
        voiceConnectionTimeout: 15000,
        userAgent: "ToneVibes/1.0",
        clientName: "ToneVibes",
    },
};
