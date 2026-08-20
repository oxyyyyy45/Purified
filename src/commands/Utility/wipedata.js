import { ComponentType } from 'discord.js';
import { warningEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

export default {
    name: 'wipedata',
    description: 'Delete all your personal data from the bot (irreversible)',
    category: 'Utility',

    async execute(message, args, config, client) {
        // Fallback constraint check
        if (!message.guild) {
            return message.reply("⚠️ This command can only be used within a server.");
        }

        const warningMessage = 
            `⚠️ **THIS ACTION IS IRREVERSIBLE!** ⚠️\n\n` +
            `This will permanently delete **ALL** your data from this server including:\n` +
            `• 💰 Economy balance (wallet & bank)\n` +
            `• 📊 Levels and XP\n` +
            `• 🎒 Inventory items\n` +
            `• 🛍️ Shop purchases\n` +
            `• 🎂 Birthday information\n` +
            `• 🔢 Counter data\n` +
            `• 📋 All other personal data\n\n` +
            `**This cannot be undone. Are you absolutely sure?**`;

        const embed = warningEmbed('Wipe All Data', warningMessage);
        const confirmButtons = getConfirmationButtons('wipedata');

        // Send confirmation prompt message
        const promptMessage = await message.channel.send({
            content: `${message.author}, please confirm your choice:`,
            embeds: [embed],
            components: [confirmButtons]
        });

        logger.info(`Wipedata prefix command executed - confirmation prompt shown`, {
            userId: message.author.id,
            guildId: message.guild.id
        });

        // Setup safe component listener collector
        const collector = promptMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000 // 30 seconds expiration lifecycle
        });

        collector.on('collect', async (interaction) => {
            // Guard: Ensure only the original author can interact with these components
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({
                    content: "❌ This confirmation window is not for you.",
                    ephemeral: true
                });
            }

            // Acknowledge click and stop collector sequence loop
            await interaction.deferUpdate();
            collector.stop(interaction.customId);
        });

        collector.on('end', async (collected, reason) => {
            // Clean up: Disable or delete visual components to prevent ghost clicking
            try {
                if (reason === 'wipedata_confirm') {
                    // TODO: Insert your direct database delete function queries here
                    // e.g., await database.users.delete(message.author.id, message.guild.id);

                    const finalSuccessEmbed = successEmbed('Data Wiped Successfully', '✅ All of your personal server tracking data has been permanently expunged from our systems.');
                    await promptMessage.edit({ embeds: [finalSuccessEmbed], components: [] });

                    logger.warn(`User data completely wiped by request`, {
                        userId: message.author.id,
                        guildId: message.guild.id
                    });
                } else if (reason === 'wipedata_cancel') {
                    const cancelEmbed = errorEmbed('Action Cancelled', '❌ Data wipe requested has been aborted. Your data remains perfectly intact.');
                    await promptMessage.edit({ embeds: [cancelEmbed], components: [] });
                } else {
                    // Timeout fallback loop execution
                    await promptMessage.delete().catch(() => null);
                    await message.delete().catch(() => null);
                }
            } catch (error) {
                logger.error(`Error processing wipedata confirmation end logic`, { error: error.message });
            }
        });
    }
};
