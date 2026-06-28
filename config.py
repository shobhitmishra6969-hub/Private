import os

def _bool(val: str | None, default: bool = False) -> bool:
    if val is None:
        return default
    return val.strip().lower() in ("true", "1", "yes")

TOKEN: str = os.getenv("DISCORD_TOKEN", "")
PREFIX: str = os.getenv("BOT_PREFIX", "+")
OWNER_IDS: list[int] = [int(x) for x in os.getenv("OWNER_ID", "").split(",") if x.strip().isdigit()]
COLOR: int = 0x7B2FBE

SPOTIFY_CLIENT_ID: str = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET: str = os.getenv("SPOTIFY_CLIENT_SECRET", "")
SPOTIFY_REDIRECT_URI: str | None = os.getenv("SPOTIFY_REDIRECT_URI")

LASTFM_KEY: str = os.getenv("LASTFM_API_KEY", "")
LASTFM_SECRET: str = os.getenv("LASTFM_API_SECRET", "")

LOGS_CHANNEL: str = os.getenv("LOGS_CHANNEL", "")
NODE_SOURCE: str = os.getenv("NODE_SOURCE", "ytmsearch")

SUPPORT_URL: str = os.getenv("SUPPORT_URL", "https://discord.gg/your-invite-code")
PREMIUM_URL: str = os.getenv("PREMIUM_URL", "")
INVITE_URL: str = os.getenv("INVITE_URL", "")
SOURCE_CODE_URL: str = os.getenv("SOURCE_CODE_URL", "https://github.com/")
GUILD_ID: str = os.getenv("GUILD_ID", "")
VANITY_URL: str = os.getenv("VANITY_URL", "")

WEBHOOKS: dict = {
    "blacklist":      os.getenv("WEBHOOK_BLACK", ""),
    "player_create":  os.getenv("WEBHOOK_PLAYER_CREATE", ""),
    "player_delete":  os.getenv("WEBHOOK_PLAYER_DELETE", ""),
    "guild_join":     os.getenv("WEBHOOK_GUILD_JOIN", ""),
    "guild_leave":    os.getenv("WEBHOOK_GUILD_LEAVE", ""),
    "cmdrun":         os.getenv("WEBHOOK_CMDRUN", ""),
}

NODES: list[dict] = [
    {
        "identifier": os.getenv("LAVALINK_NODE_1_NAME", "Node 1"),
        "uri": ("https://" if _bool(os.getenv("LAVALINK_NODE_1_SECURE", "true"), True) else "http://")
               + os.getenv("LAVALINK_NODE_1_URL", "lavalinkv4.serenetia.com:443"),
        "password": os.getenv("LAVALINK_NODE_1_AUTH", "https://seretia.link/discord"),
        "retries": 3,           # fail fast → quicker fallback to next node
        "resume_timeout": 90,   # give session time to resume after blip
        "request_timeout": 8.0, # tight deadline; dead nodes fail in <8 s
    },
    {
        "identifier": os.getenv("LAVALINK_NODE_2_NAME", "Node 2"),
        "uri": ("https://" if _bool(os.getenv("LAVALINK_NODE_2_SECURE", "true"), True) else "http://")
               + os.getenv("LAVALINK_NODE_2_URL", "lavalink.jirayu.net"),
        "password": os.getenv("LAVALINK_NODE_2_AUTH", "youshallnotpass"),
        "retries": 3,
        "resume_timeout": 90,
        "request_timeout": 8.0,
    },
]
