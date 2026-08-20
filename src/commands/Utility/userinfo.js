import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    name: "userinfo",
    description: "Get detailed information about a user",
    category: "Utility",

    async execute(message, args, config, client) {
        // Fallback for DM execution safety
        const guild = message.guild;
        if (!guild) {
            return message.reply("This command can only be used within a server.");
        }

        try {
            let targetUser = message.author;

            // Robust target matching (Mentions, IDs, or usernames)
            if (args && args.length > 0) {
                const search = args.join(' ');
                
                // 1. Check for a direct mention or raw ID
                const mentionOrId = message.mentions.users.first() || client.users.cache.get(args[0]);
                
                if (mentionOrId) {
                    targetUser = mentionOrId;
                } else {
                    // 2. Search cache by username/display name
                    const foundMember = guild.members.cache.find(m => 
                        m.user.username.toLowerCase().includes(search.toLowerCase()) || 
                        m.displayName.toLowerCase().includes(search.toLowerCase())
                    );
                    if (foundMember) targetUser = foundMember.user;
                }
            }

            // Fetch member cleanly from the API if they are uncached
            const member = await guild.members.fetch(targetUser.id).catch(() => null);

            const createdTimestamp = Math.floor(targetUser.createdAt.getTime() / 1000);
            const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

            // Refined Role Display Logic
            let roleDisplay = "None";
            let keyPermissions = "None";

            if (member) {
                // Filter out @everyone and map into tag references
                const roles = member.roles.cache
                    .filter(r => r.id !== guild.id)
                    .sort((a, b) => b.position - a.position);

                if (roles.size > 0) {
                    const sliceCount = 5;
                    const mappedRoles = roles.map(r => r.toString());
                    roleDisplay = mappedRoles.slice(0, sliceCount).join(", ");
                    if (roles.size > sliceCount) {
                        roleDisplay += ` and ${roles.size - sliceCount} more...`;
                    }
                }

                // Identify critical administrative flags
                const perms = [];
                if (member.permissions.has("Administrator")) perms.push("Administrator");
                if (member.permissions.has("ManageGuild")) perms.push("Manage Server");
                if (member.permissions.has("BanMembers")) perms.push("Ban Members");
                if (member.permissions.has("KickMembers")) perms.push("Kick Members");
                if (perms.length > 0) keyPermissions = perms.join(", ");
            }

            const embed = createEmbed({ 
                title: `User Info: ${targetUser.username}`,
                description: `**User ID:** \`${targetUser.id}\``
            })
            .setThumbnail(targetUser.displayAvatarURL({ size: 256, forceStatic: false }))
            .addFields(
                { name: "🤖 Bot?", value: targetUser.bot ? "Yes" : "No", inline: true },
                { name: "👑 Highest Role", value: member?.roles?.highest?.id === guild.id ? "None" : `${member?.roles?.highest || "None"}`, inline: true },
                { name: "🛡️ Key Permissions", value: keyPermissions, inline: false },
                { name: "🎭 Roles Displayed", value: roleDisplay, inline: false },
                {
                    name: "📅 Account Created",
                    value: `<t:${createdTimestamp}:F> (<t:${createdTimestamp}:R>)`,
                    inline: false,
                },
                {
                    name: "📥 Joined Server",
                    value: joinedTimestamp ? `<t:${joinedTimestamp}:F> (<t:${joinedTimestamp}:R>)` : "Not a member of this server",
                    inline: false,
                },
            );

            await message.channel.send({ embeds: [embed] });

            logger.info(`UserInfo prefix command executed`, {
                userId: message.author.id,
                targetUserId: targetUser.id,
                guildId: guild.id
            });

        } catch (error) {
            logger.error(`UserInfo prefix command failed`, {
                userId: message.author.id,
                guildId: guild.id,
                error: error.message
            });
            await message.reply("An error occurred while fetching user data.");
        }
    },
};
