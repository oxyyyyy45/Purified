import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('casino')
        .setDescription('Gamble your money away on high-stakes casino games!')
        // --- BLACKJACK SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('blackjack')
                .setDescription('Play a game of Blackjack against the dealer')
                .addIntegerOption(option =>
                    option
                        .setName('bet')
                        .setDescription('The amount of money you want to bet')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(1000000000000)
                )
        )
        // --- SLOTS SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('slots')
                .setDescription('Spin the slot machine for big multipliers')
                .addIntegerOption(option =>
                    option
                        .setName('bet')
                        .setDescription('The amount of money you want to bet')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(1000000000000)
                )
        )
        // --- ROULETTE SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('roulette')
                .setDescription('Bet on colors or specific categories in Roulette')
                .addStringOption(option =>
                    option
                        .setName('space')
                        .setDescription('What are you betting on?')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Red (2x Payout)', value: 'red' },
                            { name: 'Black (2x Payout)', value: 'black' },
                            { name: 'Green Zero (35x Payout)', value: 'green' },
                            { name: 'Even Numbers (2x Payout)', value: 'even' },
                            { name: 'Odd Numbers (2x Payout)', value: 'odd' }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName('bet')
                        .setDescription('The amount of money you want to bet')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(1000000000000)
                )
        ),

    async execute(interaction) {
        await withErrorHandling(interaction, async () => {
            const subcommand = interaction.options.getSubcommand();
            const userId = interaction.user.id;
            const bet = interaction.options.getInteger('bet');

            // 1. Economy Validation Balance Check
            const economy = await getEconomyData(userId);
            if (!economy || economy.balance < bet) {
                throw createError(
                    ErrorTypes.INSUFFICIENT_FUNDS, 
                    `You don't have enough money! Your current balance is $${economy?.balance || 0}.`
                );
            }

            // Deduct the bet instantly before running any game logic to prevent exploit loops
            economy.balance -= bet;
            await setEconomyData(userId, economy);


            // ==========================================
            // GAME 1: BLACKJACK
            // ==========================================
            if (subcommand === 'blackjack') {
                const suits = ['♠', '♥', '♦', '♣'];
                const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
                
                const createDeck = () => {
                    let deck = [];
                    for (let suit of suits) {
                        for (let value of values) {
                            deck.push({ value, suit });
                        }
                    }
                    return deck.sort(() => Math.random() - 0.5);
                };

                const calculateHand = (hand) => {
                    let value = 0;
                    let aces = 0;
                    for (let card of hand) {
                        if (['J', 'Q', 'K'].includes(card.value)) value += 10;
                        else if (card.value === 'A') { value += 11; aces++; }
                        else value += parseInt(card.value);
                    }
                    while (value > 21 && aces > 0) {
                        value -= 10;
                        aces--;
                    }
                    return value;
                };

                const formatHand = (hand) => hand.map(c => `\`${c.value}${c.suit}\``).join(' ');

                const deck = createDeck();
                const playerHand = [deck.pop(), deck.pop()];
                const dealerHand = [deck.pop(), deck.pop()];

                let playerScore = calculateHand(playerHand);
                let dealerScore = calculateHand(dealerHand);

                if (playerScore === 21) {
                    const payout = Math.floor(bet * 2.5);
                    const freshEco = await getEconomyData(userId);
                    freshEco.balance += payout;
                    await setEconomyData(userId, freshEco);
                    
                    return await interaction.reply({
                        embeds: [successEmbed(
                            '💥 Natural Blackjack!', 
                            `You dealt a perfect 21 right away!\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})\n\n**Earnings:** +$${payout.toLocaleString()} (Current Balance: $${freshEco.balance.toLocaleString()})`
                        )]
                    });
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary)
                );

                const getGameEmbed = (hideDealer = true) => {
                    const dealerText = hideDealer 
                        ? `\`${dealerHand[0].value}${dealerHand[0].suit}\` \`??\`` 
                        : `${formatHand(dealerHand)} (${dealerScore})`;

                    return createEmbed({
                        title: '🎰 Blackjack Table',
                        description: `You placed a bet of **$${bet.toLocaleString()}**`,
                        fields: [
                            { name: 'Your Hand', value: `${formatHand(playerHand)} (Total: **${playerScore}**)`, inline: true },
                            { name: 'Dealer Hand', value: `${dealerText}`, inline: true }
                        ],
                        color: 0x5865F2
                    });
                };

                const response = await interaction.reply({
                    embeds: [getGameEmbed(true)],
                    components: [row],
                    fetchReply: true
                });

                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60000
                });

                collector.on('collect', async (i) => {
                    if (i.user.id !== interaction.user.id) {
                        return await i.reply({ content: "This isn't your casino game!", flags: ['Ephemeral'] });
                    }
                    await i.deferUpdate();

                    if (i.customId === 'hit') {
                        playerHand.push(deck.pop());
                        playerScore = calculateHand(playerHand);

                        if (playerScore > 21) collector.stop('busted');
                        else if (playerScore === 21) collector.stop('player_21');
                        else await interaction.editReply({ embeds: [getGameEmbed(true)] });
                    } else if (i.customId === 'stand') {
                        collector.stop('stand');
                    }
                });

                collector.on('end', async (_, reason) => {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    );

                    if (reason === 'stand' || reason === 'player_21') {
                        while (dealerScore < 17) {
                            dealerHand.push(deck.pop());
                            dealerScore = calculateHand(dealerHand);
                        }
                    }

                    let endEmbed;
                    const finalUserEconomy = await getEconomyData(userId);

                    if (reason === 'busted' || playerScore > 21) {
                        endEmbed = warningEmbed('💸 Busted!', `Your total went over 21!\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})\n\n**Losses:** -$${bet.toLocaleString()}\n**Balance:** $${finalUserEconomy.balance.toLocaleString()}`);
} else if (reason === 'time') {endEmbed = infoEmbed('⏰ Game Forfeited', You took too long to make a move. The dealer takes your bet of **$${bet.toLocaleString()}**.);} else if (dealerScore > 21) {const winAmount = bet * 2;finalUserEconomy.balance += winAmount;await setEconomyData(userId, finalUserEconomy);endEmbed = successEmbed('🎉 Dealer Busted! You Win!', The dealer went over 21!\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})\n\n**Earnings:** +$${winAmount.toLocaleString()}\n**Balance:** $${finalUserEconomy.balance.toLocaleString()});} else if (playerScore > dealerScore) {const winAmount = bet * 2;finalUserEconomy.balance += winAmount;await setEconomyData(userId, finalUserEconomy);endEmbed = successEmbed('🏆 Victory!', You beat the dealer's hand!\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})\n\n**Earnings:** +$${winAmount.toLocaleString()}\n**Balance:** $${finalUserEconomy.balance.toLocaleString()});} else if (playerScore < dealerScore) {endEmbed = warningEmbed('📉 Dealer Wins', The house wins this round.\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})\n\n**Losses:** -$${bet.toLocaleString()}\n**Balance:** $${finalUserEconomy.balance.toLocaleString()});} else {finalUserEconomy.balance += bet;await setEconomyData(userId, finalUserEconomy);endEmbed = infoEmbed('🤝 Push', It's a dead tie. Your bet has been returned.\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})\n\n**Balance:** $${finalUserEconomy.balance.toLocaleString()});}await interaction.editReply({ embeds: [endEmbed], components: [disabledRow] });});}// ==========================================// GAME 2: SLOTS// ==========================================if (subcommand === 'slots') {const emojis = ['🍒', '🍋', '🍇', '🍊', '💎', '7️⃣'];const slot1 = emojis[Math.floor(Math.random() * emojis.length)];const slot2 = emojis[Math.floor(Math.random() * emojis.length)];const slot3 = emojis[Math.floor(Math.random() * emojis.length)];let multiplier = 0;let outcomeTitle = '❌ Better luck next time!';let isWin = false;// Win Conditionsif (slot1 === slot2 && slot2 === slot3) {isWin = true;if (slot1 === '7️⃣') { multiplier = 10; outcomeTitle = ' Jackpot! Lucky Sevens!'; }else if (slot1 === '💎') { multiplier = 5; outcomeTitle = '💎 Diamond Tier Win!'; }else { multiplier = 3; outcomeTitle = '🎉 Three of a Kind!'; }} else if (slot1 === slot2 || slot1 === slot3 || slot2 === slot3) {isWin = true;multiplier = 1.5;outcomeTitle = '💵 Double Match!';}const finalUserEconomy = await getEconomyData(userId);let descriptionText = [ ${slot1} | ${slot2} | ${slot3} ]\n\n;if (isWin) {const totalPayout = Math.floor(bet * multiplier);finalUserEconomy.balance += totalPayout;await setEconomyData(userId, finalUserEconomy);descriptionText += **Multiplier:** ${multiplier}x\n**Winnings:** +$${totalPayout.toLocaleString()};} else {descriptionText += **Losses:** -$${bet.toLocaleString()};}descriptionText += \n**Current Balance:** $${finalUserEconomy.balance.toLocaleString()};const embed = isWin? successEmbed(outcomeTitle, descriptionText): warningEmbed(outcomeTitle, descriptionText);return await interaction.reply({ embeds: [embed] });}// ==========================================// GAME 3: ROULETTE// ==========================================if (subcommand === 'roulette') {const space = interaction.options.getString('space');// Roulette Numbers (0-36) Configurationconst winningNumber = Math.floor(Math.random() * 37);let winningColor = 'black';const redNumbers =;if (winningNumber === 0) winningColor = 'green';else if (redNumbers.includes(winningNumber)) winningColor = 'red';let isWin = false;let multiplier = 2;if (space === 'red' && winningColor === 'red') isWin = true;if (space === 'black' && winningColor === 'black') isWin = true;if (space === 'green' && winningColor === 'green') { isWin = true; multiplier = 35; }if (space === 'even' && winningNumber !== 0 && winningNumber % 2 === 0) isWin = true;if (space === 'odd' && winningNumber % 2 !== 0) isWin = true;const finalUserEconomy = await getEconomyData(userId);const colorEmoji = winningColor === 'green' ? '🟢' : winningColor === 'red' ? '🔴' : '⚫';let resultText = The wheel spun and landed on: ${colorEmoji} **${winningNumber} (${winningColor.toUpperCase()})**\n\n;if (isWin) {const totalPayout = Math.floor(bet * multiplier);finalUserEconomy.balance += totalPayout;await setEconomyData(userId, finalUserEconomy);resultText += 🎉 **You won your bet!**\n**Earnings:** +$${totalPayout.toLocaleString()};} else {resultText += ❌ **House Wins!** Your bet selection didn't match.\n**Losses:** -$${bet.toLocaleString()};}resultText += \n**Current Balance:** $${finalUserEconomy.balance.toLocaleString()};const embed = isWin? successEmbed('🎡 Roulette Wheel Result', resultText): warningEmbed('🎡 Roulette Wheel Result', resultText);return await interaction.reply({ embeds: [embed] });}});}};
