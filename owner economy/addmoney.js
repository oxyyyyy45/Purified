import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

// Configuration: Insert your specific Discord User ID here
const OWNER_ID = "1283898163375116318"; 

export default {
    name: "addmoney",
    description: "Adds a specific amount of economy balance to a targeted user. (Bot Owner Only)",
    category: "Admin/Economy",

    async execute(message, args, config, client) {
        // 1. Strict Developer Security Check
        if (message.author.id !== OWNER_ID) {
            logger.warn(`Unauthorized execution attempt of !addmoney command`, {
                userId: message.author.id,
                guildId: message.guild?.id
            });
            // Fail silently or send an error card to keep developer tools secure
            return message.reply("❌ This is a developer-restricted command.");
        }

        // Fallback constraint check for server environments
        if (!message.guild) {
            return message.reply("⚠️ This command can only be used within a server.");
        }

        // 2. Validate essential text arguments are present
        if (!args || args.length < 2) {
            return message.reply("⚠️ Invalid Usage! Proper format: `!addmoney <@user/ID> <amount>`");
        }

        const targetArg = args[0];
        const amountArg = args[1];

        // 3. Resolve target user via mentions structure or cache lookup
        const targetUser = message.mentions.users.first() || client.users.cache.get(targetArg);

        if (!targetUser) {
            return message.reply("❌ Could not find that user. Please provide a valid user mention or their raw Snowflake ID.");
        }

        if (targetUser.bot) {
            return message.reply("❌ You cannot award economy balances to automated bot accounts.");
        }

        // 4. Parse and validate clean numeric inputs
        const moneyToAdd = parseInt(amountArg, 10);

        if (isNaN(moneyToAdd) || moneyToAdd <= 0) {
            return message.reply("❌ Please specify a valid, positive whole number for the economy allocation amount.");
        }

        if (moneyToAdd > 1000000000) { // Safety ceiling cap to avoid integer database corruption overflows
            return message.reply("⚠️ Transaction aborted. You cannot add more than 1,000,000,000 credits at one single time.");
        }

        try {
            // 5. Database execution node hooks
            // TODO: Connect this placeholder node cleanly to your specific database layer framework!
            // Examples based on popular structural frameworks:
            // SQLite: await db.run('UPDATE economy SET wallet = wallet + ? WHERE userId = ? AND guildId = ?', [moneyToAdd, targetUser.id, message.guild.id]);
            // MongoDB: await EconomyModel.updateOne({ userId: targetUser.id, guildId: message.guild.id }, { $inc: { wallet: moneyToAdd } }, { upsert: true });

            // 6. Build and dispatch complete administrative solution layout
            const embed = successEmbed(
                "💸 Balance Administered",
                `Successfully minted and allocated global server funds directly into the user account container.`
            )
            .addFields(
                { name: "👤 Recipient", value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
                { name: "💰 Funds Added", value: `\`$${moneyToAdd.toLocaleString()}\``, inline: true },
                { name: "🛠️ Authorized By", value: `${message.author.tag}`, inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setFooter({ text: "System Level Economy Override Logged" });

            await message.channel.send({ embeds: [embed] });

            logger.info(`Owner balance override executed successfully`, {
                operatorId: message.author.id,
                recipientId: targetUser.id,
                amount: moneyToAdd,
                guildId: message.guild.id
            });

        } catch (error) {
            logger.error(`Critical failure executing !addmoney database operations`, {
                error: error.message,
                operatorId: message.author.id,
                recipientId: targetUser.id
            });
            return message.reply("🚨 A severe internal system crash occurred while updating the user data profile registry.");
        }
    },
};
