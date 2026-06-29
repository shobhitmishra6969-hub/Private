"""Discord v2 component builders and send helpers."""
from __future__ import annotations
from typing import Optional
import discord
import config

COLOR = config.COLOR


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


def _wrap(*containers: discord.ui.Container) -> discord.ui.LayoutView:
    """Wrap container(s) in a minimal non-interactive LayoutView."""
    lv = discord.ui.LayoutView(timeout=None)
    for c in containers:
        lv.add_item(c)
    return lv


async def send(
    ctx,
    *containers: discord.ui.Container,
    ephemeral: bool = False,
    delete_after: Optional[float] = None,
) -> None:
    """Universal v2 send — works for both prefix and slash commands."""
    view = _wrap(*containers)
    if hasattr(ctx, "interaction") and ctx.interaction:
        if ctx.interaction.response.is_done():
            await ctx.interaction.followup.send(view=view, ephemeral=ephemeral, components_v2=True)
        else:
            await ctx.interaction.response.send_message(view=view, ephemeral=ephemeral, components_v2=True)
    else:
        await ctx.reply(view=view, mention_author=False, delete_after=delete_after, components_v2=True)


async def channel_send(
    channel,
    *containers: discord.ui.Container,
    delete_after: Optional[float] = None,
) -> None:
    """Send v2 containers directly to a channel object (not ctx)."""
    view = _wrap(*containers)
    await channel.send(view=view, delete_after=delete_after, components_v2=True)
