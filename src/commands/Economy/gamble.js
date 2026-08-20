import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    name: 'gamble',
    description: 'Risk your money on a 50/50 coinflip!',

    async execute(message, args) {
        await withErrorHandling(message, async () => {
            const userId = message.author.id;

            // 1. Parse and Validate Bet Amount
            const rawBet = args[0];

            if (!rawBet) {
                return await message.reply({
                    embeds: [warningEmbed('🚫 Missing Bet', 'Please specify an amount to gamble.\nExample: `!gamble 500` or `!gamble all`')]
                });
            }

            // 2. Fetch User Economy Profile
            const economy = await getEconomyData(userId);
            let bet = 0;

            // Support an "all-in" mechanic if they type !gamble all
            if (rawBet.toLowerCase() === 'all') {
                bet = economy ? economy.balance : 0;
            } else {
                bet = parseInt(rawBet);
            }

            // Validate Betting Limits
            if (isNaN(bet) || bet < 1 || bet > 1000000000000) {
                return await message.reply({
                    embeds: [warningEmbed('🚫 Invalid Bet', 'Provide a valid betting amount between **$1** and **$1,000,000,000,000**.')]
                });
            }

            // Verify User Funds
            if (!economy || economy.balance < bet) {
                throw createError(
                    ErrorTypes.INSUFFICIENT_FUNDS, 
                    `You don't have enough money! Your current balance is $${economy?.balance || 0}.`
                );
            }

            // 3. Roll the Dice (50% Chance)
            const isWin = Math.random() >= 0.5;

            if (isWin) {
                // Double the money: give back the bet + equal profit
                economy.balance += bet;
                await setEconomyData(userId, economy);

                return await message.reply({
                    embeds: [successEmbed(
                        '🟩 Winner!',
                        `The odds favored you! You won your bet!\n\n**Earnings:** +$${bet.toLocaleString()}\n**Current Balance:** $${economy.balance.toLocaleString()}`
                    )]
                });
            } else {
                // Deduct the bet amount
                economy.balance -= bet;
                await setEconomyData(userId, economy);

                return await message.reply({
                    embeds: [warningEmbed(
                        '🟥 Lost!',
                        `The house wins this round. Better luck next time!\n\n**Losses:** -$${bet.toLocaleString()}\n**Current Balance:** $${economy.balance.toLocaleString()}`
                    )]
                });
            }
        });
    }
};
