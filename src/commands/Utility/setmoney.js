import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

// Configuration: Insert your specific Discord User ID here
const OWNER_ID = "1283898163375116318"; 

export default {
    data: new SlashCommandBuilder()
        .setName("setmoney")
        .setDescription("Set a user's wallet or bank balance to a specific amount.")
        .setDMPermission(false) // Blocks execution in Direct Messages
        // Native Discord restriction: Requires 'Manage Server' permission by default
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
                .setMinValue(0) // Automatically validates that inputs cannot be negative
                .setMaxValue(1000000000) // Safety ceiling cap to prevent integer overflow errors
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
        // 1. Dual-Layer Bypass Security Check
        const isOwner = interaction.user.id === OWNER_ID;
        const isManager = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

        // If they are neither the hardcoded owner nor a server manager, reject them
        if (!isOwner && !isManager) {
            logger.warn(`Unauthorized bypass attempt on /setmoney command`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: "❌ You do not have the required permissions (`Manage Server` or `Bot Owner`) to use this command.",
                ephemeral: true // Visible only to the unauthorized user
            });
        }

        // Defer reply safely to buy time for database operations
        await interaction.deferReply();

        const targetUser = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        const balanceType = interaction.options.getString("type") || "wallet";

        // 2. Automated Validation Guards
        if (targetUser.bot) {
            return interaction.editReply("❌ Automated bot accounts cannot hold economy balances.");
        }

        try {
            // 3. Database Execution Node Hooks
            // TODO: Connect this placeholder node cleanly to your specific database layer framework!
            // Examples based on popular structural frameworks:
            // MongoDB: await EconomyModel.updateOne({ userId: targetUser.id, guildId: interaction.guildId }, { $set: { [balanceType]: amount } }, { upsert: true });
            // SQLite: await db.run(`UPDATE economy SET ${balanceType} = ? WHERE userId = ? AND guildId = ?`, [amount, targetUser.id, interaction.guildId]);

            // 4. Build and dispatch complete administrative solution layout
            const displayType = balanceType === "wallet" ? "👛 Wallet Balance" : "🏦 Bank Balance";
            
            const embed = createEmbed({
                title: "⚙️ Balance Database Override",
                description: `A user's economic ledger balance has been manually updated by a network administrator.`
            })
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: "👤 Target User", value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
                { name: "📊 Ledger Type", value: displayType, inline: true },
                { name: "💰 New Total", value: `\`$${amount.toLocaleString()}\``, inline: false },
                { name: "🛠️ Authorized By", value: `${interaction.user.tag} ${isOwner ? "👑 (Bot Owner)" : "🛡️ (Manager)"}`, inline: false }
            )
            .setFooter({ text: "System-wide transaction log recorded cleanly." });

            await interaction.editReply({ embeds: [embed] });

            logger.info(`Administrative balance update executed via slash command`, {
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
            return interaction.editReply("🚨 A severe internal database crash occurred while attempting to write this transaction.");
        }
    },
};
