import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    name: "firstmsg",
    description: "Get a link to the first message in this channel",
    category: "Utility",

    async execute(message, args, client, config) {
        // 1. Guard for DM channels (since .setDMPermission(false) was used)
        if (!message.guild) return;

        // 2. Fetch the oldest message in the channel
        const messages = await message.channel.messages.fetch({
            limit: 1,
            after: '1',
            cache: false
        }).catch((err) => {
            logger.error(`FirstMsg - failed to fetch messages`, {
                userId: message.author.id,
                channelId: message.channel.id,
                error: err.message
            });
            return null;
        });

        const firstMessage = messages?.first();

        // 3. Handle empty channels
        if (!firstMessage) {
            logger.info(`FirstMsg - no messages found in channel`, {
                userId: message.author.id,
                channelId: message.channel.id,
                guildId: message.guild.id
            });
            return await message.reply({
                embeds: [successEmbed('First Message', "No messages found in this channel!")],
            });
        }

        // 4. Generate the direct message link
        const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${firstMessage.id}`;

        // 5. Send the reply
        await message.reply({
            embeds: [
                successEmbed(
                    "First Message in #" + message.channel.name,
                    `Message Link: ${messageLink}`
                ),
            ],
        });

        // 6. Log completion
        logger.info(`FirstMsg command executed`, {
            userId: message.author.id,
            channelId: message.channel.id,
            messageId: firstMessage.id,
            guildId: message.guild.id
        });
    },
};
