import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

// Import your central PostgreSQL pool client
// Adjust this path to wherever your db setup file is located
import pool from '../../database/postgres.js'; 

export default {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Restores a jailed member back to their normal state.')
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
        // Ephemeral reply so staff interactions remain private
        await interaction.deferReply({ flags: 64 }); // MessageFlags.Ephemeral is 1 << 6 or 64

        const targetUser = interaction.options.getUser('target');
        const restoreRoles = interaction.options.getBoolean('restore-roles');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;

        // Fetch the member from cache or API safely
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.editReply({ 
                embeds: [warningEmbed('Target user was not found or is no longer in this server.')] 
            });
        }

        // Find the "Jailed" role to verify active jail status
        const jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        if (!jailRole || !member.roles.cache.has(jailRole.id)) {
            return interaction.editReply({ 
                embeds: [warningEmbed('This user does not currently have the Jailed role.')] 
            });
        }

        try {
            if (restoreRoles) {
                // 1. Fetch old roles array from PostgreSQL
                const queryText = 'SELECT old_roles FROM jail_system WHERE guild_id = $1 AND user_id = $2';
                const dbResult = await pool.query(queryText, [guild.id, targetUser.id]);
                
                let rolesToRestore = [];
                if (dbResult.rows.length > 0 && dbResult.rows[0].old_roles) {
                    // Filter out any roles deleted from the server while they were locked up
                    rolesToRestore = dbResult.rows[0].old_roles.filter(roleId => guild.roles.cache.has(roleId));
                }

                // 2. Overwrite user roles completely (removes jail role + restores old ones)
                await member.roles.set(rolesToRestore, `Unjailed by ${interaction.user.tag}. Reason: ${reason}`);
            } else {
                // Just remove the jail role safely without re-applying old ones
                await member.roles.remove(jailRole, `Unjailed by ${interaction.user.tag} (No role restore). Reason: ${reason}`);
            }

            // 3. Delete the tracking row from your PostgreSQL table
            await pool.query('DELETE FROM jail_system WHERE guild_id = $1 AND user_id = $2', [guild.id, targetUser.id]);

            // 4. Safely DM the target user with an embed notification 
            // Built directly via successEmbed style format
            const releaseMessage = `You have been released from jail in **${guild.name}**.\n\n**Reason:** ${reason}\n**Roles Restored:** ${restoreRoles ? 'Yes' : 'No'}`;
            
            // Safety check against character truncation constraints
            const cleanMessage = releaseMessage.substring(0, EMBED_DESCRIPTION_LIMIT);
            const dmEmbed = successEmbed(cleanMessage);

            let dmSent = true;
            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                logger.warn(`Could not send unjail DM notification to user ${targetUser.id}. DMs are likely closed.`);
                dmSent = false;
            });

            // 5. Send success response back to the moderator
            const outcomeText = restoreRoles 
                ? `Successfully unjailed ${targetUser.tag} and restored their roles.` 
                : `Successfully unjailed ${targetUser.tag} without restoring roles.`;

            const userFeedback = dmSent ? outcomeText : `${outcomeText} *(User has private messages disabled)*`;
            await interaction.editReply({ embeds: [successEmbed(userFeedback)] });

        } catch (error) {
            logger.error(`Failed to unjail user ${targetUser.id} via PostgreSQL:`, error);
            await interaction.editReply({ 
                embeds: [warningEmbed('An internal error occurred while trying to process the database unjail workflow.')] 
            });
        }
    }
};
