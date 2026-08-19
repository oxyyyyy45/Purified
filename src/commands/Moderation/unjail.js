import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

// Import your central PostgreSQL pool client
// Adjust this relative path to where your db connection pool file is located
import pool from '../../database/postgres.js'; 

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
        // Safe ephemeral flag usage to bypass MessageFlags property breaking changes
        await interaction.deferReply({ flags: 64 });

        const targetUser = interaction.options.getUser('target');
        const restoreRoles = interaction.options.getBoolean('restore-roles');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;

        // Fetch the member safely from cache/API
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
                // 1. Fetch old roles array from PostgreSQL
                const queryText = 'SELECT old_roles FROM jail_system WHERE guild_id = $1 AND user_id = $2';
                const dbResult = await pool.query(queryText, [guild.id, targetUser.id]);
                
                let rolesToRestore = [];
                // CRITICAL FIX: Must use dbResult.rows[0].old_roles, NOT dbResult.rows.old_roles
                if (dbResult.rows.length > 0 && dbResult.rows[0].old_roles) {
                    // Filter out any roles that might have been deleted from the server while they were jailed
                    rolesToRestore = dbResult.rows[0].old_roles.filter(roleId => guild.roles.cache.has(roleId));
                }

                // 2. Put old roles back on the member (this overwrites the jail role completely)
                await member.roles.set(rolesToRestore, `Unjailed by ${interaction.user.tag}. Reason: ${reason}`);
            } else {
                // Just strip the jail role without adding back previous ones
                await member.roles.remove(jailRole, `Unjailed by ${interaction.user.tag} (No role restore). Reason: ${reason}`);
            }

            // 3. Delete the tracking row from your PostgreSQL table
            await pool.query('DELETE FROM jail_system WHERE guild_id = $1 AND user_id = $2', [guild.id, targetUser.id]);

            // 4. Send the DM Notification to the user safely
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

            // 5. Log the moderation event via your handler
            await logEvent(guild, {
                action: 'Unjail',
                target: targetUser,
                executor: interaction.user,
                reason: `${reason} (Restore Roles: ${restoreRoles})`
            });

            // 6. Confirm success to the moderator
            const baseMsg = restoreRoles 
                ? `Successfully unjailed ${targetUser.tag} and restored their roles.` 
                : `Successfully unjailed ${targetUser.tag} without restoring roles.`;

            const finalMsg = dmSent ? baseMsg : `${baseMsg} *(User's DMs are closed)*`;
            await interaction.editReply({ embeds: [successEmbed(finalMsg)] });

        } catch (error) {
            logger.error(`Failed to unjail user ${targetUser.id} via PostgreSQL:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An error occurred while executing the PostgreSQL unjail sequence.');
        }
    }
};
