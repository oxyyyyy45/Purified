import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('jail')
        .setDescription('Jails a member by removing their roles and locking them in a jail channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The member to jail')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for jailing this member')
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

        // Check role hierarchy safety
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return replyUserError(interaction, ErrorTypes.INSUFFICIENT_PERMISSIONS, 'You cannot jail a member with an equal or higher role.');
        }

        try {
            // 1. Find or create the "Jailed" role
            let jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
            if (!jailRole) {
                jailRole = await guild.roles.create({
                    name: 'Jailed',
                    color: getColor('error') || '#ff0000',
                    reason: 'Required role for Purified jail system.'
                });
            }

            // 2. Find or create the text channel for jail
            let jailChannel = guild.channels.cache.find(c => c.name.toLowerCase() === 'jail' && c.type === ChannelType.GuildText);
            if (!jailChannel) {
                jailChannel = await guild.channels.create({
                    name: 'jail',
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionsBitField.Flags.ViewChannel]
                        },
                        {
                            id: jailRole.id,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ]
                        }
                    ]
                });
            }

            // 3. Save current roles (excluding @everyone) and strip them
            const oldRoleIds = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
            
            // Apply jail role and strip old ones
            await member.roles.set([jailRole.id], `Jailed by ${interaction.user.tag}. Reason: ${reason}`);

            // 4. Send notification inside the jail channel
            const alertEmbed = createEmbed({
                title: '🔒 You Have Been Jailed',
                description: `You were put in jail by ${interaction.user}.\n**Reason:** ${reason}`,
                color: getColor('error')
            });
            await jailChannel.send({ content: `${member}`, embeds: [alertEmbed] });

            // 5. Log the moderation event
            await logEvent(guild, {
                action: 'Jail',
                target: targetUser,
                executor: interaction.user,
                reason: reason,
                extraData: { previousRoles: oldRoleIds }
            });

            // 6. Confirm success to the moderator
            const responseEmbed = successEmbed(`Successfully jailed ${targetUser.tag}.`);
            await interaction.editReply({ embeds: [responseEmbed] });

        } catch (error) {
            logger.error(`Failed to jail user ${targetUser.id}:`, error);
            return replyUserError(interaction, ErrorTypes.INTERNAL_ERROR, 'An error occurred while executing the jail sequence.');
        }
    }
};
