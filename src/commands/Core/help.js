import { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Cache categories globally to avoid repeated disk reads on every command call
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
        console.error("Failed to load help categories:", error);
        return [{ label: "📋 All Commands", value: ALL_COMMANDS_ID }];
    }
}

export async function createInitialHelpMenu(client) {
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
                value: `-# ${botName} is [open source](https://youtu.be/1jCZX8s3bJE?si=NPOYx-vxVE1I5vJK)`,
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
        .setURL("https://discord.gg/fbfHkVHPqK")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(CATEGORY_SELECT_ID, "Select to view the commands", options);
    const buttonRow = new ActionRowBuilder().addComponents(bugReportButton, supportButton);

    // Standard order puts the actionable Select Menu on top, utility buttons on bottom
    return { 
        embeds: [embed], 
        components: [selectRow, buttonRow].filter(row => row && row.components?.length > 0) 
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);
        const message = await InteractionHelper.safeEditReply(interaction, { embeds, components });

        if (!message) return;

        // Use a proper component collector instead of setTimeout to avoid memory leaks
        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: HELP_MENU_TIMEOUT_MS
        });

        // The external interaction handler will process buttons/selects, 
        // this collector purely handles the clean shutdown when it expires.
        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                try {
                    if (!InteractionHelper.isInteractionValid(interaction)) return;

                    const closedEmbed = createEmbed({
                        title: "Help menu closed",
                        description: "Help menu has been closed due to inactivity. Use `/help` again.",
                        color: "secondary",
                    });

                    await InteractionHelper.safeEditReply(interaction, { 
                        embeds: [closedEmbed], 
                        components: [] 
                    });
                } catch (error) {
                    // Fail silently if interaction expired or was deleted by user
                }
            }
        });
    },
};
