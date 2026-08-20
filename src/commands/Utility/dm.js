import { createEmbed, successEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    name: 'dm',
    description: 'Send a private direct message to a specific user through the bot.',

    async execute(message, args) {
        await withErrorHandling(message, async () => {
            // 1. Get the target user (handles mentions like @User or raw ID strings)
            const target = message.mentions.users.first() || await message.client.users.fetch(args[0]).catch(() => null);

            if (!target) {
                return await message.reply({
                    embeds: [warningEmbed('🚫 User Not Found', 'Please mention a user or provide a valid User ID.\nExample: `!dm @username hello there` or `!dm 1234567890 hello there`')]
                });
            }

            // 2. Extract the content message text safely
            const dmContent = args.slice(1).join(' ');

            if (!dmContent) {
                return await message.reply({
                    embeds: [warningEmbed('🚫 Empty Message', 'You must provide a message text content body to send to this user.')]
                });
            }

            // 3. Prevent the bot from messaging itself
            if (target.id === message.client.user.id) {
                return await message.reply({
                    embeds: [errorEmbed('🚫 Operation Cancelled', 'I cannot send a direct message to myself!')]
                });
            }

            // 4. Dispatch the payload structure smoothly
            try {
                const embeddedPayload = createEmbed({
                    title: `✉️ New Message from ${message.guild.name}`,
                    description: dmContent,
                    footer: { text: `Sent by author profile: ${message.author.tag}` },
                    color: 0x5865F2 // Classic blurple color scheme
                });

                await target.send({ embeds: [embeddedPayload] });

                // Confirm status code return to tracking window
                return await message.reply({
                    embeds: [successEmbed('✅ Message Delivered', `Your message was successfully routed directly to **${target.tag}**.`)]
                });

            } catch (error) {
                // Catches locked profiles, closed privacy scopes, or blocked application statuses safely
                return await message.reply({
                    embeds: [errorEmbed('❌ Delivery Failure', `Failed to send a DM to **${target.tag}**.\nPossible causes: Their DMs are completely closed, they blocked the bot, or they do not share a server with the bot.`)]
                });
            }
        });
    }
};
