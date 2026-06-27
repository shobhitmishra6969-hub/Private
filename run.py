"""Entry point for ToneVibes."""
import asyncio

from bot import ToneVibes
import config
from utils import logger


async def main() -> None:
    if not config.TOKEN:
        logger.log("DISCORD_TOKEN is not set. Please set it as an environment secret.", "error")
        return

    bot = ToneVibes()
    try:
        await bot.start(config.TOKEN)
    except Exception as e:
        logger.log(f"Bot crashed: {e}", "error")
        raise


if __name__ == "__main__":
    asyncio.run(main())
