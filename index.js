const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');

// Read config and data files
const config = require('./config.json');

// Set up the client with necessary intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Register slash commands
const commands = [
  new SlashCommandBuilder().setName('setup').setDescription('Set up the support ticket system'),
].map((command) => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// When the bot is ready
client.once('ready', () => {
  console.log('ALAQTIX bot is online!');
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'setup') {
    const setupEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Support Ticket System Setup')
      .setDescription('The ticket system setup is complete! The ticket panel will now be posted.');

    await interaction.reply({ embeds: [setupEmbed], ephemeral: true });

    const ticketPanelEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🎟️ Open a Support Ticket')
      .setDescription(
        'Please select a ticket type from the dropdown menu below to get started!'
      )
      .setFooter({ text: 'Support Ticket System' });

    const ticketMenu = new StringSelectMenuBuilder()
      .setCustomId('ticketMenu')
      .setPlaceholder('Select a ticket type...')
      .addOptions(
        {
          label: '❓ General Inquiries',
          description: 'Questions or general assistance.',
          value: 'general_inquiries',
        },
        {
          label: '🤖 Bot Issues',
          description: 'Report an issue with the bot.',
          value: 'bot_issues',
        },
        {
          label: '🔒 Account Issues',
          description: 'Help with your account or access.',
          value: 'account_issues',
        }
      );

    const row = new ActionRowBuilder().addComponents(ticketMenu);

    const ticketEmbedChannel = client.channels.cache.get(config.ticketEmbedChannelId);

    if (ticketEmbedChannel) {
      await ticketEmbedChannel.send({
        embeds: [ticketPanelEmbed],
        components: [row],
      });
    }
  }
});

// Handle dropdown menu interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'ticketMenu') {
    const selectedValue = interaction.values[0];

    const user = interaction.user;
    const ticketChannelName = `ticket-${user.username}`;

    // Check if the user already has an open ticket
    const existingChannel = interaction.guild.channels.cache.find(
      (channel) =>
        channel.name === ticketChannelName &&
        channel.topic === user.id
    );

    if (existingChannel) {
      return await interaction.reply({
        content: `You already have an open ticket: <#${existingChannel.id}>`,
        ephemeral: true,
      });
    }

    // Create a new ticket channel
    const ticketChannel = await interaction.guild.channels.create({
      name: ticketChannelName,
      type: 0, // GUILD_TEXT
      topic: user.id,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: ['ViewChannel'],
        },
        {
          id: user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          id: config.supportRoleId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
    });

    const ticketEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Support Ticket Created')
      .setDescription(`Thank you for creating a ticket for **${selectedValue.replace('_', ' ')}**.`)
      .setFooter({ text: 'Our support team will assist you shortly.' });

    const closeButton = new ButtonBuilder()
      .setCustomId('closeTicket')
      .setLabel('Close with Reason')
      .setStyle(ButtonStyle.Danger);

    const claimButton = new ButtonBuilder()
      .setCustomId('claimTicket')
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Primary);

    const actionRow = new ActionRowBuilder().addComponents(claimButton, closeButton);

    await ticketChannel.send({ content: `<@&${config.supportRoleId}>`, embeds: [ticketEmbed], components: [actionRow] });

    await interaction.reply({
      content: `Your ticket has been created: <#${ticketChannel.id}>`,
      ephemeral: true,
    });
  }
});

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const ticketChannel = interaction.channel;

  if (interaction.customId === 'claimTicket') {
    const claimedBy = interaction.user;
    const claimEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Ticket Claimed')
      .setDescription(`This ticket has been claimed by <@${claimedBy.id}>.`)
      .setFooter({ text: 'Support Ticket System' });

    await interaction.reply({ embeds: [claimEmbed] });
  }

  if (interaction.customId === 'closeTicket') {
    await interaction.reply({
      content: 'Please provide a reason for closing the ticket:',
      ephemeral: true,
    });

    const filter = (msg) => msg.author.id === interaction.user.id;
    const collector = ticketChannel.createMessageCollector({ filter, max: 1, time: 60000 });

    collector.on('collect', async (msg) => {
      const reason = msg.content;

      const closeEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Ticket Closed')
        .setDescription(`This ticket has been closed.\n**Reason:** ${reason}`)
        .setFooter({ text: 'Support Ticket System' });

      await ticketChannel.send({ embeds: [closeEmbed] });

      setTimeout(() => {
        ticketChannel.delete();
      }, 5000); // Deletes the ticket channel after 5 seconds
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.followUp({ content: 'No reason was provided. Ticket closing canceled.', ephemeral: true });
      }
    });
  }
});

// Log in with your bot token
client.login(config.token);

