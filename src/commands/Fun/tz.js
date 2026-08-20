import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

const GEOCODING_URL = "https://open-meteo.com";

export default {
    name: "tz",
    description: "Display the actual local time of a city so it is visible to everyone universally as static text.",
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

            // 2. Format static time strings based on the target timezone
            // This reads the raw time on the wall in that exact city and outputs it as text.
            const now = new Date();

            const staticTime = now.toLocaleTimeString('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            const staticDate = now.toLocaleDateString('en-US', {
                timeZone: timezone,
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            // 3. Generate dynamic GMT offset string (e.g., "GMT-5" or "GMT+9")
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'shortOffset'
            }).formatToParts(now);
            const gmtOffset = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';

            // 4. Build and dispatch the finalized universal embed layout
            const embed = createEmbed({
                title: `🗺️ Timezone Checker: ${cityDisplay}, ${country}`,
                description: `This displays the actual wall-clock time right now in that region.`
            })
            .addFields(
                { 
                    name: "🕒 Current Local Time", 
                    value: `## ⏰ ${staticTime}`, 
                    inline: true 
                },
                { 
                    name: "📅 Current Date", 
                    value: `📅 ${staticDate}`, 
                    inline: true 
                },
                { 
                    name: "🌐 Timezone Region", 
                    value: `\`${timezone}\` (${gmtOffset})`, 
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
