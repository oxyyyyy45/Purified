import { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    Collection
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Global Cache for Deleted Messages ---
if (!global.snipes) {
    global.snipes = new Collection();
}

// --- Help Settings ---
const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️", Moderation: "🛡️", Economy: "💰", Music: "🎵", 
    Fun: "🎮", Leveling: "📊", Utility: "🔧", Ticket: "🎫", 
    Welcome: "👋", Giveaway: "🎉", Counter: "🔢", Tools: "🛠️", 
    Search: "🔍", "Reaction Roles": "🎭", Community: "👥", 
    Birthday: "🎂", "Join To Create": "🔌", Verification: "✅"
};

let cachedOptions = null;

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function loadCategoryOptions() {
    if (cachedOptions) return cachedOptions;
    try {
        const commandsPath = path.join(__dirname, "../../commands");
        const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name)
            .sort();

        cachedOptions = [
            {
                label: "📋 All Commands",
                description: "Browse every available command in a single list",
                value: ALL_COMMANDS_ID,
            },
            ...categoryDirs.map((category) => {
                const categoryName = formatCategoryName(category);
                const icon = CATEGORY_ICONS[categoryName] || "🔍";
                return {
                    label: `${icon} ${categoryName}`,
                    description: `View commands in the ${categoryName} category`,
                    value: category,
                };
            }),
        ];
        return cachedOptions;
    } catch (error) {
        return [{ label: "📋 All Commands", value: ALL_COMMANDS_ID }];
    }
}

async function createInitialHelpMenu(client) {
    const options = await loadCategoryOptions();
    const botName = client?.user?.username || "Bot";
    
    const embed = createEmbed({
        title: `📖 ${botName} Help`,
        description: 'Set up your server, pick what to enable, then browse commands below.',
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 Getting Started',
                value: [
                    '**1. Launch setup** — Run `/configwizard` to configure prefix, mod role, and logs.',
                    '**2. Enable systems** — Use `/commands dashboard` to turn categories on or off.',
                    '**3. Browse commands** — Use the menu below to view categories and commands.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ How It Works',
                value: [
                    '• Dashboard commands manage each feature visually',
                    '• Settings are saved per server',
                    '• Slash commands and prefixes both work once enabled',
                ].join('\n'),
                inline: false,
            },
            {
                name: '\u200B',
                value: `-# ${botName} is [open source](https://youtu.be)`,
                inline: false,
            },
        ],
    });

    embed.setFooter({ text: "Made with ❤️" });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(CATEGORY_SELECT_ID, "Select to view the commands", options);
    const buttonRow = new ActionRowBuilder().addComponents(bugReportButton, supportButton);

    return { 
        embeds: [embed], 
        components: [selectRow, buttonRow].filter(row => row && row.components?.length > 0) 
    };
}

// --- Combined Module Export ---
export default {
    slashOnly: true,
    
    // Command is registered as base name '/s'
    data: new SlashCommandBuilder()
        .setName("s")
        .setDescription("Utility system command")
        .addSubcommand(sub => 
            sub.setName("help")
               .setDescription("Displays the help menu with all available commands")
        )
        .addSubcommand(sub => 
            sub.setName("snipe")
               .setDescription("Snipe the most recently deleted message in this channel")
        ),

    // Automatically binds the event listener to catch deleted messages
    initializeEvent(client) {
        client.on('messageDelete', (message) => {
            if (!message || message.author?.bot) return;

            global.snipes.set(message.channelId, {
                content: message.content || null,
                author: message.author,
                image: message.attachments.first()?.proxyURL || null,
                embeds: message.embeds || [],
                createdAt: message.createdAt
            });

            // Auto-clean cache item after 5 minutes
            setTimeout(() => {
                const activeSnipe = global.snipes.get(message.channelId);
                if (activeSnipe && activeSnipe.createdAt === message.createdAt) {
                    global.snipes.delete(message.channelId);
                }
            }, 5 * 60 * 1000);
        });
    },

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        const subCommand = interaction.options.getSubcommand();

        // 1. HELP HANDLER
        if (subCommand === "help") {
            const { embeds, components } = await createInitialHelpMenu(client);
            const message = await InteractionHelper.safeEditReply(interaction, { embeds, components });

            if (!message) return;

            const collector = message.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: HELP_MENU_TIMEOUT_MS
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    try {
                        if (!InteractionHelper.isInteractionValid(interaction)) return;
                        const closedEmbed = createEmbed({
                            title: "Help menu closed",
                            description: "Help menu closed due to inactivity. Use `/s help` again.",
                            color: "secondary",
                        });
                        await InteractionHelper.safeEditReply(interaction, { embeds: [closedEmbed], components: [] });
                    } catch (error) {}
                }
            });
            return;
        }

        // 2. SNIPE HANDLER
        if (subCommand === "snipe") {
            const snipe = global.snipes?.get(interaction.channelId);

            if (!snipe) {
                const noSnipeEmbed = createEmbed({
                    title: "❌ Nothing to snipe!",
                    description: "There are no recently deleted messages recorded in this channel.",
                    color: "danger"
                });
                return await InteractionHelper.safeEditReply(interaction, { embeds: [noSnipeEmbed] });
            }

            const embed = createEmbed({
                author: {
                    name: snipe.author.tag,
                    iconURL: snipe.author.displayAvatarURL({ dynamic: true })
                },
                description: snipe.content || "*[Message contained no text content]*",
                color: "primary"
            });

            if (snipe.image) embed.setImage(snipe.image);
            if (snipe.embeds.length > 0 && !snipe.content) {
                embed.setDescription("*[Deleted message contained an embed structure]*");
            }

            embed.setTimestamp(snipe.createdAt);
            embed.setFooter({ text: `Sniped by ${interaction.user.username}` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    },
};
