import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

// Database connection instance setup
import db from '../../database/db.js'; 

export default {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Restores a jailed member back to their normal state and restores their old roles.')
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
        await interaction.deferReply({ flags: 64 });

        const targetUser = interaction.options.getUser('target');
        const restoreRoles = interaction.options.getBoolean('restore-roles');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;

        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return replyUserError(interaction, ErrorTypes.USER_NOT_FOUND, 'Target user is not in this server.');
        }

        const jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        if (!jailRole || !member.roles.cache.has(jailRole.id)) {
            return replyUserError(interaction, ErrorTypes.GENERIC_ERROR, 'This user is not currently jailed.');
        }

        try {
            if (restoreRoles) {
                // Fetch saved roles from database row
                const queryText = 'SELECT old_roles FROM jail_system WHERE guild_id = $1 AND user_id = $2';
                const dbResult = await db.query(queryText, [guild.id, targetUser.id]);
                
                let rolesToRestore = [];
                if (dbResult.rows && dbResult.rows.length > 0 && dbResult.rows[0].old_roles) {
                    rolesToRestore = dbResult.rows[0].old_roles.filter(roleId => guild.roles.cache.has(roleId));
                }

                await member.roles.set(rolesToRestore, `Unjailed by ${interaction.user.tag}. Reason: ${reason}`);
            } else {
                await member.roles.remove(jailRole, `Unjailed by ${interaction.user.tag} (No role restore). Reason: ${reason}`);
            }

            // Remove tracing row from database tracking table
            await db.query('DELETE FROM jail_system WHERE guild_id = $1 AND user_id = $2', [guild.id, targetUser.id]);

            const dmEmbed = createEmbed({
                title: '🔓 You Have Been Unjailed',
                description: `You have been released from jail in **${guild.name}**.\n\n**Reason:** ${reason}\n**Roles Restored:** ${restoreRoles ? 'Yes' : 'No'}`,
                color: getColor('success') || '#00ff00'
            });

            let dmSent = true;
            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                logger.warn(`Could not send unjail DM notification to user ${targetUser.id}. DMs are likely closed.`);
                dmSent = false;
            });

            await logEvent(guild, {
                action: 'Unjail',
                target: targetUser,
                executor: interaction.user,
                reason: `${reason} (Restore Roles: ${restoreRoles})`
            });

            const baseMsg = restoreRoles 
                ? `Successfully unjailed ${targetUser.tag} and restored their roles.` 
                : `Successfully unjailed ${targetUser.tag} without restoring roles.`;

            const finalMsg = dmSent ? baseMsg : `${baseMsg} *(User's DMs are closed)*`;
            await interaction.editReply({ embeds: [successEmbed(finalMsg)] });

        } catch (error) {
            logger.error(`Failed to unjail user ${targetUser.id}:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An error occurred while executing the database unjail sequence.');
        }
    }
};
