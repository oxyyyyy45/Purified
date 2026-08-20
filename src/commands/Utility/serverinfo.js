import { ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    name: "serverinfo",
    description: "Get detailed information about the server",
    category: "Utility",

    async execute(message, args, config, client) {
        // Ensure command is run in a server
        if (!message.guild) {
            return message.reply("This command can only be used within a server.");
        }

        const guild = message.guild;

        try {
            // Fetch missing uncached structures
            const [owner, fetchedChannels, fetchedRoles] = await Promise.all([
                guild.fetchOwner(),
                guild.channels.fetch(),
                guild.roles.fetch()
            ]);

            const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

            // Detailed Channel Breakdown
            const textChannels = fetchedChannels.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = fetchedChannels.filter(c => c.type === ChannelType.GuildVoice).size;
            const categoryChannels = fetchedChannels.filter(c => c.type === ChannelType.GuildCategory).size;

            const embed = createEmbed({ 
                title: `Server Info: ${guild.name}`, 
                description: `**Server ID:** \`${guild.id}\`` 
            })
            .setThumbnail(guild.iconURL({ size: 256, forceStatic: false }) || null)
            .addFields(
                { name: "👑 Owner", value: `${owner.user.tag}\n(\`${owner.id}\`)`, inline: true },
                { name: "👥 Members", value: `${guild.memberCount.toLocaleString()}`, inline: true },
                { name: "🎭 Roles", value: `${fetchedRoles.size}`, inline: true },
                { 
                    name: "📁 Channels", 
                    value: `Total: ${fetchedChannels.size}\n💬 Text: ${textChannels}\n🔊 Voice: ${voiceChannels}\n🗂️ Categories: ${categoryChannels}`, 
                    inline: true 
                },
                {
                    name: "🚀 Boosts",
                    value: `Level ${guild.premiumTier}\n${guild.premiumSubscriptionCount} Boosts`,
                    inline: true,
                },
                {
                    name: "📅 Creation Date",
                    value: `<t:${createdTimestamp}:F>\n(<t:${createdTimestamp}:R>)`,
                    inline: true,
                },
            );

            await message.channel.send({ embeds: [embed] });

            logger.info(`ServerInfo prefix command executed`, {
                userId: message.author.id,
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount
            });

        } catch (error) {
            logger.error(`ServerInfo prefix command failed`, {
                userId: message.author.id,
                guildId: guild.id,
                error: error.message
            });
            await message.reply("An error occurred while fetching the server details.");
        }
    },
};
