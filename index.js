const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with the service role key
const supabase = createClient(process.env.SUPABASE_URL, process.env.SERVICE_ROLE_KEY);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  {
    name: 'account',
    description: 'Checks the user\'s bank account and balance.',
  },
  {
    name: 'register',
    description: 'Register a new bank account with an initial balance of 250.0.',
  },
  {
    name: 'send',
    description: 'Send money to another user.',
    options: [
      {
        name: 'receiver',
        type: 6, // User mention type
        description: 'The user to send money to.',
        required: true,
      },
      {
        name: 'amount',
        type: 10, // Number type
        description: 'The amount to send.',
        required: true,
      },
    ],
  },
  {
    name: 'paybank',
    description: 'Pay money to Treasury.',
    options: [
      {
        name: 'amount',
        type: 10, // Number type
        description: 'The amount to pay.',
        required: true,
      },
    ],
  },
  {
    name: 'govsend',
    description: 'Send money as a government grant if you have the FOUNDER role.',
    options: [
      {
        name: 'receiver',
        type: 6, // User mention type
        description: 'The user to receive the money.',
        required: true,
      },
      {
        name: 'amount',
        type: 10, // Number type
        description: 'The amount to send.',
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'account') {
    await interaction.deferReply(); // Acknowledge the interaction

    const username = interaction.user.username;
    // Query the database to check if the user exists
    const { data, error } = await supabase
      .from('users') // Table name: users
      .select('wallet')
      .eq('discord_id', username); // Column name: discord_id

    if (error) {
      console.error('Database error:', error);
      await interaction.editReply('There was an error accessing the database.');
      return;
    }

    if (data.length > 0) {
      const balance = data[0].wallet;
      await interaction.editReply(`Your bank account exists with a balance of $${balance.toFixed(2)}.`);
    } else {
      await interaction.editReply('You do not have a bank account in the database.');
    }
  }

  if (interaction.commandName === 'register') {
    await interaction.deferReply(); // Acknowledge the interaction

    const username = interaction.user.username;

    try {
      // Check if the user already exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('discord_id', username);

      if (fetchError) {
        console.error('Database error:', fetchError);
        await interaction.editReply('There was an error accessing the database.');
        return;
      }

      if (existingUser.length > 0) {
        await interaction.editReply('You already have a bank account in the database.');
        return;
      }

      // Direct insertion using service role key
      const { error: insertError } = await supabase
        .from('users')
        .insert([{ discord_id: username, wallet: 250.0 }]);

      if (insertError) {
        console.error('Database error:', insertError);
        await interaction.editReply('There was an error creating your bank account.');
        return;
      }

      await interaction.editReply('Your bank account has been successfully created with a balance of $250.00!');
    } catch (error) {
      console.error('Unexpected error:', error);
      await interaction.editReply('An unexpected error occurred. Please try again later.');
    }
  }

  if (interaction.commandName === 'send') {
    await interaction.deferReply(); // Acknowledge the interaction

    const senderUsername = interaction.user.username;
    const receiver = interaction.options.getUser('receiver');
    const amount = interaction.options.getNumber('amount');

    if (!receiver || amount <= 0) {
      await interaction.editReply('Invalid receiver or amount. Please try again.');
      return;
    }

    const receiverUsername = receiver.username;

    try {
      // Fetch sender's wallet
      const { data: senderData, error: senderError } = await supabase
        .from('users')
        .select('wallet')
        .eq('discord_id', senderUsername);

      if (senderError || senderData.length === 0) {
        await interaction.editReply('You do not have a bank account.');
        return;
      }

      const senderBalance = senderData[0].wallet;

      if (senderBalance < amount) {
        await interaction.editReply('Insufficient balance to complete the transaction.');
        return;
      }

      // Fetch receiver's wallet
      const { data: receiverData, error: receiverError } = await supabase
        .from('users')
        .select('wallet')
        .eq('discord_id', receiverUsername);

      if (receiverError || receiverData.length === 0) {
        await interaction.editReply('The receiver does not have a bank account.');
        return;
      }

      const receiverBalance = receiverData[0].wallet;

      // Update both wallets
      const { error: updateSenderError } = await supabase
        .from('users')
        .update({ wallet: senderBalance - amount })
        .eq('discord_id', senderUsername);

      const { error: updateReceiverError } = await supabase
        .from('users')
        .update({ wallet: receiverBalance + amount })
        .eq('discord_id', receiverUsername);

      if (updateSenderError || updateReceiverError) {
        await interaction.editReply('Transaction failed due to a database error.');
        return;
      }

      await interaction.editReply(`Successfully sent $${amount.toFixed(2)} to ${receiverUsername}.`);
    } catch (error) {
      console.error('Unexpected error:', error);
      await interaction.editReply('An unexpected error occurred. Please try again later.');
    }
  }

  if (interaction.commandName === 'paybank') {
    await interaction.deferReply(); // Acknowledge the interaction

    const senderUsername = interaction.user.username;
    const amount = interaction.options.getNumber('amount');

    if (amount <= 0) {
      await interaction.editReply('Invalid amount. Please try again.');
      return;
    }

    const bankUsername = 'Treasury';

    try {
      // Fetch sender's wallet
      const { data: senderData, error: senderError } = await supabase
        .from('users')
        .select('wallet')
        .eq('discord_id', senderUsername);

      if (senderError || senderData.length === 0) {
        await interaction.editReply('You do not have a bank account.');
        return;
      }

      const senderBalance = senderData[0].wallet;

      if (senderBalance < amount) {
        await interaction.editReply('Insufficient balance to complete the transaction.');
        return;
      }

      // Fetch bank's wallet
      const { data: bankData, error: bankError } = await supabase
        .from('users')
        .select('wallet')
        .eq('discord_id', bankUsername);

      if (bankError || bankData.length === 0) {
        await interaction.editReply('The bank account could not be found.');
        return;
      }

      const bankBalance = bankData[0].wallet;

      // Update both wallets
      const { error: updateSenderError } = await supabase
        .from('users')
        .update({ wallet: senderBalance - amount })
        .eq('discord_id', senderUsername);

      const { error: updateBankError } = await supabase
        .from('users')
        .update({ wallet: bankBalance + amount })
        .eq('discord_id', bankUsername);

      if (updateSenderError || updateBankError) {
        await interaction.editReply('Transaction failed due to a database error.');
        return;
      }

      await interaction.editReply(`Successfully paid $${amount.toFixed(2)} to Treasury.`);
    } catch (error) {
      console.error('Unexpected error:', error);
      await interaction.editReply('An unexpected error occurred. Please try again later.');
    }
  }

  if (interaction.commandName === 'govsend') {
    await interaction.deferReply(); // Acknowledge the interaction

    const sender = interaction.member;
    const receiver = interaction.options.getUser('receiver');
    const amount = interaction.options.getNumber('amount');

    if (!sender.roles.cache.some(role => role.name === 'FOUNDER')) {
      await interaction.editReply('You do not have the required role to execute this command.');
      return;
    }

    if (!receiver || amount <= 0) {
      await interaction.editReply('Invalid receiver or amount. Please try again.');
      return;
    }

    const receiverUsername = receiver.username;

    try {
      // Fetch receiver's wallet
      const { data: receiverData, error: receiverError } = await supabase
        .from('users')
        .select('wallet')
        .eq('discord_id', receiverUsername);

      if (receiverError || receiverData.length === 0) {
        await interaction.editReply('The receiver does not have a bank account.');
        return;
      }

      const receiverBalance = receiverData[0].wallet;

      // Update receiver's wallet
      const { error: updateReceiverError } = await supabase
        .from('users')
        .update({ wallet: receiverBalance + amount })
        .eq('discord_id', receiverUsername);

      if (updateReceiverError) {
        await interaction.editReply('Transaction failed due to a database error.');
        return;
      }

      await interaction.editReply(`Successfully granted $${amount.toFixed(2)} to ${receiverUsername} as a government grant.`);
    } catch (error) {
      console.error('Unexpected error:', error);
      await interaction.editReply('An unexpected error occurred. Please try again later.');
    }
  }
});

client.login(process.env.TOKEN);