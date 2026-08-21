import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName("setmoney")
        .setDescription("Set a user's wallet or bank balance to a specific amount.")
        .setDMPermission(false) // Blocks execution in Direct Messages
        // Native Discord restriction: Only visible/usable by members with 'Manage Server'
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) 
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user whose balance you want to modify")
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("The exact amount of money to set")
                .setRequired(true)
                .setMinValue(0) // Blocks negative inputs natively
                .setMaxValue(1000000000) // Caps input to prevent integer overflow
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Where to place the money (Default: wallet)")
                .setRequired(false)
                .addChoices(
                    { name: "👛 Wallet Account", value: "wallet" },
                    { name: "🏦 Bank Account", value: "bank" }
                )
        ),

    async execute(interaction, guildConfig, client) {
        // Defer reply immediately to handle database read/writes safely
        await interaction.deferReply();

        const targetUser = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        const balanceType = interaction.options.getString("type") || "wallet";

        // Automated Validation Guard
        if (targetUser.bot) {
            return interaction.editReply("❌ Automated bot accounts cannot hold economy balances.");
        }

        try {
            // Database Execution Hook Placeholder
            // TODO: Connect this placeholder cleanly to your database layer framework!
            // Examples:
            // MongoDB: await EconomyModel.updateOne({ userId: targetUser.id, guildId: interaction.guildId }, { $set: { [balanceType]: amount } }, { upsert: true });
            // SQLite: await db.run(`UPDATE economy SET ${balanceType} = ? WHERE userId = ? AND guildId = ?`, [amount, targetUser.id, interaction.guildId]);

            const displayType = balanceType === "wallet" ? "👛 Wallet Balance" : "🏦 Bank Balance";
            
            const embed = createEmbed({
                title: "⚙️ Balance Database Override",
                description: `A user's economic ledger balance has been manually updated by a server manager.`
            })
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: "👤 Target User", value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
                { name: "📊 Ledger Type", value: displayType, inline: true },
                { name: "💰 New Total", value: `\`$${amount.toLocaleString()}\``, inline: false },
                { name: "🛠️ Authorized By", value: `${interaction.user.tag} 🛡️ (Manager)`, inline: false }
            )
            .setFooter({ text: "Server transaction log recorded cleanly." });

            await interaction.editReply({ embeds: [embed] });

            logger.info(`Manager balance update executed via slash command`, {
                operatorId: interaction.user.id,
                targetId: targetUser.id,
                amount: amount,
                type: balanceType,
                guildId: interaction.guildId
            });

        } catch (error) {
            logger.error(`Critical failure executing /setmoney database operations`, {
                error: error.message,
                operatorId: interaction.user.id,
                targetId: targetUser.id
            });
            return interaction.editReply("🚨 A severe internal database error occurred while attempting to write this transaction.");
        }
    },
};
