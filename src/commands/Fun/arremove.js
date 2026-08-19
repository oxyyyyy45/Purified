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
        .setName('autoresponse-remove')
        .setDescription('Removes an existing custom automatic response trigger from the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addStringOption(option => 
            option.setName('trigger')
                .setDescription('The keyword or phrase you want to remove')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Clean inputs and normalize the trigger phrase to lowercase
        const trigger = interaction.options.getString('trigger').trim().toLowerCase();
        const guild = interaction.guild;

        try {
            // Check if the trigger even exists in the database for this server
            const existing = await AutoResponseModel.findOne({ guildId: guild.id, trigger: trigger });
            if (!existing) {
                return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, `The trigger phrase \`${trigger}\` could not be found.`);
            }

            // Delete the phrase configuration from the database
            await AutoResponseModel.deleteOne({ guildId: guild.id, trigger: trigger });

            // Log the management event to your moderation logs
            await logEvent(guild, {
                action: 'AutoResponse Remove',
                target: null,
                executor: interaction.user,
                reason: `Removed trigger "${trigger}"`
            });

            // Return success confirmation card
            const responseEmbed = successEmbed(`Successfully removed the autoresponse trigger for \`${trigger}\`.`);
            await interaction.editReply({ embeds: [responseEmbed] });

        } catch (error) {
            logger.error(`Failed to remove custom autoresponse in guild ${guild.id}:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An unexpected error occurred while deleting from the database.');
        }
    }
};
