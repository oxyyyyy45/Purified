import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Restores a jailed member back to their normal state.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The member to unjail')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for unjailing this member')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;

        // Fetch the member safely
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return replyUserError(interaction, ErrorTypes.USER_NOT_FOUND, 'Target user is not in this server.');
        }

        // Find the "Jailed" role to verify active status
        const jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        if (!jailRole || !member.roles.cache.has(jailRole.id)) {
            return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, 'This user is not currently jailed.');
        }

        try {
            // Remove the Jailed role from the member
            await member.roles.remove(jailRole, `Unjailed by ${interaction.user.tag}. Reason: ${reason}`);

            // Send private DM confirmation to the target user
            const dmEmbed = createEmbed({
                title: '🔓 You Have Been Unjailed',
                description: `You have been released from jail in **${guild.name}**.\n\n**Reason:** ${reason}`,
                color: getColor('success') || '#00ff00'
            });

            let dmSent = true;
            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                logger.warn(`Could not send unjail DM notification to user ${targetUser.id}. DMs are likely closed.`);
                dmSent = false;
            });

            // Log the moderation event
            await logEvent(guild, {
                action: 'Unjail',
                target: targetUser,
                executor: interaction.user,
                reason: reason
            });

            // Confirm success to the moderator
            const successText = dmSent 
                ? `Successfully unjailed ${targetUser.tag} and notified via DM.`
                : `Successfully unjailed ${targetUser.tag} (Could not send DM).`;

            const responseEmbed = successEmbed(successText);
            await interaction.editReply({ embeds: [responseEmbed] });

        } catch (error) {
            logger.error(`Failed to unjail user ${targetUser.id}:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An error occurred while executing the unjail sequence.');
        }
    }
};
