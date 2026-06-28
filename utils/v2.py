"""Discord v2 component builders and send helpers."""
from __future__ import annotations
from typing import Optional
import discord
import config

COLOR = config.COLOR
FLAGS = discord.MessageFlags(components_v2=True)


def container(
    body: str,
    *,
    color: int = COLOR,
    thumbnail_url: Optional[str] = None,
    header: Optional[str] = None,
    footer: Optional[str] = None,
) -> discord.ui.Container:
    """Build a v2 Container with optional header, thumbnail, and footer."""
    children: list = []
    if header:
        children.append(discord.ui.TextDisplay(f"## {header}"))
        children.append(discord.ui.Separator())
    if thumbnail_url and body:
        children.append(discord.ui.Section(
            discord.ui.TextDisplay(body),
            accessory=discord.ui.Thumbnail(media=thumbnail_url),
        ))
    elif body:
        children.append(discord.ui.TextDisplay(body))
    if footer:
        children.append(discord.ui.Separator())
        children.append(discord.ui.TextDisplay(f"-# {footer}"))
    return discord.ui.Container(*children, accent_color=color)


def ok(text: str) -> discord.ui.Container:
    return container(f"✅  {text}")


def err(text: str) -> discord.ui.Container:
    return container(f"❌  {text}", color=0xFF5555)


def info(text: str) -> discord.ui.Container:
    return container(f"ℹ️  {text}")


async def send(
    ctx,
    *containers: discord.ui.Container,
    ephemeral: bool = False,
    delete_after: Optional[float] = None,
) -> None:
    """Universal v2 send helper — works for both prefix and slash commands."""
    comps = list(containers)
    if hasattr(ctx, "interaction") and ctx.interaction:
        if ctx.interaction.response.is_done():
            await ctx.interaction.followup.send(
                components=comps, flags=FLAGS, ephemeral=ephemeral
            )
        else:
            await ctx.interaction.response.send_message(
                components=comps, flags=FLAGS, ephemeral=ephemeral
            )
    else:
        await ctx.reply(
            components=comps, flags=FLAGS, mention_author=False, delete_after=delete_after
        )
