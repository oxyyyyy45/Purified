import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    name: "pfp",
    description: "Display a user's avatar image",

    async execute(message, args) {
        // 1. Get the target user (mentions, raw ID from args, or fallback to message author)
        let user = message.mentions.users.first();
        
        if (!user && args && args[0]) {
            user = await message.client.users.fetch(args[0]).catch(() => null);
        }
        
        if (!user) {
            user = message.author;
        }

        // 2. Fetch the avatar URL using Discord.js v14 standards
        const avatarUrl = user.displayAvatarURL({ size: 2048, extension: 'png', forceStatic: false });

        // 3. Build and send the response embed
        const embed = createEmbed({ 
            title: `${user.username}'s Avatar`, 
            description: `[Download Link](${avatarUrl})` 
        })
        .setImage(avatarUrl);

        await message.reply({ embeds: [embed] });

        // 4. Log the action with updated message properties
        logger.info(`Pfp command executed`, {
            userId: message.author.id,
            targetUserId: user.id,
            guildId: message.guildId
        });
    }
};
