import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

// Import your AutoResponse database model
import AutoResponseModel from '../../database/models/AutoResponse.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autoresponse-add')
        .setDescription('Sets up a trigger phrase that makes the bot respond with a custom message.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addStringOption(option => 
            option.setName('user-says')
                .setDescription('The text phrase the bot will watch for (case-insensitive)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('bot-says')
                .setDescription('The custom message the bot should reply with')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('match-type')
                .setDescription('Should the bot look for the exact sentence or anywhere in the message?')
                .setRequired(true)
                .addChoices(
                    { name: 'Anywhere in sentence', value: 'anywhere' },
                    { name: 'Exact match only', value: 'exact' }
                )),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userSays = interaction.options.getString('user-says').trim().toLowerCase();
        const botSays = interaction.options.getString('bot-says').trim();
        const matchType = interaction.options.getString('match-type');
        const guild = interaction.guild;

        // Validation bounds check
        if (userSays.length > 100) {
            return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, 'The trigger text must be 100 characters or less.');
        }
        if (botSays.length > 1500) {
            return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, 'The bot reply text must be 1500 characters or less.');
        }

        try {
            // Check if this keyword is already mapped in this guild
            const existing = await AutoResponseModel.findOne({ guildId: guild.id, trigger: userSays });
            if (existing) {
                return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, `An autoresponse for \`${userSays}\` already exists.`);
            }

            // Save the phrase configuration along with the matching type rule
            // Note: If your schema doesn't have matchType yet, MongoDB will save it dynamically as long as your Mongoose schema includes it.
            await AutoResponseModel.create({
                guildId: guild.id,
                trigger: userSays,
                response: botSays,
                matchType: matchType // Saves 'anywhere' or 'exact'
            });

            // Log setup actions to moderation log
            await logEvent(guild, {
                action: 'AutoResponse Add',
                target: null,
                executor: interaction.user,
                reason: `Mapped trigger "${userSays}" with type "${matchType}"`
            });

            // Return clean confirmation card
            const responseEmbed = createEmbed({
                title: '✨ Autoresponse Created',
                description: 'The bot configuration has been updated successfully.',
                color: getColor('success') || '#00ff00',
                fields: [
                    { name: 'When a user says:', value: `\`${userSays}\``, inline: true },
                    { name: 'Matching Behavior:', value: matchType === 'anywhere' ? '🔍 Anywhere in text' : '🔒 Exact match only', inline: true },
                    { name: 'The bot will reply:', value: botSays, inline: false }
                ]
            });

            await interaction.editReply({ embeds: [responseEmbed] });

        } catch (error) {
            logger.error(`Failed to map custom autoresponse in guild ${guild.id}:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An unexpected error occurred while writing to the database.');
        }
    }
};
