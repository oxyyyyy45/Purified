import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

// Import your Jail database model
import JailModel from '../../database/models/Jail.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Restores a jailed member back to their normal state and notifies them via DM.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The member to unjail')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('restore-roles')
                .setDescription('Whether to restore their original roles from the database')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for unjailing this member')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('target');
        const restoreRoles = interaction.options.getBoolean('restore-roles');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;

        // Fetch the member safely
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return replyUserError(interaction, ErrorTypes.USER_NOT_FOUND, 'Target user is not in this server.');
        }

        // Find the "Jailed" role to verify status
        const jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        if (!jailRole || !member.roles.cache.has(jailRole.id)) {
            return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, 'This user is not currently jailed.');
        }

        try {
            if (restoreRoles) {
                // 1. Look up the saved role data from the database
                const jailData = await JailModel.findOne({ guildId: guild.id, userId: targetUser.id });
                
                let rolesToRestore = [];
                if (jailData && jailData.oldRoles.length > 0) {
                    // Filter out any roles that might have been deleted from the server while they were jailed
                    rolesToRestore = jailData.oldRoles.filter(roleId => guild.roles.cache.has(roleId));
                }

                // 2. Put old roles back on the member (this clears the jail role and restores old ones)
                await member.roles.set(rolesToRestore, `Unjailed by ${interaction.user.tag}. Reason: ${reason}`);
            } else {
                // Just strip the jail role without adding back previous ones
                await member.roles.remove(jailRole, `Unjailed by ${interaction.user.tag} (No role restore). Reason: ${reason}`);
            }

            // 3. Clear the jail record from your database regardless of the choice
            await JailModel.deleteOne({ guildId: guild.id, userId: targetUser.id });

            // 4. Send the DM Notification to the user before they can potentially leave or block the bot
            const dmEmbed = createEmbed({
                title: '🔓 You Have Been Unjailed',
                description: `You have been released from jail in **${guild.name}**.\n\n**Reason:** ${reason}\n**Roles Restored:** ${restoreRoles ? 'Yes' : 'No'}`,
                color: getColor('success') || '#00ff00'
            });

            // Safe send block to avoid crashing if the user has DMs closed
            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                logger.warn(`Could not send unjail DM notification to user ${targetUser.id}. DMs are likely closed.`);
            });

            // 5. Log the moderation event
            await logEvent(guild, {
                action: 'Unjail',
                target: targetUser,
                executor: interaction.user,
                reason: `${reason} (Restore Roles: ${restoreRoles})`
            });

            // 6. Confirm success to the moderator
            const msgString = restoreRoles 
                ? `Successfully unjailed ${targetUser.tag} and restored their roles.` 
                : `Successfully unjailed ${targetUser.tag} without restoring roles.`;

            const responseEmbed = successEmbed(msgString);
            await interaction.editReply({ embeds: [responseEmbed] });

        } catch (error) {
            logger.error(`Failed to unjail user ${targetUser.id}:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An error occurred while executing the unjail sequence.');
        }
    }
};
