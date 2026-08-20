import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

const GEOCODING_URL = "https://open-meteo.com";

export default {
    name: "tz",
    description: "Display the absolute local time of a city so it is visible to everyone universally.",
    category: "Utility",

    async execute(message, args, config, client) {
        // Guard: Check if the user specified a location
        if (!args || args.length === 0) {
            return message.reply("⚠️ Please provide a location. Example: `?tz chicago` or `?tz london`");
        }

        const locationSearchQuery = args.join(" ");

        try {
            // 1. Fetch location data and target timezone string
            const geoResponse = await fetch(
                `${GEOCODING_URL}?name=${encodeURIComponent(locationSearchQuery)}&count=1`
            );

            if (!geoResponse.ok) throw new Error(`Geocoding API failed: ${geoResponse.status}`);
            const geoData = await geoResponse.json();

            // Guard: Location not found
            if (!geoData.results || geoData.results.length === 0) {
                return message.reply(`❌ Could not find a location matching **${locationSearchQuery}**.`);
            }

            const { name: cityDisplay, country, timezone } = geoData.results[0];

            if (!timezone) {
                return message.reply(`⚠️ Found **${cityDisplay}**, but could not resolve its timezone identifier.`);
            }

            // 2. Calculate the specific absolute timestamp for that city
            // This reads the clock time of the target timezone and matches it to a global UNIX timestamp
            const now = new Date();
            
            // Get target city's current local date/time parts using its specific timezone rule
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            
            const parts = formatter.formatToParts(now);
            const getPart = (type) => parts.find(p => p.type === type).value;

            // Reconstruct the exact date object string matching the target city's wall clock time
            const targetWallClockDate = new Date(
                `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`
            );

            // Turn it into a absolute UNIX value for Discord text engines to render
            const absoluteCityTimestamp = Math.floor(targetWallClockDate.getTime() / 1000);

            // 3. Build and dispatch the finalized global layout
            const embed = createEmbed({
                title: `🗺️ Timezone Converter: ${cityDisplay}, ${country}`,
                description: `This embed shows the actual current time inside that city. **Everyone reading this sees the exact same local time.**`
            })
            .addFields(
                { 
                    name: "🕒 Current Wall Clock Time", 
                    value: `### <t:${absoluteCityTimestamp}:t>`, 
                    inline: true 
                },
                { 
                    name: "📅 Current Calendar Date", 
                    value: `<t:${absoluteCityTimestamp}:d>`, 
                    inline: true 
                },
                { 
                    name: "🌐 Timezone Name", 
                    value: `\`${timezone}\``, 
                    inline: false 
                }
            )
            .setFooter({
                text: `Queried by ${message.author.username}`,
                iconURL: message.author.displayAvatarURL({ size: 32 })
            });

            await message.channel.send({ embeds: [embed] });

            logger.info(`Universal Timezone command executed`, {
                userId: message.author.id,
                location: cityDisplay,
                timezone: timezone
            });

        } catch (error) {
            logger.error(`Universal Timezone command failed`, { error: error.message });
            return message.reply("⚠️ An unexpected internal error occurred while formatting the timezone.");
        }
    },
};
