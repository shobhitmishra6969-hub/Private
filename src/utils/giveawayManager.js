client.on('message', (message) => {
  if (message.content.startsWith('gcancel')) {
    message.channel.send(gcancelEmbed);
  } else if (message.content.startsWith('gedit')) {
    message.channel.send(geditEmbed);
  } else if (message.content.startsWith('gend')) {
    message.channel.send(gendEmbed);
  } else if (message.content.startsWith('giveawayconfig')) {
    message.channel.send(giveawayConfigEmbed);
  } else if (message.content.startsWith('glist')) {
    message.channel.send(glistEmbed);
  } else if (message.content.startsWith('greroll')) {
    message.channel.send(grerollEmbed);
  } else if (message.content.startsWith('gstart')) {
    message.channel.send(gstartEmbed);
  }
});