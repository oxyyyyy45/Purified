import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Risk your money on a 50/50 coinflip!')
        .setDMPermission(false) // Blocks execution inside direct messages
        .addStringOption((option) =>
            option
                .setName('amount')
                .setDescription('The amount of money to bet (e.g., 500, or type "all" to go all-in)')
                .setRequired(true)
        ),

    async execute(interaction, guildConfig, client) {
        // Use your framework's safe defer helper to manage economy/database response times
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Gamble interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'gamble'
            });
            return;
        }

        const userId = interaction.user.id;
        const rawBet = interaction.options.getString('amount').trim();

        // Pass control to your framework's standardized custom error-handling wrapper setup
        await withErrorHandling(interaction, async () => {
            // 1. Fetch User Economy Profile
            const economy = await getEconomyData(userId);
            let bet = 0;

            // Support an "all-in" mechanic if they type "all"
            if (rawBet.toLowerCase() === 'all') {
                bet = economy ? economy.balance : 0;
            } else {
                bet = parseInt(rawBet, 10);
            }

            // 2. Validate Betting Limits
            if (isNaN(bet) || bet < 1 || bet > 1000000000000) {
                return await interaction.editReply({
                    embeds: [warningEmbed('🚫 Invalid Bet', 'Please provide a valid betting amount between **$1** and **$1,000,000,000,000**.')]
                });
            }

            // 3. Verify User Funds
            if (!economy || economy.balance < bet) {
                throw createError(
                    ErrorTypes.INSUFFICIENT_FUNDS, 
                    `You don't have enough money! Your current balance is **$${(economy?.balance || 0).toLocaleString()}**.`
                );
            }

            // 4. Roll the Dice (50% Chance)
            const isWin = Math.random() >= 0.5;

            if (isWin) {
                // Double the money: give back the bet + equal profit
                economy.balance += bet;
                await setEconomyData(userId, economy);

                logger.info(`[ECONOMY] User won gamble roll`, { userId, bet, newBalance: economy.balance });

                return await interaction.editReply({
                    embeds: [successEmbed(
                        '🟩 Winner!',
                        `The odds favored you! You won your bet!\n\n**Earnings:** +$${bet.toLocaleString()}\n**Current Balance:** $${economy.balance.toLocaleString()}`
                    )]
                });
            } else {
                // Deduct the bet amount
                economy.balance -= bet;
                await setEconomyData(userId, economy);

                logger.info(`[ECONOMY] User lost gamble roll`, { userId, bet, newBalance: economy.balance });

                return await interaction.editReply({
                    embeds: [warningEmbed(
                        '🟥 Lost!',
                        `The house wins this round. Better luck next time!\n\n**Losses:** -$${bet.toLocaleString()}\n**Current Balance:** $${economy.balance.toLocaleString()}`
                    )]
                });
            }
        });
    }
};
